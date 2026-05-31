# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Staff API — product search/advice and wanted-list retrieval.

Returns staff DTOs (selling price + operational fields). Never exposes buying
price, valuation or margin.
"""

import frappe
from frappe import _
from frappe.utils import get_datetime, now_datetime

from cago.utils import dto
from cago.utils.permissions import ensure_staff

WANTED_STATUSES = ("New", "Processing", "Completed", "Expired")


@frappe.whitelist()
def search_products(query=None):
	ensure_staff()
	return dto.list_dtos(query, audience="staff", public_only=False)


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
	if not frappe.db.exists("Cago Wanted List", code):
		frappe.throw(_("Không tìm thấy đơn chọn hàng với mã này."))

	wl = frappe.get_doc("Cago Wanted List", code)
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
	if not frappe.db.exists("Cago Wanted List", code):
		frappe.throw(_("Không tìm thấy đơn chọn hàng."))
	frappe.db.set_value("Cago Wanted List", code, "status", status)
	frappe.db.commit()
	return {"code": code, "status": status}
