# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Staff API — product search/advice and wanted-list retrieval.

Returns staff DTOs (selling price + operational fields). Never exposes buying
price, valuation or margin.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, format_datetime, get_datetime, now_datetime

from cago.utils import dto
from cago.utils.permissions import ensure_staff

WANTED_STATUSES = ("New", "Processing", "Completed", "Expired", "Cancelled")


@frappe.whitelist()
def list_wanted_lists(include_done=0):
	"""List recent customer wanted lists so staff can SEE what was selected on the kiosk
	without having to type a code. Open ones (New/Processing) first; newest first. Set
	include_done=1 to also show Completed/Expired."""
	ensure_staff()
	filters = {}
	if not cint(include_done):
		filters["status"] = ["in", ["New", "Processing"]]
	rows = frappe.get_all(
		"Cago Wanted List",
		filters=filters,
		fields=["name", "code", "status", "note", "creation", "expires_at"],
		order_by="creation desc",
		limit=50,
	)
	from frappe.utils import getdate, nowdate

	today = getdate(nowdate())
	out = []
	for r in rows:
		items = frappe.get_all("Cago Wanted List Item", filters={"parent": r.name}, fields=["item_code", "qty"])
		names, total_qty = [], 0
		for it in items:
			total_qty += flt(it.qty)
			disp = (
				frappe.db.get_value("Item", it.item_code, "cago_display_name")
				or frappe.db.get_value("Item", it.item_code, "item_name")
				or it.item_code
			)
			names.append(disp)
		summary = ", ".join(names[:3]) + (f" +{len(names) - 3}" if len(names) > 3 else "")
		delta = (today - getdate(r.creation)).days
		group = "Hôm nay" if delta == 0 else "Hôm qua" if delta == 1 else format_datetime(r.creation, "dd/MM/yyyy")
		out.append(
			{
				"code": r.code or r.name,
				"status": r.status,
				"item_count": len(items),
				"total_qty": total_qty,
				"summary": summary,
				"note": r.note,
				"created": format_datetime(r.creation, "dd/MM HH:mm"),
				"date_group": group,
				"time": format_datetime(r.creation, "HH:mm"),
				"is_expired": bool(r.expires_at and get_datetime(r.expires_at) < now_datetime()),
			}
		)
	return out


STAFF_PAGE = 30


@frappe.whitelist()
def search_products(query=None, category=None, start=0):
	ensure_staff()
	from frappe.utils import cint

	return dto.list_dtos(query, audience="staff", public_only=False, category=category, limit=STAFF_PAGE, start=cint(start))


@frappe.whitelist()
def list_categories():
	"""Category tree for the staff sell screen — counts every non-disabled item (incl. internal),
	not just kiosk-visible ones, so staff can browse any category."""
	ensure_staff()
	from cago.api.kiosk import category_tree

	return category_tree(public_only=False)


@frappe.whitelist()
def get_product(item_code):
	ensure_staff()
	if not frappe.db.exists("Item", item_code):
		frappe.throw(_("Không tìm thấy sản phẩm."))
	return dto.staff_dto(frappe.get_doc("Item", item_code))


@frappe.whitelist()
def get_wanted_list(code):
	"""Retrieve a customer's wanted list (created on the kiosk) for fulfilment."""
	ensure_staff()
	# Look up by the business `code` field (e.g. WL-2026-00001), not the docname, so it
	# stays consistent with pos.create_invoice_from_wanted and the list view.
	name = frappe.db.get_value("Cago Wanted List", {"code": code}, "name") or (
		code if frappe.db.exists("Cago Wanted List", code) else None
	)
	if not name:
		frappe.throw(_("Không tìm thấy đơn chọn hàng với mã này."))

	wl = frappe.get_doc("Cago Wanted List", name)
	items = []
	for row in wl.items:
		item = frappe.get_doc("Item", row.item_code) if frappe.db.exists("Item", row.item_code) else None
		items.append(
			{
				"item_code": row.item_code,
				"display_name": (item.cago_display_name or item.item_name) if item else row.item_code,
				"qty": row.qty,
				"price_text": dto.format_price(dto.get_selling_price(row.item_code), item.stock_uom if item else None),
				"shelf_location": item.cago_shelf_location if item else None,
				"note": row.note,
			}
		)
	is_expired = bool(wl.expires_at and get_datetime(wl.expires_at) < now_datetime())
	return {
		"code": wl.code,
		"status": wl.status,
		"note": wl.note,
		"expires_at": str(wl.expires_at) if wl.expires_at else None,
		"is_expired": is_expired,
		"items": items,
	}


@frappe.whitelist()
def set_wanted_list_status(code, status):
	"""Staff marks a wanted list as Đang xử lý / Hoàn tất (or back to Mới)."""
	ensure_staff()
	if status not in WANTED_STATUSES:
		frappe.throw(_("Trạng thái không hợp lệ."))
	name = _wanted_name(code)
	frappe.db.set_value("Cago Wanted List", name, "status", status)
	frappe.db.commit()
	return {"code": code, "status": status}


@frappe.whitelist()
def cancel_wanted_list(code):
	"""Staff cancels a wanted list when the customer no longer wants it.

	Marked Cancelled (kept for the record, hidden from the open list) rather than hard
	deleted, so it can still be reviewed under 'Xem cả đơn xong'."""
	ensure_staff()
	name = _wanted_name(code)
	frappe.db.set_value("Cago Wanted List", name, "status", "Cancelled")
	frappe.db.commit()
	return {"code": code, "status": "Cancelled"}


def _wanted_name(code):
	"""Resolve a wanted-list business code (WL-2026-...) to its docname (or throw)."""
	name = frappe.db.get_value("Cago Wanted List", {"code": code}, "name") or (
		code if frappe.db.exists("Cago Wanted List", code) else None
	)
	if not name:
		frappe.throw(_("Không tìm thấy đơn chọn hàng."))
	return name
