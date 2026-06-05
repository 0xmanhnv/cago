# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Deterministic store-level facts — answered straight from the database, no LLM.

Some questions are about the SHOP, not a single product: "cửa hàng bán những gì?",
"loại nào bán chạy?", "sản phẩm này để ở đâu?". These have an exact answer in the DB
(category tree, best-seller ranking, store-map zones) so we must never route them to the
LLM and risk a vague "không có dữ liệu" reply. We match a generous keyword set (accent-
insensitive) and query the data directly. Each answer is role-safe (reuses the same
DTO/category helpers) so staff/customer never see cost.

See docs/27 (assistant) and the store-map API (cago.api.storemap).
"""

from __future__ import annotations

import frappe

from . import config
from .deterministic import _has, _norm

# ----------------------------------------------------------------------------- overview
# "What does the shop sell?" — a discovery question with no specific product.
_OVERVIEW = (
	"ban nhung gi", "ban gi", "ban cai gi", "co nhung gi", "co ban gi", "co gi ban",
	"nhung loai gi", "co nhung loai", "mat hang gi", "danh muc", "kinh doanh gi",
	"co loai gi", "co mat hang", "ban nhung mat hang", "shop ban gi", "cua hang ban gi",
	"cua hang co gi", "co san pham gi", "ban san pham gi", "the loai gi", "nganh hang",
	"co the loai", "loai san pham", "nhom hang", "co nhung san pham",
)


def _terms(group, base):
	"""Defaults baked in `base` + owner-added synonyms from live config (no rebuild needed)."""
	extra = [_norm(t) for t in config.extra_keywords(group)]
	return tuple(base) + tuple(t for t in extra if t)


def faq_answer(message):
	"""Owner-curated FAQ answer when the question matches a stored pattern, else None.
	Patterns are matched accent-insensitively as a substring (longest pattern wins)."""
	m = _norm(message)
	if not m:
		return None
	try:
		from cago.chatbot import settings as cbsettings

		for row in cbsettings.faq_rows():
			if row["q"] and row["q"] in m:
				return row["answer"]
	except Exception:
		pass
	return None


def is_overview(message):
	return _has(_norm(message), _terms("overview", _OVERVIEW))


def overview_answer(role):
	"""'We sell X, Y, Z' from the real category tree. Returns (text, links) where links is a list of
	tappable {category, icon}; (None, []) when no category has stock."""
	from cago.api.kiosk import category_tree

	public_only = role not in ("staff", "owner")
	try:
		cats = [c for c in (category_tree(public_only=public_only) or []) if c.get("count")]
	except Exception:
		cats = []
	if not cats:
		return None, []
	p = config.persona()
	text = (
		f"Dạ {p['pronoun']} là {p['name']} đây ạ. Cửa hàng mình có các loại dưới đây — bác bấm vào "
		f"loại muốn xem, hoặc gõ tên sản phẩm để {p['pronoun']} tra giá giúp ạ:"
	)
	links = [{"category": c.get("category"), "icon": c.get("icon") or "📦"} for c in cats]
	return text, links


# -------------------------------------------------------------------------- best-sellers
# "Which sells best / what do people buy most / what's popular?" — answered from the
# 30-day sale-frequency ranking (dto.best_seller_codes). Wide keyword net on purpose.
_BESTSELLER = (
	"ban chay", "ban chay nhat", "best seller", "bestseller", "hay mua", "hay ban",
	"nhieu nguoi mua", "nhieu nguoi dung", "mua nhieu", "ban nhieu", "pho bien",
	"noi bat", "an khach", "dat khach", "duoc ua chuong", "ua chuong", "loai nao hay ban",
	"loai nao ban chay", "hot nhat", "top ban", "top san pham", "khach hay mua",
	"duoc mua nhieu", "loai pho bien", "san pham hot", "dang hot", "moi nguoi hay mua",
	"nhieu nguoi mua", "ban dat", "loai nao dat khach",
)


def is_bestseller(message):
	return _has(_norm(message), _terms("bestseller", _BESTSELLER))


def bestseller_answer(role, limit=6):
	"""Top-selling public products as cards. Returns (text, cards) or (None, []) when there are no
	sales yet (so the caller can fall back instead of asserting 'no best-sellers')."""
	from cago.utils import dto

	codes = dto.best_seller_codes()[:limit]
	if not codes:
		return None, []
	cards = dto.list_dtos(None, audience="public", public_only=True, codes=codes, limit=len(codes))
	order = {c: i for i, c in enumerate(codes)}
	cards = sorted(cards, key=lambda x: order.get(x.get("item_code"), 999))
	if not cards:
		return None, []
	p = config.persona()
	lines = [f"Dạ {p['pronoun']} là {p['name']} đây ạ. Mấy loại cửa hàng mình đang bán chạy nhất:"]
	for i, c in enumerate(cards, 1):
		lines.append(f"{i}. {c.get('display_name')} — {c.get('price_text')}")
	lines.append("Bác bấm vào sản phẩm để xem chi tiết, hoặc hỏi tiếp giúp cháu nhé ạ.")
	return "\n".join(lines), cards


# ------------------------------------------------------------------------------ location
# "Where is this product in the shop?" — answered from the owner-authored store map
# (category zone, with parent-zone fallback) plus the item's shelf label. Works for ALL
# roles: the kiosk shows location too, so a customer asking must get an answer, not a refusal.


def locate(item_code):
	"""Resolve a product's in-store location: {floor, zone, shelf} (any field may be None).
	Zone comes from the store-map zone drawn for the item's category, falling back to the
	category's parent zone (flat cago_parent taxonomy). `shelf` is the item's own label."""
	if not item_code or not frappe.db.exists("Item", item_code):
		return None
	meta = frappe.db.get_value(
		"Item", item_code, ["item_group", "cago_shelf_location", "disabled"], as_dict=True
	)
	if not meta or meta.disabled:
		return None
	out = {"floor": None, "zone": None, "shelf": meta.cago_shelf_location or None}
	try:
		from cago.api.storemap import get_store_map

		smap = get_store_map()
	except Exception:
		smap = None
	if smap and smap.get("published"):
		cat = meta.item_group
		parents = smap.get("parents") or {}
		zones = {z.get("item_group"): z for z in (smap.get("zones") or []) if z.get("item_group")}
		z = zones.get(cat) or zones.get(parents.get(cat))
		if z:
			out["zone"] = z.get("label") or None
			floor = z.get("floor")
			if floor:
				labels = {str(f.get("level")): f.get("label") for f in (smap.get("floors") or [])}
				out["floor"] = labels.get(str(floor)) or floor
	return out if (out["zone"] or out["shelf"]) else None


def location_answer(role, item_code):
	"""A friendly 'it's on floor X, zone Y (shelf Z)' line, or None when we have no location data."""
	loc = locate(item_code)
	if not loc:
		return None
	name = frappe.db.get_value("Item", item_code, "item_name") or ""
	p = config.persona()
	where = []
	if loc.get("floor"):
		where.append(str(loc["floor"]))
	if loc.get("zone"):
		where.append(f"khu {loc['zone']}")
	if loc.get("shelf"):
		where.append(f"kệ {loc['shelf']}")
	if not where:
		return None
	spot = ", ".join(where)
	return (
		f"Dạ {name} để ở {spot} ạ. Bác bấm '📍 Vị trí' trên trang sản phẩm để xem sơ đồ đường đi, "
		f"hoặc hỏi người bán giúp {p['pronoun']} nhé."
	)
