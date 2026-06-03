# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Nhập hàng → tồn kho thật (real stock-in).

The owner records incoming stock; ERPNext posts the Stock Ledger (and, with perpetual
inventory, the GL) so on-hand quantity becomes real instead of a manual status. Import
cost (giá nhập / valuation) is owner-only and never enters staff/kiosk DTOs.

Built on ERPNext's native Stock Entry (Material Receipt). The owner role usually lacks
Stock submit permission, so the document is created/submitted privileged (as the debt
flow does) AFTER the owner guard passes — ERPNext stays the source of truth.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt

from cago.api import debt
from cago.cago.doctype.cago_owner_action_log.cago_owner_action_log import record_action
from cago.utils import dto
from cago.utils.permissions import ensure_cap, ensure_internal, ensure_lang
from cago.utils.privileged import as_user


def _default_warehouse():
	company = frappe.defaults.get_global_default("company") or (frappe.get_all("Company", pluck="name") or [None])[0]
	for wh in ("Stores", "Finished Goods"):
		w = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0, "warehouse_name": wh}, "name")
		if w:
			return w
	return frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")


@frappe.whitelist()
def get_stock(item_code):
	"""On-hand quantity (real, from ERPNext Bin) + stock unit. Staff may view.

	For batch-tracked items also returns the batches, so stock-in can be assigned to a lô.
	"""
	ensure_internal()
	has_batch = bool(frappe.db.get_value("Item", item_code, "has_batch_no"))
	batches = []
	if has_batch:
		batches = [
			{"batch_id": r.batch_id, "expiry_date": r.expiry_date}
			for r in frappe.get_all(
				"Batch", filters={"item": item_code}, fields=["batch_id", "expiry_date"], order_by="expiry_date asc"
			)
		]
	return {
		"qty": flt(dto.get_actual_qty(item_code)),
		"uom": frappe.db.get_value("Item", item_code, "stock_uom"),
		"has_batch": has_batch,
		"batches": batches,
	}


@frappe.whitelist()
def receive_stock(item_code, qty, cost_rate=None, batch_no=None, invoiced=1, invoice_image=None):
	"""Record incoming stock (Material Receipt). `cost_rate` = giá nhập per stock unit
	(optional; sets valuation). Batch-tracked items require `batch_no`. `invoiced` flags whether
	this receipt had an official invoice (off-book portions still count as real stock+cost).
	Returns new on-hand."""
	ensure_cap("stock")
	if not frappe.db.exists("Item", item_code):
		frappe.throw(_("Không tìm thấy sản phẩm."))
	qty = flt(qty)
	if qty <= 0:
		frappe.throw(_("Số lượng nhập phải lớn hơn 0."))
	warehouse = _default_warehouse()
	if not warehouse:
		frappe.throw(_("Chưa cấu hình kho."))
	if frappe.db.get_value("Item", item_code, "has_batch_no"):
		if not batch_no:
			frappe.throw(_("Sản phẩm quản lý theo lô — chọn mã lô khi nhập (thêm lô ở mục Lô & hạn dùng)."))
		if not frappe.db.exists("Batch", {"batch_id": batch_no, "item": item_code}):
			frappe.throw(_("Lô không tồn tại cho sản phẩm này."))
	ensure_lang()

	with as_user("Administrator"):  # owner lacks Stock submit perm; ERPNext still validates the doc
		item = {"item_code": item_code, "qty": qty, "t_warehouse": warehouse}
		if cost_rate and flt(cost_rate) > 0:
			item["basic_rate"] = flt(cost_rate)
		else:
			# No cost given: allow a quantity-only receipt. Under perpetual inventory a
			# Material Receipt needs a valuation rate, and an item with no prior valuation
			# would otherwise fail on its first stock-in. Owner can enter cost for accuracy.
			item["allow_zero_valuation_rate"] = 1
		if batch_no:
			# legacy batch field (avoids requiring the Serial & Batch Bundle setting)
			item["use_serial_batch_fields"] = 1
			item["batch_no"] = batch_no
		se = frappe.get_doc(
			{
				"doctype": "Stock Entry",
				"stock_entry_type": "Material Receipt",
				"to_warehouse": warehouse,
				"cago_invoiced": cint(invoiced),
				"cago_invoice_image": invoice_image or None,
				"items": [item],
			}
		)
		se.insert(ignore_permissions=True)
		se.submit()
		entry = se.name

	# Audit who received the stock — the Stock Entry is posted under Administrator (owner lacks
	# Stock submit), so its `owner` is Administrator; this log keeps the real actor + qty/cost/lô.
	qn = int(flt(qty)) if flt(qty) == int(flt(qty)) else round(flt(qty), 2)
	note = f"Nhập {qn}{(' · giá vốn ' + dto.format_price(flt(cost_rate))) if cost_rate else ''}{(' · lô ' + batch_no) if batch_no else ''}"
	record_action("Other", ref_doctype="Item", ref_name=item_code, new_value=note)
	frappe.db.commit()  # commit as the real user, after restoring the session
	return {"entry": entry, "qty": flt(dto.get_actual_qty(item_code))}


@frappe.whitelist()
def receive_history(start=0, limit=30):
	"""Owner: recent stock-ins (Material Receipts) with their saved invoice photo + có/không HĐ flag.
	Lets the owner review chứng từ later. Owner-only (shows giá vốn)."""
	ensure_cap("stock")
	rows = frappe.get_all(
		"Stock Entry",
		filters={"stock_entry_type": "Material Receipt", "docstatus": 1},
		fields=["name", "posting_date", "cago_invoiced", "cago_invoice_image", "total_incoming_value", "creation"],
		order_by="creation desc",
		limit=cint(limit),
		limit_start=cint(start),
	)
	out = []
	for r in rows:
		dets = frappe.get_all(
			"Stock Entry Detail",
			filters={"parent": r.name},
			fields=["item_code", "qty", "uom", "amount"],
		)
		lines = [
			{
				"name": frappe.db.get_value("Item", d.item_code, "cago_display_name") or frappe.db.get_value("Item", d.item_code, "item_name") or d.item_code,
				"qty": flt(d.qty),
				"uom": d.uom,
				"amount_text": dto.format_price(d.amount) if d.amount else "",
			}
			for d in dets
		]
		out.append(
			{
				"entry": r.name,
				"date": str(r.posting_date),
				"invoiced": bool(r.cago_invoiced),
				"image": r.cago_invoice_image,
				"total_text": dto.format_price(r.total_incoming_value) if r.total_incoming_value else "—",
				"lines": lines,
				"count": len(lines),
			}
		)
	return out


@frappe.whitelist()
def adjust_stock(item_code, counted_qty, reason=None):
	"""Kiểm kê: set on-hand to the counted quantity (fix drift from spillage/breakage/theft).

	Uses ERPNext's Stock Reconciliation (the correct primitive — it books the delta against
	stock adjustment). Owner-only; privileged submit (owner lacks Stock perms)."""
	ensure_cap("stock")
	ensure_lang()
	if not frappe.db.exists("Item", item_code):
		frappe.throw(_("Không tìm thấy sản phẩm."))
	counted = flt(counted_qty)
	if counted < 0:
		frappe.throw(_("Số đếm không hợp lệ."))
	warehouse = _default_warehouse()
	if not warehouse:
		frappe.throw(_("Chưa cấu hình kho."))
	before = flt(dto.get_actual_qty(item_code))

	with as_user("Administrator"):
		sr = frappe.get_doc(
			{
				"doctype": "Stock Reconciliation",
				"purpose": "Stock Reconciliation",
				"company": debt._company(),
				"items": [
					{
						"item_code": item_code,
						"warehouse": warehouse,
						"qty": counted,
						"allow_zero_valuation_rate": 1,
					}
				],
			}
		)
		sr.flags.ignore_permissions = True
		sr.insert(ignore_permissions=True)
		sr.submit()

	record_action("Other", ref_doctype="Item", ref_name=item_code, old_value=before, new_value=counted)
	frappe.db.commit()
	return {"entry": sr.name, "before": before, "qty": flt(dto.get_actual_qty(item_code))}


def _last_supplier(item_code):
	"""Supplier of the most recent credit purchase of this item, so reorder suggestions can be
	grouped by who the owner usually buys it from. Returns ('', '') when never purchased on credit."""
	row = frappe.db.sql(
		"""
		select pi.supplier, pi.supplier_name
		from `tabPurchase Invoice Item` pii
		join `tabPurchase Invoice` pi on pi.name = pii.parent
		where pii.item_code = %s and pi.docstatus = 1
		order by pi.posting_date desc, pi.creation desc limit 1
		""",
		(item_code,),
		as_dict=True,
	)
	return (row[0].supplier or "", row[0].supplier_name or row[0].supplier or "") if row else ("", "")


@frappe.whitelist()
def reorder_suggestions():
	"""Gợi ý nhập hàng: MỌI mặt đang cảnh báo hết — auto ở/dưới mức đặt lại HOẶC mặt chủ tự đánh dấu
	(Còn ít / Hết hàng / Sắp nhập) — kèm số lượng đề xuất và nhà cung cấp gần nhất. Khớp đúng với
	'Cảnh báo hôm nay' để nút 'Nhập' không dẫn tới màn trống. Chỉ đọc; gom theo NCC. Không lộ giá vốn."""
	ensure_cap("stock")
	from cago.api.reports import LOW_STOCK_STATUSES

	items = frappe.get_all(
		"Item",
		filters={"disabled": 0, "is_stock_item": 1, "has_variants": 0},
		fields=["name", "item_name", "cago_display_name", "cago_stock_auto", "cago_reorder_level", "cago_stock_status_manual", "stock_uom", "cago_shelf_location"],
	)
	qty_map = dto.bin_qty_map([r.name for r in items])
	out = []
	for r in items:
		qty = flt(qty_map.get(r.name, 0))
		reorder = flt(r.cago_reorder_level)
		if r.cago_stock_auto:
			# Auto-tracked: needs attention when out of stock or at/under the reorder level.
			if qty > 0 and not (reorder and qty <= reorder):
				continue
			suggest = max(reorder * 2 - qty, reorder) if reorder else 0
		else:
			# Manual: include only if the owner flagged it low; qty target is the owner's call (0 = "?").
			if r.cago_stock_status_manual not in LOW_STOCK_STATUSES:
				continue
			suggest = 0
		supplier, supplier_name = _last_supplier(r.name)
		out.append(
			{
				"item_code": r.name,
				"display_name": r.cago_display_name or r.item_name,
				"on_hand": qty,
				"on_hand_text": f"{qty:g} {r.stock_uom}",
				"reorder_level": reorder,
				"suggest_qty": suggest,
				"uom": r.stock_uom,
				"shelf_location": r.cago_shelf_location,
				"supplier": supplier,
				"supplier_name": supplier_name or "Chưa rõ NCC",
			}
		)
	out.sort(key=lambda x: (x["supplier_name"], -x["reorder_level"]))
	return out
