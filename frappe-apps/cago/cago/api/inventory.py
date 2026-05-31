# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Inventory: lô hàng + hạn sử dụng (Phase 1).

Agri-supply stores must track expiry on chemicals/vet meds (an toàn + tuân thủ).
Built on ERPNext's native Batch (which carries expiry_date / manufacturing_date), so
we don't reinvent batch tracking. Owners record batches and see an "expiring soon"
report; staff/kiosk see expiry status on the product (via DTO).

Stock quantity per batch is reported when available but not required here — wiring
real stock-in/out to batches belongs to the later "nhập hàng → tồn thật" phase.
"""

import frappe
from frappe import _
from frappe.utils import add_days, cint, date_diff, flt, getdate, nowdate

from cago.utils import dto
from cago.utils.permissions import ensure_owner, ensure_staff

DEFAULT_WARN_DAYS = 60


def _enable_batch_tracking(item_code):
	"""Turn on batch tracking for an item (idempotent)."""
	item = frappe.get_doc("Item", item_code)
	changed = False
	if not item.has_batch_no:
		item.has_batch_no = 1
		changed = True
	if not item.create_new_batch:
		item.create_new_batch = 1
		changed = True
	if changed:
		item.save(ignore_permissions=True)
	return changed


def _batch_qty(item_code, batch_no):
	"""On-hand qty for a batch (0 until stock is wired to batches)."""
	try:
		from erpnext.stock.doctype.batch.batch import get_batch_qty

		return flt(get_batch_qty(batch_no=batch_no, item_code=item_code))
	except Exception:
		return 0


def _batch_row(b):
	display = frappe.db.get_value("Item", b.item, "cago_display_name") or frappe.db.get_value(
		"Item", b.item, "item_name"
	)
	return {
		"batch": b.name,
		"batch_id": b.batch_id,
		"item_code": b.item,
		"display_name": display,
		"expiry_date": b.expiry_date,
		"expiry_text": dto.format_date_vi(b.expiry_date),
		"manufacturing_date": b.manufacturing_date,
		"expiry_status": dto.expiry_status(b.expiry_date),
		"days_left": date_diff(b.expiry_date, nowdate()) if b.expiry_date else None,
		"qty": _batch_qty(b.item, b.name),
	}


@frappe.whitelist()
def list_batches(item_code):
	"""All batches for a product (staff may view; owner manages). The earliest non-expired
	batch is flagged `sell_first` (FEFO — bán lô gần hết hạn trước)."""
	ensure_staff()
	rows = frappe.get_all(
		"Batch",
		filters={"item": item_code},
		fields=["name", "batch_id", "item", "expiry_date", "manufacturing_date"],
		order_by="expiry_date asc",
	)
	out = [_batch_row(r) for r in rows]
	for b in out:
		if b["expiry_status"] != "expired" and b.get("expiry_date"):
			b["sell_first"] = True  # earliest non-expired (rows are expiry asc)
			break
	return out


@frappe.whitelist()
def add_batch(item_code, batch_id, expiry_date=None, manufacturing_date=None):
	"""Record a new batch (and enable batch tracking on the item if needed)."""
	ensure_owner()
	if not frappe.db.exists("Item", item_code):
		frappe.throw(_("Không tìm thấy sản phẩm."))
	batch_id = (batch_id or "").strip()
	if not batch_id:
		frappe.throw(_("Nhập mã lô."))
	_enable_batch_tracking(item_code)
	if frappe.db.exists("Batch", {"batch_id": batch_id, "item": item_code}):
		frappe.throw(_("Lô này đã tồn tại cho sản phẩm."))
	doc = frappe.get_doc(
		{
			"doctype": "Batch",
			"batch_id": batch_id,
			"item": item_code,
			"expiry_date": getdate(expiry_date) if expiry_date else None,
			"manufacturing_date": getdate(manufacturing_date) if manufacturing_date else None,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return _batch_row(
		frappe._dict(
			{
				"name": doc.name,
				"batch_id": doc.batch_id,
				"item": item_code,
				"expiry_date": doc.expiry_date,
				"manufacturing_date": doc.manufacturing_date,
			}
		)
	)


@frappe.whitelist()
def expiring_soon(days=DEFAULT_WARN_DAYS):
	"""Owner report: batches expiring within `days` (or already expired)."""
	ensure_owner()
	days = cint(days) or DEFAULT_WARN_DAYS
	horizon = add_days(nowdate(), days)
	# NULL expiry_date is excluded by the `<=` comparison, so only dated batches show.
	rows = frappe.get_all(
		"Batch",
		filters={"expiry_date": ["<=", horizon]},
		fields=["name", "batch_id", "item", "expiry_date", "manufacturing_date"],
		order_by="expiry_date asc",
	)
	out = []
	for r in rows:
		if not frappe.db.exists("Item", r.item) or frappe.db.get_value("Item", r.item, "disabled"):
			continue
		out.append(_batch_row(r))
	return out
