# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Keyword-driven fallback answers when NO LLM is configured.

The bot must still be useful offline/keyless: match the question against intent keyword sets and
answer from REAL store data (the DTOs retrieval already fetched, role-filtered). Vietnamese rural
users often type WITHOUT accents, so we normalise both the message and the keywords (strip accents,
đ→d) before matching — one keyword then covers "giá"/"gia", "còn"/"con", etc.

This never invents data (prices/stock come from the DTOs) and never gives chemical dosage — the
safety refusal in orchestrator runs first.
"""

from __future__ import annotations

import unicodedata

import frappe

from . import config


def _norm(s):
	s = unicodedata.normalize("NFD", (s or "").lower())
	s = "".join(c for c in s if unicodedata.category(c) != "Mn")
	return s.replace("đ", "d").replace("đ", "d")


# Keyword sets are written WITHOUT accents (matched against the accent-stripped message). Multi-word
# phrases reduce false hits from accent collisions (e.g. "con hang" = còn hàng, not "con gà").
THANKS = ("cam on", "cảm ơn", "thank", "tks", "thanks")
GREET = ("xin chao", "chao shop", "chao ", "alo", "hello", "helo", " hi ", "hey")
STORE = ("dia chi", "o dau ban", "cho nao ban", "may gio", "gio mo", "mo cua", "dong cua", "so dien thoai", "sdt", "lien he", "giao hang", "ship", "co giao khong", "ban o dau")
PRICE = ("gia", "bao nhieu", "nhieu tien", "may tien", "gia ca", "gia bao", "mac khong", "dat khong", "nhiu tien", "nhieu xien")
STOCK = ("con hang", "con khong", "con ko", "het chua", "het hang", "con bao nhieu", "con nhieu", "con may", "co san", "san hang", "con hang khong", "ton kho")
WHERE = ("o dau", "cho nao", "ke nao", "de dau", "khu nao", "vi tri", "lay o dau", "tim o dau")
USE = ("dung cho", "dung de", "dung lam", "cong dung", "tri gi", "tri benh", "diet gi", "bon cho", "cho con", "cho cay", "tac dung", "chua benh", "phong benh", "lam gi", "de lam gi")
UNITS = ("bao nhieu kg", "may kg", "quy cach", "dong goi", "ban le", "mua le", "ban si", "may ky", "trong luong", "the tich", "dung tich")
CHEAP = ("re nhat", "re hon", "loai re", "gia re", "gia thap", "re khong")
EXPENSIVE = ("dat nhat", "mac nhat", "loai dat", "loai mac", "cao nhat")
BEST = ("tot nhat", "loai nao tot", "nen mua", "nen dung", "loai nao ngon", "loai nao hay", "khuyen dung", "loai nao duoc", "hieu qua nhat", "loai nao manh")
ALT = ("thay the", "tuong tu", "loai khac", "giong", "khac khong", "san pham khac")
EXIST = ("co ban", "co loai", "co khong", "co ko", "shop co", "cua hang co", "co con", "co hang khong", "co san pham")
SAFE = ("an toan khong", "co doc", "co hai", "doc khong", "nguy hiem")


def _has(norm_msg, kws):
	return any(k in norm_msg for k in kws)


# Questions that are ABOUT what the customer is currently viewing (compare / availability / price /
# use / location), so when they're inside a category or on a product the answer should stay anchored
# to that context instead of triggering a broad store-wide search ("loại nào rẻ hơn?" in Cám = which
# CÁM is cheaper, not the cheapest thing in the whole shop).
_CONTEXTUAL = (CHEAP, EXPENSIVE, BEST, EXIST, STOCK, PRICE, USE, WHERE, UNITS, ALT, SAFE)


def is_contextual(message):
	m = _norm(message)
	return any(_has(m, kws) for kws in _CONTEXTUAL)


def _line(p, extra=""):
	bits = [f"• {'⭐ ' if p.get('recommended') else ''}{p.get('display_name')}"]
	if extra:
		bits.append(extra)
	return " ".join(bits)


def _list(products, fn, intro):
	lines = [intro]
	for p in products[:5]:
		lines.append(fn(p))
	return "\n".join(lines)


def reply(role, message, products):
	"""Compose a keyword-matched answer from real DTOs. Returns text (always non-empty)."""
	m = _norm(message)
	p = config.persona()
	pron = p["pronoun"]

	# 0) Social — no product needed.
	if _has(m, THANKS):
		return f"Dạ không có gì ạ, {pron} cảm ơn bác đã ghé cửa hàng mình!"
	if _has(m, STORE):
		phone = None
		try:
			phone = frappe.db.get_value("Company", config._company(), "cago_owner_phone")
		except Exception:
			pass
		extra = f" Số liên hệ: {phone}." if phone else ""
		return f"Dạ phần địa chỉ / giờ mở cửa / giao hàng bác nhắn hoặc gọi người bán giúp {pron} nhé.{extra}"
	if _has(m, GREET) and not products:
		return f"Dạ {pron} là {p['name']} đây ạ. Bác cần hỏi giá, còn hàng, công dụng hay loại nào nên mua ạ?"

	# 1) No product matched → let the caller fall back (overview / no-data).
	if not products:
		return None

	one = len(products) == 1
	first = products[0]

	# 2) Specific intents (most specific first).
	if _has(m, WHERE):
		# shelf location is staff/owner-only in the DTO; kiosk won't have it.
		locs = [p2 for p2 in products if p2.get("shelf_location")]
		if locs:
			return _list(locs, lambda x: _line(x, f"— {x.get('shelf_location')}"), "Dạ vị trí để hàng:")
		return f"Dạ chỗ để hàng bác hỏi người bán giúp {pron}, hoặc xem 'Sơ đồ cửa hàng' ạ."

	if _has(m, USE):
		used = [p2 for p2 in products if p2.get("use_cases") or p2.get("public_description")]
		if used:
			return _list(used, lambda x: _line(x, f"— dùng cho: {x.get('use_cases') or x.get('public_description')}"), "Dạ công dụng:")

	if _has(m, UNITS):
		def units_txt(x):
			su = x.get("sale_units") or []
			if su:
				return _line(x, "— " + " · ".join(f"{u.get('label') or u.get('uom')}: {u.get('price_text')}" for u in su))
			return _line(x, f"— {x.get('price_text')}")
		return _list(products, units_txt, "Dạ quy cách & giá:")

	if _has(m, STOCK):
		def stock_txt(x):
			s = x.get("stock_status") or "Còn hàng"
			if x.get("actual_stock_qty") is not None and x.get("stock_auto"):
				s += f" (còn {x.get('actual_stock_qty')})"
			return _line(x, f"— {s}")
		return _list(products, stock_txt, "Dạ tình trạng hàng:")

	if _has(m, CHEAP) or _has(m, EXPENSIVE):
		def num(x):
			d = "".join(ch for ch in (x.get("price_text") or "") if ch.isdigit())
			return int(d) if d else (10**12)
		ranked = sorted(products, key=num, reverse=_has(m, EXPENSIVE))
		head = "Loại rẻ hơn ạ:" if _has(m, CHEAP) else "Loại giá cao hơn ạ:"
		return _list(ranked, lambda x: _line(x, f"— {x.get('price_text')}"), f"Dạ {head}")

	if _has(m, BEST):
		reco = [p2 for p2 in products if p2.get("recommended")]
		picks = reco or products
		head = "cửa hàng khuyên dùng:" if reco else "các lựa chọn để bác chọn:"
		return _list(picks, lambda x: _line(x, f"— {x.get('price_text')}"), f"Dạ {head}")

	if _has(m, ALT):
		return _list(products, lambda x: _line(x, f"— {x.get('price_text')}"), "Dạ các loại tương tự:")

	if _has(m, EXIST):
		if one:
			st = first.get("stock_status") or ""
			tail = f" · {st}" if st else ""
			return f"Dạ có ạ — {first.get('display_name')}: {first.get('price_text')}{tail}"
		return _list(products, lambda x: _line(x, f"— {x.get('price_text')}"), "Dạ có ạ, mình có các loại:")

	# 3) Price intent OR default — name + price (+ stock), the most common ask.
	return _list(products, lambda x: _line(x, f"— {x.get('price_text')} · {x.get('stock_status') or ''}".rstrip(" ·")), "Dạ theo dữ liệu cửa hàng mình:")
