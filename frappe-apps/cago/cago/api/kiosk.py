# Copyright (c) 2026, 0xManhnv
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
from cago.utils.slug import slugify

# Guard rails for the guest-writable wanted list (anti-abuse / DoS).
MAX_WANTED_ITEMS = 50
MAX_QTY = 9999
MAX_NOTE_LEN = 500


@frappe.whitelist(allow_guest=True)
def get_categories():
	"""Top-level kiosk categories (public-visible items only). See category_tree()."""
	return category_tree(public_only=True)


def category_tree(public_only=True):
	"""Top-level categories (Item Group tree), each with its product subtree count and child
	categories. `public_only` counts only kiosk-visible items (kiosk/guest); staff pass False to
	count every non-disabled item so categories with only internal items still appear. A flat shop
	(no parent groups) just returns its leaf categories with empty children. Ordered by the owner's
	cago_sort_order."""
	item = frappe.qb.DocType("Item")
	where = item.disabled == 0
	if public_only:
		where = where & (item.cago_is_public_visible == 1)
	rows = (
		frappe.qb.from_(item)
		.select(item.item_group, Count(item.name).as_("count"))
		.where(where)
		.groupby(item.item_group)
	).run(as_dict=True)
	leaf_counts = {r.item_group: r.count for r in rows if r.item_group}
	if not leaf_counts:
		return []

	# Whole Item Group tree (one query) to resolve parents + presentation.
	groups = {
		g.name: g
		for g in frappe.get_all(
			"Item Group",
			fields=["name", "parent_item_group", "cago_icon", "cago_color", "cago_sort_order"],
		)
	}
	roots = {n for n, g in groups.items() if not g.parent_item_group or g.parent_item_group not in groups}

	def top_level(name):
		"""The category's ancestor that sits directly under a tree root (or itself)."""
		seen = set()
		cur = name
		while cur in groups and cur not in seen:
			seen.add(cur)
			parent = groups[cur].parent_item_group
			if not parent or parent in roots or parent not in groups:
				return cur
			cur = parent
		return name

	def present(name, count):
		g = groups.get(name)
		return {
			"category": name,
			"slug": slugify(name),  # URL-safe id for ?category= (Vietnamese name stays as the label)
			"count": count,
			"icon": (g and g.cago_icon) or dto.DEFAULT_CATEGORY_ICON,
			"color": (g and g.cago_color) or dto.DEFAULT_CATEGORY_COLOR,
			"sort": (g and g.cago_sort_order) or 0,
		}

	tops = {}
	for leaf, count in leaf_counts.items():
		tl = top_level(leaf)
		node = tops.setdefault(tl, {**present(tl, 0), "children": []})
		node["count"] += count
		if leaf != tl:
			node["children"].append(present(leaf, count))

	# Unset order (cago_sort_order = 0) sorts LAST, not first — so a half-finished reorder or a
	# brand-new category appears at the end, behind the ones the owner explicitly placed.
	def order_key(c):
		return (c["sort"] or 9999, c["category"])

	out = list(tops.values())
	for node in out:
		node["children"].sort(key=order_key)
	out.sort(key=order_key)
	return out


@frappe.whitelist(allow_guest=True)
def list_products(category=None, query=None, recommended_only=0):
	"""Public product list, optionally filtered by category, search term and/or 'recommended only'."""
	from frappe.utils import cint

	return dto.list_dtos(
		query, audience="public", public_only=True, category=category, limit=60,
		recommended_only=bool(cint(recommended_only)),
	)


@frappe.whitelist(allow_guest=True)
def best_sellers(limit=8):
	"""Public 'bán chạy' row for the kiosk home — top-selling public products, in sold order."""
	codes = dto.best_seller_codes()[: cint(limit) or 8]
	if not codes:
		return []
	cards = dto.list_dtos(None, audience="public", public_only=True, codes=codes, limit=len(codes))
	order = {c: i for i, c in enumerate(codes)}
	return sorted(cards, key=lambda x: order.get(x["item_code"], 999))


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
