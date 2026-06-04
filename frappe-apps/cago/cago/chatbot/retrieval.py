# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Role-aware retrieval over cago product data.

All data access goes through `cago.utils.dto` (role-filtered). The LLM never sees
this code — it only receives the context string built from these results.
"""

from __future__ import annotations

import re

import frappe

from cago.chatbot import deterministic
from cago.utils import dto

# Vietnamese stopwords for product search. Only NON-product words live here — never
# an agricultural term (cám/phân/thuốc/lân/NPK/sâu/cỏ/chuột/giống/gà/vịt/lúa/con/cây)
# and never a colour (xanh/đỏ/vàng… are package_color). Phrase-first matching still
# finds exact local names (e.g. "bao xanh con cò") even though "bao" is a stopword.
STOPWORDS = {
	# pronouns / address terms
	"tôi", "tao", "tớ", "mình", "mày", "bạn", "em", "anh", "chị", "bác", "ông", "bà",
	"cô", "chú", "cháu", "ai", "họ", "nó", "người", "ta", "quý", "khách",
	# question words
	"gì", "nào", "sao", "đâu", "mấy", "bao", "nhiêu", "chi",
	# particles / interjections
	"ạ", "à", "á", "dạ", "vâng", "ừ", "ờ", "ơi", "nhé", "nha", "nhỉ", "nhể", "ấy",
	"đấy", "đó", "đây", "kia", "này", "cơ", "thôi", "luôn", "vậy", "thế", "hả", "hử",
	"ha", "í", "ư",
	# generic verbs (asking / wanting / using)
	"hỏi", "xem", "coi", "tìm", "kiếm", "mua", "bán", "cần", "muốn", "lấy", "cho",
	"biết", "đặt", "dùng", "gọi", "hãy",
	# prepositions / conjunctions / modals / time
	"của", "và", "với", "ở", "tại", "để", "thì", "là", "mà", "nếu", "hay", "hoặc",
	"rồi", "đã", "đang", "sẽ", "cũng", "vẫn", "được", "bị", "cùng", "theo", "về",
	"từ", "nữa", "thêm", "chưa", "chỉ", "mới", "khi",
	# determiners / classifiers / quantity
	"các", "những", "một", "vài", "cái", "chiếc", "loại",
	# existence / negation (used in "còn ... không", "có ... không")
	"còn", "không", "có", "chẳng", "đừng",
	# store / greetings / politeness
	"shop", "cửa", "hàng", "chào", "alo", "xin", "giúp", "giùm", "dùm", "vui", "lòng",
}

# role -> (detail DTO builder, public_only flag)
_ROLE = {
	"customer": (dto.public_dto, True),
	"staff": (dto.staff_dto, False),
	"owner": (dto.owner_dto, False),
}


def _search_codes(message, public_only, k):
	"""Phrase-first, then keyword search (accent-insensitive collation aware)."""
	codes = dto.search_item_codes(message, public_only=public_only, limit=k)
	if codes:
		return codes
	tokens = [t for t in re.split(r"\s+", (message or "").lower()) if len(t) >= 2 and t not in STOPWORDS]
	if not tokens:
		return []
	scores = {}
	for tok in tokens:
		for c in dto.search_item_codes(tok, public_only=public_only, limit=k):
			scores[c] = scores.get(c, 0) + 1
	if not scores:
		return []
	top = max(scores.values())
	if top < min(2, len(tokens)):
		return []
	return [c for c, s in sorted(scores.items(), key=lambda kv: kv[1], reverse=True) if s == top][:k]


def search(role, message, k=5):
	"""Return up to k full role-safe product DTOs relevant to the message."""
	builder, public_only = _ROLE.get(role, _ROLE["customer"])
	codes = _search_codes(message, public_only, k)
	products = []
	for code in codes:
		if frappe.db.exists("Item", code):
			products.append(builder(frappe.get_doc("Item", code)))
	return products


# Words that signal the customer wants OTHER options, not the exact item in view —
# e.g. "có loại nào khác không", "sản phẩm tương tự", "thay thế được không".
_ALT_WORDS = ("khác", "thay thế", "tương tự", "loại nào", "cái khác", "thay vì", "giống")


def _wants_alternatives(message):
	m = (message or "").lower()
	return any(w in m for w in _ALT_WORDS)


def _focus_product(role, item_code, public_only):
	"""Full role-safe DTO for the product the customer is currently viewing."""
	if not item_code or not frappe.db.exists("Item", item_code):
		return None
	meta = frappe.db.get_value("Item", item_code, ["disabled", "cago_is_public_visible"], as_dict=True)
	if not meta or meta.disabled:
		return None
	if public_only and not meta.cago_is_public_visible:
		return None
	builder, _ = _ROLE.get(role, _ROLE["customer"])
	return builder(frappe.get_doc("Item", item_code))


def _category_products(role, category, k, public_only):
	"""Lightweight list cards for a whole category (the one being browsed)."""
	if not category:
		return []
	audience = role if role in ("staff", "owner") else "public"
	return dto.list_dtos(None, audience=audience, public_only=public_only, category=category, limit=k)


def _category_siblings(role, item_code, k, public_only):
	category = frappe.db.get_value("Item", item_code, "item_group")
	prods = _category_products(role, category, k + 1, public_only)
	return [p for p in prods if p.get("item_code") != item_code][:k]


def _history_query(message, history):
	"""Combine recent USER turns with the current message so a follow-up like
	"2 bao" / "lấy 3 cái" resolves against the product discussed earlier."""
	parts = []
	for turn in (history or [])[-6:]:
		if isinstance(turn, dict) and turn.get("role") == "user" and turn.get("content"):
			parts.append(str(turn["content"]))
	parts.append(message or "")
	return " ".join(parts).strip()


def resolve(role, message, focus_item=None, focus_category=None, k=5, history=None):
	"""Resolve products for a question, anchored to what the customer is viewing
	and to the conversation so far.

	Priority:
	  1. An explicit product keyword in the message wins (they named something).
	  2. The product currently on screen (`focus_item`) — so a bare "còn hàng không?"
	     answers about THAT product; "khác"/"tương tự" -> its category siblings.
	  3. The conversation history — a follow-up ("2 bao") keeps the previous product
	     so the chat stays coherent.
	  4. The category being browsed (`focus_category`).

	A CONTEXTUAL question ("loại nào rẻ hơn?", "còn hàng không?") asked while viewing a product or
	category is answered ABOUT that focus — we skip the broad store-wide search so a vague compare/
	availability question doesn't dredge up unrelated items. A message that names a specific product
	is non-contextual, so it still wins via the global search.
	"""
	public_only = role not in ("staff", "owner")
	contextual = deterministic.is_contextual(message)
	anchored = contextual and (focus_item or focus_category)

	# Named product wins — unless this is a context-free question while something is on screen.
	if not anchored:
		searched = search(role, message, k)
		if searched:
			return searched

	if focus_item:
		if _wants_alternatives(message):
			sibs = _category_siblings(role, focus_item, k, public_only)
			if sibs:
				return sibs
		focus = _focus_product(role, focus_item, public_only)
		if focus:
			return [focus]
	if history:
		hq = _history_query(message, history)
		if hq and hq != (message or "").strip():
			from_history = search(role, hq, k)
			if from_history:
				return from_history
	if focus_category:
		prods = _category_products(role, focus_category, k, public_only)
		if prods:
			return prods
	# Anchored question whose focus yielded nothing → fall back to the global search now.
	if anchored:
		searched = search(role, message, k)
		if searched:
			return searched
	return []
