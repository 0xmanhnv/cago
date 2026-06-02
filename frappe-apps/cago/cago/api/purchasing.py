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
from frappe.utils import flt

from cago.api import debt
from cago.cago.doctype.cago_owner_action_log.cago_owner_action_log import record_action
from cago.utils import dto
from cago.utils.permissions import ensure_lang, ensure_owner, ensure_staff
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
	ensure_staff()
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
def receive_stock(item_code, qty, cost_rate=None, batch_no=None):
	"""Record incoming stock (Material Receipt). `cost_rate` = giá nhập per stock unit
	(optional; sets valuation). Batch-tracked items require `batch_no`. Returns new on-hand."""
	ensure_owner()
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
def adjust_stock(item_code, counted_qty, reason=None):
	"""Kiểm kê: set on-hand to the counted quantity (fix drift from spillage/breakage/theft).

	Uses ERPNext's Stock Reconciliation (the correct primitive — it books the delta against
	stock adjustment). Owner-only; privileged submit (owner lacks Stock perms)."""
	ensure_owner()
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
