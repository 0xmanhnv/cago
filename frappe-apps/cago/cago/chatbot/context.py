# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Build a compact, role-safe context string + product cards from retrieved DTOs."""

from __future__ import annotations

# Defense-in-depth: even though DTOs already exclude these, assert no sensitive key
# ever reaches the LLM context.
_FORBIDDEN = ("valuation", "buying", "last_purchase", "margin", "profit", "cost", "standard_rate", "debt", "supplier")


def _assert_safe(product):
	leaked = [k for k in product if any(t in k.lower() for t in _FORBIDDEN)]
	if leaked:
		raise ValueError(f"Context would leak sensitive keys: {leaked}")


def build(role, products):
	"""Return a compact context string for the LLM (only role-allowed fields)."""
	if not products:
		return "NO_DATA"
	blocks = []
	for p in products:
		_assert_safe(p)
		lines = [f"- {p.get('display_name')} | Giá: {p.get('price_text')} | Tồn: {p.get('stock_status') or 'không rõ'}"]
		if p.get("public_description"):
			lines.append(f"  Mô tả: {p['public_description']}")
		if p.get("use_cases"):
			lines.append(f"  Dùng cho: {p['use_cases']}")
		# staff/owner-only fields appear only when the DTO carried them.
		if p.get("shelf_location"):
			lines.append(f"  Vị trí kệ: {p['shelf_location']}")
		if p.get("staff_advice"):
			lines.append(f"  Tư vấn bán: {p['staff_advice']}")
		alts = p.get("alternatives") or {}
		alt_names = [a["display_name"] for grp in alts.values() for a in grp] if isinstance(alts, dict) else []
		if alt_names:
			lines.append(f"  Sản phẩm thay thế: {', '.join(alt_names)}")
		if p.get("is_chemical") and p.get("safety_notes"):
			lines.append(f"  An toàn: {p['safety_notes']}")
		blocks.append("\n".join(lines))
	return "\n".join(blocks)


def product_cards(products):
	"""UI cards built from retrieved DTOs (prices/stock are always real)."""
	cards = []
	for p in products:
		cards.append(
			{
				"item_code": p.get("item_code"),
				"display_name": p.get("display_name"),
				"image": p.get("image"),
				"category": p.get("category"),
				"price_text": p.get("price_text"),
				"stock_status": p.get("stock_status"),
				"short_description": (p.get("public_description") or "")[:160],
			}
		)
	return cards
