# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""URL-safe slugs for Item Group categories.

Category docnames are Vietnamese (e.g. "Cám chăn nuôi"), which is fragile in a URL. The kiosk
puts the SLUG in `?category=` instead; the backend resolves the slug back to the group name. We
compute the slug on the fly (no stored field / migration) — the category set is tiny.
"""

import re
import unicodedata

import frappe

_CACHE_KEY = "cago_slug_to_group"


def slugify(text: str) -> str:
	"""'Cám chăn nuôi' → 'cam-chan-nuoi'. Strips Vietnamese diacritics, đ→d, non-alnum→'-'."""
	text = (text or "").strip().lower().replace("đ", "d")
	text = unicodedata.normalize("NFD", text)
	text = "".join(c for c in text if unicodedata.category(c) != "Mn")  # drop combining marks
	text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
	return text or "khu"


def _slug_map() -> dict:
	"""slug → Item Group name, for every group (leaf + parent). Cached per request."""
	cached = frappe.flags.get(_CACHE_KEY) if hasattr(frappe, "flags") else None
	if cached is not None:
		return cached
	m = {}
	for name in frappe.get_all("Item Group", pluck="name"):
		m.setdefault(slugify(name), name)
	try:
		frappe.flags[_CACHE_KEY] = m
	except Exception:
		pass
	return m


def group_from_slug(value: str) -> str | None:
	"""Resolve a `?category=` value to an Item Group name. Accepts a real group name (back-compat)
	or a slug. Returns None if nothing matches."""
	if not value:
		return None
	if frappe.db.exists("Item Group", value):
		return value
	return _slug_map().get(value)
