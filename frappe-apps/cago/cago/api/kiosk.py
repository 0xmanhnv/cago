# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Public kiosk API.

Guest-allowed, but every response is a public-safe DTO (no price number internals,
no buying price, no customer/debt data). Customers can browse and submit a wanted
list which staff later fulfils.
"""

import frappe
from frappe import _
from frappe.query_builder.functions import Count
from frappe.utils import add_to_date, cint, now_datetime

from cago.utils import dto

# Guard rails for the guest-writable wanted list (anti-abuse / DoS).
MAX_WANTED_ITEMS = 50
MAX_QTY = 9999
MAX_NOTE_LEN = 500


@frappe.whitelist(allow_guest=True)
def get_categories():
	"""Item Groups that contain at least one kiosk-visible product, with counts."""
	item = frappe.qb.DocType("Item")
	rows = (
		frappe.qb.from_(item)
		.select(item.item_group, Count(item.name).as_("count"))
		.where((item.disabled == 0) & (item.cago_is_public_visible == 1))
		.groupby(item.item_group)
		.orderby(item.item_group)
	).run(as_dict=True)
	rows = [r for r in rows if r.item_group]
	meta = dto.category_meta_map([r.item_group for r in rows])
	return [
		{
			"category": r.item_group,
			"count": r.count,
			"icon": meta[r.item_group]["icon"],
			"color": meta[r.item_group]["color"],
		}
		for r in rows
	]


@frappe.whitelist(allow_guest=True)
def list_products(category=None, query=None):
	"""Public product list, optionally filtered by category and/or search term."""
	return dto.list_dtos(query, audience="public", public_only=True, category=category, limit=60)


@frappe.whitelist(allow_guest=True)
def get_product(item_code):
	"""Single public DTO. 404 unless the item is flagged kiosk-visible."""
	visible = frappe.db.get_value(
		"Item", item_code, ["disabled", "cago_is_public_visible"], as_dict=True
	)
	if not visible or visible.disabled or not visible.cago_is_public_visible:
		frappe.throw(_("Không tìm thấy sản phẩm."), frappe.DoesNotExistError)
	return dto.public_dto(frappe.get_doc("Item", item_code))


@frappe.whitelist(allow_guest=True)
def related_products(item_code, limit=8):
	"""Other kiosk-visible products in the same category (excluding this one)."""
	category = frappe.db.get_value("Item", item_code, "item_group")
	if not category:
		return []
	limit = cint(limit) or 8
	items = dto.list_dtos(None, audience="public", public_only=True, category=category, limit=limit + 1)
	return [p for p in items if p["item_code"] != item_code][:limit]


@frappe.whitelist(allow_guest=True)
def create_wanted_list(items, note=None):
	"""Create a wanted list from kiosk selections; return its lookup code.

	`items` is a JSON list of {item_code, qty}. Only kiosk-visible items are kept.
	"""
	from cago.utils.ratelimit import rate_guard

	rate_guard("wanted", limit=20, seconds=60)
	items = frappe.parse_json(items) if isinstance(items, str) else items
	if not items or not isinstance(items, list):
		frappe.throw(_("Bác chưa chọn sản phẩm nào."))
	# Anti-abuse: a guest cannot submit an unbounded list.
	if len(items) > MAX_WANTED_ITEMS:
		frappe.throw(_("Danh sách chọn quá nhiều sản phẩm."))

	wl = frappe.new_doc("Cago Wanted List")
	wl.status = "New"
	wl.note = (note or "")[:MAX_NOTE_LEN]
	wl.expires_at = add_to_date(now_datetime(), days=2)

	added = 0
	for row in items:
		code = (row or {}).get("item_code")
		if not code or not frappe.db.exists("Item", code):
			continue
		if not frappe.db.get_value("Item", code, "cago_is_public_visible"):
			continue
		qty = max(1, min(cint((row or {}).get("qty")) or 1, MAX_QTY))
		wl.append("items", {"item_code": code, "qty": qty})
		added += 1

	if not added:
		frappe.throw(_("Không có sản phẩm hợp lệ trong danh sách chọn."))

	wl.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"code": wl.code, "count": added}
