# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Public kiosk API.

Guest-allowed, but every response is a public-safe DTO (no price number internals,
no buying price, no customer/debt data). Customers can browse and submit a wanted
list which staff later fulfils.
"""

import re

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
	own_counts = {r.item_group: r.count for r in rows if r.item_group}

	# Flat shop taxonomy: every category is a leaf; the 2-level hierarchy is the cago_parent link.
	# A top-level category (cago_parent empty) aggregates its own products + its children's.
	groups = {
		g.name: g
		for g in frappe.get_all(
			"Item Group",
			fields=["name", "cago_parent", "cago_icon", "cago_color", "cago_sort_order", "is_group", "cago_hidden"],
		)
	}
	# Only real shop categories (leaves) — ignore the root, ERPNext defaults, and owner-hidden ones.
	from cago.setup.category_tree import DEFAULTS

	cats = {n: g for n, g in groups.items() if not g.is_group and n not in DEFAULTS and not g.cago_hidden}

	def top_level(name):
		"""Resolve to the ancestor that has no cago_parent. Normally 1 hop (we enforce 2 levels), but
		follow the chain defensively — with a visited-guard so a bad cago_parent cycle can't loop —
		and stop at a parent that's missing / not a shop category (that node becomes the top)."""
		seen = set()
		cur = name
		while cur in cats and cur not in seen:
			seen.add(cur)
			parent = cats[cur].cago_parent
			if not parent or parent not in cats:
				return cur
			cur = parent
		return name

	def present(name, count):
		g = cats.get(name)
		return {
			"category": name,
			"slug": slugify(name),  # URL-safe id for ?category= (Vietnamese name stays as the label)
			"count": count,
			"icon": (g and g.cago_icon) or dto.DEFAULT_CATEGORY_ICON,
			"color": (g and g.cago_color) or dto.DEFAULT_CATEGORY_COLOR,
			"sort": (g and g.cago_sort_order) or 0,
		}

	# Show every category that has products OR is a parent of a category with products, so a parent
	# with only-its-own or only-children products still appears.
	relevant = set(own_counts) | {top_level(n) for n in own_counts}
	tops = {}
	for name in relevant:
		if name not in cats:
			continue
		tl = top_level(name)
		node = tops.setdefault(tl, {**present(tl, 0), "children": []})
		node["count"] += own_counts.get(name, 0)
		if name != tl:
			node["children"].append(present(name, own_counts.get(name, 0)))

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
def create_wanted_list(items, note=None, customer_name=None, customer_phone=None, fulfilment=None, address=None, payment_method=None):
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
	# Optional contact + fulfilment so the seller can call back / deliver (remote orders).
	wl.customer_name = (customer_name or "").strip()[:100]
	wl.customer_phone = re.sub(r"[^\d+]", "", (customer_phone or ""))[:20]
	wl.fulfilment = "Giao tận nơi" if (fulfilment or "").strip() in ("Giao tận nơi", "delivery", "1") else "Nhận tại cửa hàng"
	wl.address = (address or "").strip()[:300] if wl.fulfilment == "Giao tận nơi" else ""
	wl.payment_method = (payment_method or "").strip() if (payment_method or "").strip() in ("Trả khi nhận (COD)", "Chuyển khoản", "Ghi nợ") else "Trả khi nhận (COD)"
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

	# Tell the shop (owner Zalo + Telegram ops chat) a new order came in — best-effort, never blocks.
	try:
		from cago.api.integrations import public_url
		from cago.api.notify import notify_ops

		who = " · ".join(x for x in [wl.customer_name, wl.customer_phone] if x)
		delivery = wl.fulfilment == "Giao tận nơi"
		how = "🚚 Giao tận nơi" if delivery else "🏪 Nhận tại cửa hàng"
		# Tap-to-ACT buttons: staff process the order right in Telegram (callback → status update in the
		# webhook). Tapping needs the inbound webhook registered (public HTTPS). The optional "Mở đơn"
		# link needs the public URL set (Kết nối & Kênh).
		buttons = [
			{"text": "✅ Xác nhận", "cb": f"wl:confirm:{wl.code}"},
			*([{"text": "🚚 Đang giao", "cb": f"wl:deliver:{wl.code}"}] if delivery else []),
			{"text": "✔️ Hoàn tất", "cb": f"wl:done:{wl.code}"},
			{"text": "✖️ Huỷ", "cb": f"wl:cancel:{wl.code}"},
		]
		base = public_url()
		if base:
			buttons.append({"text": "📋 Mở đơn", "url": f"{base}/pos/orders?code={wl.code}"})
		notify_ops(
			f"📦 Đơn mới {wl.code} · {added} mặt hàng · {how} · {wl.payment_method}"
			+ (f"\n👤 {who}" if who else "")
			+ (f"\n📍 {wl.address}" if wl.address else ""),
			buttons=buttons,
		)
	except Exception:
		pass

	return {"code": wl.code, "count": added}


_WANTED_STATUS_VI = {
	"New": "Mới gửi — chờ người bán xác nhận",
	"Confirmed": "Đã xác nhận — đang chuẩn bị hàng",
	"Delivering": "Đang giao",
	"Processing": "Đang xử lý",
	"Completed": "Đã xong / đã giao",
	"Cancelled": "Đã huỷ",
	"Expired": "Quá hạn",
}


@frappe.whitelist(allow_guest=True)
def track_order(code, phone):
	"""Public order tracking: a customer enters their order code + the phone they left, and sees the
	status + items. The phone must match (last 8 digits) so a code alone can't leak someone's order."""
	from cago.utils.ratelimit import rate_guard

	rate_guard("track", limit=30, seconds=60)
	code = (code or "").strip()
	phone = re.sub(r"[^\d]", "", phone or "")
	name = frappe.db.get_value("Cago Wanted List", {"code": code}, "name") if code else None
	if not name or not phone:
		frappe.throw(_("Không tìm thấy đơn. Kiểm tra lại mã và số điện thoại."))
	wl = frappe.get_doc("Cago Wanted List", name)
	saved = re.sub(r"[^\d]", "", wl.customer_phone or "")
	# Match the last 9 digits — the full significant part of a VN mobile (drops only the leading 0 /
	# +84 prefix, which varies by how it was typed). Last-8 was loose enough that two real customers
	# could collide and see each other's order.
	if not saved or len(phone) < 8 or saved[-9:] != phone[-9:]:
		frappe.throw(_("Số điện thoại không khớp đơn này."))
	items = [
		{
			"display_name": frappe.db.get_value("Item", r.item_code, "cago_display_name")
			or frappe.db.get_value("Item", r.item_code, "item_name")
			or r.item_code,
			"qty": r.qty,
		}
		for r in wl.items
	]
	return {
		"code": wl.code,
		"status": wl.status,
		"status_text": _WANTED_STATUS_VI.get(wl.status, wl.status),
		"fulfilment": wl.fulfilment,
		"payment_method": wl.payment_method,
		"created": str(wl.creation)[:16],
		"items": items,
	}
