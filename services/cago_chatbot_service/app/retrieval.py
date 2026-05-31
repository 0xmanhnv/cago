# Copyright (c) 2026, AgriMate and contributors
"""Retrieval: fetch public product data from the ERPNext kiosk API.

Only the guest-safe kiosk endpoint is used, so the chatbot can never see buying
price, margin, stock numbers, customer or debt data.

A natural-language question ("còn thuốc chuột không?") rarely matches as a single
LIKE term, so we try the whole phrase first, then fall back to per-keyword search
and merge, ranking by how many keywords a product matched.
"""

import re

import httpx

from .config import settings

# Common Vietnamese filler words that should not drive product search.
STOPWORDS = {
	"giá", "bao", "nhiêu", "còn", "không", "có", "ạ", "ơi", "cho", "tôi", "mua", "cần",
	"của", "và", "là", "ở", "cái", "loại", "hỏi", "thế", "nào", "bán", "được", "này",
	"kia", "đó", "với", "khi", "thì", "mấy", "em", "anh", "chị", "bác", "ông", "bà",
	"muốn", "xin", "ạ.", "vậy", "à", "nhé",
}


def _query(term: str):
	params = {"query": term} if term else {}
	url = settings.ERPNEXT_URL.rstrip("/") + settings.KIOSK_LIST
	try:
		resp = httpx.get(url, params=params, timeout=settings.REQUEST_TIMEOUT)
		resp.raise_for_status()
	except httpx.HTTPError:
		return []
	return resp.json().get("message", []) or []


def search_products(message: str):
	"""Return public product DTOs relevant to a free-text message (may be empty)."""
	message = (message or "").strip()
	if not message:
		return []

	# 1) Whole-phrase match (handles exact names / short queries).
	results = _query(message)
	if results:
		return results

	# 2) Keyword fallback: search each meaningful token, score by how many matched.
	tokens = [t for t in re.split(r"\s+", message.lower()) if len(t) >= 2 and t not in STOPWORDS]
	if not tokens:
		return []
	merged = {}
	for tok in tokens:
		for p in _query(tok):
			code = p.get("item_code")
			if not code:
				continue
			entry = merged.setdefault(code, {"product": p, "score": 0})
			entry["score"] += 1
	if not merged:
		return []

	# Precision guard: Vietnamese collation is accent-insensitive, so a single short
	# token can match loosely (e.g. "cày" ~ "cây"). For multi-keyword questions require
	# at least 2 keyword hits, and keep only the best-scoring products.
	max_score = max(e["score"] for e in merged.values())
	threshold = min(2, len(tokens))
	if max_score < threshold:
		return []
	return [e["product"] for e in merged.values() if e["score"] == max_score]
