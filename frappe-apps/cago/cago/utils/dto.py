# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Data Transfer Objects.

All API responses are built here as plain dicts with explicit field whitelists, so
raw DocTypes (and sensitive fields like buying price / valuation / margin) are never
exposed. Three audiences:

- public  -> kiosk / customer (most restrictive)
- staff   -> + price, stock qty, shelf location, advice, alternatives, call-owner
- owner   -> staff fields (owner can additionally see margins via ERPNext Desk)

See docs/07_DATA_MODEL.md.
"""

import frappe
from frappe.query_builder.functions import Sum

from cago.utils.safety import safety_warning_for

SELLING_PRICE_LIST = "Standard Selling"

# Item fields searched by the owner/staff product search (docs/07 §5).
SEARCH_FIELDS = [
	"name",
	"item_name",
	"cago_display_name",
	"cago_local_names",
	"item_group",
	"cago_use_cases",
	"cago_crop_or_animal_targets",
	"cago_package_color",
]


def image_list(item):
	"""Album of image URLs for a product: main Item image + extra gallery URLs.

	`cago_image_gallery` holds newline/comma-separated URLs so an owner can add an
	album without touching core. Returns a deduped, ordered list (may be empty).
	"""
	import re as _re

	imgs = []
	main = _get(item, "image")
	if main:
		imgs.append(main)
	gallery = _get(item, "cago_image_gallery") or ""
	for url in _re.split(r"[\n,]+", gallery):
		url = url.strip()
		if url and url not in imgs:
			imgs.append(url)
	return imgs


def _get(item, key):
	if isinstance(item, dict):
		return item.get(key)
	return getattr(item, key, None)


# --------------------------------------------------------------------------- #
# Category presentation — DATA on the Item Group (owner-editable), never hardcoded
# keyword matching in the UI. Neutral defaults when unset.
# --------------------------------------------------------------------------- #
DEFAULT_CATEGORY_ICON = "📦"
DEFAULT_CATEGORY_COLOR = "#e6f4ea"


def category_meta_map(groups):
	"""Batch-fetch {group: {icon, color}} in one query (avoids N+1 in lists)."""
	groups = [g for g in set(groups) if g]
	out = {}
	if groups:
		for r in frappe.get_all(
			"Item Group",
			filters={"name": ["in", groups]},
			fields=["name", "cago_icon", "cago_color"],
		):
			out[r.name] = {
				"icon": r.cago_icon or DEFAULT_CATEGORY_ICON,
				"color": r.cago_color or DEFAULT_CATEGORY_COLOR,
			}
	for g in groups:
		out.setdefault(g, {"icon": DEFAULT_CATEGORY_ICON, "color": DEFAULT_CATEGORY_COLOR})
	return out


def category_meta(group):
	"""Single {icon, color} for a category, with neutral defaults."""
	if not group:
		return {"icon": DEFAULT_CATEGORY_ICON, "color": DEFAULT_CATEGORY_COLOR}
	return category_meta_map([group]).get(
		group, {"icon": DEFAULT_CATEGORY_ICON, "color": DEFAULT_CATEGORY_COLOR}
	)


# --------------------------------------------------------------------------- #
# Pricing / stock helpers
# --------------------------------------------------------------------------- #
def get_selling_price(item_code):
	"""Selling rate from ERPNext Item Price (source of truth), or 0."""
	rate = frappe.db.get_value(
		"Item Price",
		{"item_code": item_code, "price_list": SELLING_PRICE_LIST, "selling": 1},
		"price_list_rate",
	)
	return rate or 0


def format_price(rate, uom=None):
	"""Format a VND amount the way a rural customer reads it: 320.000đ / Bao."""
	if not rate:
		return "Liên hệ"
	text = f"{int(round(rate)):,}".replace(",", ".") + "đ"
	if uom:
		text += f" / {uom}"
	return text


# --------------------------------------------------------------------------- #
# Expiry (lô + hạn sử dụng) — Phase 1. Uses ERPNext Batch.expiry_date.
# --------------------------------------------------------------------------- #
EXPIRY_WARN_DAYS = 60


def format_date_vi(d):
	"""Render a date as dd/MM/yyyy (how a rural customer reads it)."""
	if not d:
		return None
	from frappe.utils import formatdate

	return formatdate(d, "dd/MM/yyyy")


def expiry_status(expiry_date):
	"""'expired' | 'near' (<= EXPIRY_WARN_DAYS) | 'ok'. None when no expiry."""
	if not expiry_date:
		return "ok"
	from frappe.utils import date_diff, nowdate

	days = date_diff(expiry_date, nowdate())
	if days < 0:
		return "expired"
	if days <= EXPIRY_WARN_DAYS:
		return "near"
	return "ok"


def nearest_expiry(item_code):
	"""Earliest batch expiry date for an item (may be in the past), or None."""
	row = frappe.get_all(
		"Batch",
		filters={"item": item_code, "expiry_date": ["is", "set"]},
		fields=["expiry_date"],
		order_by="expiry_date asc",
		limit=1,
	)
	return row[0].expiry_date if row else None


def _expiry_dto(item_code):
	"""Shared expiry block for detail DTOs (kiosk + staff)."""
	exp = nearest_expiry(item_code)
	return {
		"nearest_expiry": exp,
		"expiry_text": format_date_vi(exp),
		"expiry_status": expiry_status(exp),
	}


def get_actual_qty(item_code):
	"""Total on-hand qty across warehouses (ERPNext Bin)."""
	bin_table = frappe.qb.DocType("Bin")
	result = (
		frappe.qb.from_(bin_table)
		.select(Sum(bin_table.actual_qty))
		.where(bin_table.item_code == item_code)
	).run()
	return (result[0][0] if result and result[0] else 0) or 0


def get_alternatives(item_code):
	"""Grouped alternatives for staff advice."""
	out = {"cheaper": [], "equivalent": [], "better": [], "avoid": []}
	key = {"Cheaper": "cheaper", "Equivalent": "equivalent", "Better": "better", "Avoid": "avoid"}
	rows = frappe.get_all(
		"Cago Product Alternative",
		filters={"source_item": item_code},
		fields=["alternative_item", "alternative_type", "note"],
	)
	for r in rows:
		bucket = key.get(r.alternative_type)
		if not bucket:
			continue
		out[bucket].append(
			{
				"item_code": r.alternative_item,
				"display_name": frappe.db.get_value("Item", r.alternative_item, "cago_display_name")
				or frappe.db.get_value("Item", r.alternative_item, "item_name"),
				"note": r.note,
			}
		)
	return out


# Fields needed to render a list/search card for any audience — fetched in ONE
# query so list endpoints don't do per-item lookups (avoids N+1).
LIST_FIELDS = [
	"name",
	"item_name",
	"item_group",
	"image",
	"stock_uom",
	"cago_display_name",
	"cago_public_description",
	"cago_use_cases",
	"cago_package_color",
	"cago_stock_status_manual",
	"cago_shelf_location",
	"cago_is_chemical",
	"cago_safety_notes",
	"cago_kiosk_sort_order",
]


# --------------------------------------------------------------------------- #
# Search
# --------------------------------------------------------------------------- #
def _price_map(codes):
	"""Batch-fetch selling prices for many items in a single query."""
	if not codes:
		return {}
	rows = frappe.get_all(
		"Item Price",
		filters={"price_list": SELLING_PRICE_LIST, "selling": 1, "item_code": ["in", codes]},
		fields=["item_code", "price_list_rate"],
	)
	return {r.item_code: r.price_list_rate for r in rows}


def list_dtos(query, audience="staff", public_only=False, category=None, limit=24):
	"""Lightweight list/search results built with 2 queries total (items + prices).

	List cards don't need alternatives or live stock qty, so we skip the per-item
	get_doc/Bin/alternative lookups that the detail DTOs use (avoids N+1).
	"""
	base = {"disabled": 0}
	if public_only:
		base["cago_is_public_visible"] = 1
	if category:
		base["item_group"] = category

	if query and query.strip():
		like = f"%{query.strip()}%"
		rows = frappe.get_all(
			"Item",
			filters=base,
			or_filters=[[f, "like", like] for f in SEARCH_FIELDS],
			fields=LIST_FIELDS,
			limit=limit,
			order_by="item_name asc",
		)
	else:
		rows = frappe.get_all(
			"Item",
			filters=base,
			fields=LIST_FIELDS,
			limit=limit,
			order_by="cago_kiosk_sort_order asc, item_name asc",
		)

	prices = _price_map([r.name for r in rows])
	cat_meta = category_meta_map([r.item_group for r in rows])
	return [_list_dto(r, prices.get(r.name) or 0, audience, cat_meta) for r in rows]


def _list_dto(r, rate, audience, cat_meta=None):
	meta = (cat_meta or {}).get(r.item_group) or category_meta(r.item_group)
	out = {
		"item_code": r.name,
		"display_name": r.cago_display_name or r.item_name,
		"image": r.image,
		"price_text": format_price(rate, r.stock_uom),
		"stock_status": r.cago_stock_status_manual,
		"is_chemical": bool(r.cago_is_chemical),
		"category": r.item_group,
		"category_icon": meta["icon"],
		"category_color": meta["color"],
	}
	if audience == "public":
		out.update(
			{
				"category": r.item_group,
				"unit": r.stock_uom,
				"public_description": r.cago_public_description,
				"use_cases": r.cago_use_cases,
				"package_color": r.cago_package_color,
				"safety_notes": safety_warning_for(r),
			}
		)
	else:  # staff / owner
		out.update({"shelf_location": r.cago_shelf_location, "selling_price": rate})
	return out


# --------------------------------------------------------------------------- #
# Search (item-code only — kept for callers that need just ids)
# --------------------------------------------------------------------------- #
def search_item_codes(query, public_only=False, limit=24):
	"""Return Item codes matching `query` across the agri search fields.

	Uses parameterised or_filters (no raw SQL). `public_only` restricts to items
	flagged visible on the kiosk.
	"""
	query = (query or "").strip()
	base = {"disabled": 0}
	if public_only:
		base["cago_is_public_visible"] = 1

	if not query:
		# No term: return a stable, browsable set (used by kiosk category pages).
		return frappe.get_all(
			"Item",
			filters=base,
			limit=limit,
			order_by="cago_kiosk_sort_order asc, item_name asc",
			pluck="name",
		)

	like = f"%{query}%"
	or_filters = [[field, "like", like] for field in SEARCH_FIELDS]
	return frappe.get_all(
		"Item",
		filters=base,
		or_filters=or_filters,
		limit=limit,
		order_by="item_name asc",
		pluck="name",
	)


# --------------------------------------------------------------------------- #
# DTO builders
# --------------------------------------------------------------------------- #
def public_dto(item):
	"""Kiosk-safe DTO. No price number, no internal fields — only display text."""
	rate = get_selling_price(item.name)
	return {
		"item_code": item.name,
		"display_name": item.cago_display_name or item.item_name,
		"category": item.item_group,
		**{f"category_{k}": v for k, v in category_meta(item.item_group).items()},
		"image": item.image,
		"images": image_list(item),
		"price_text": format_price(rate, item.stock_uom),
		"unit": item.stock_uom,
		"public_description": item.cago_public_description,
		"use_cases": item.cago_use_cases,
		"package_color": item.cago_package_color,
		"stock_status": item.cago_stock_status_manual,
		"is_chemical": bool(item.cago_is_chemical),
		"safety_notes": safety_warning_for(item),
		**_expiry_dto(item.name),
	}


def staff_dto(item):
	"""Staff DTO: selling price + operational fields. No buying price / margin."""
	rate = get_selling_price(item.name)
	return {
		"item_code": item.name,
		"display_name": item.cago_display_name or item.item_name,
		"official_name": item.item_name,
		"local_names": item.cago_local_names,
		"category": item.item_group,
		**{f"category_{k}": v for k, v in category_meta(item.item_group).items()},
		"image": item.image,
		"images": image_list(item),
		"selling_price": rate,
		"price_text": format_price(rate, item.stock_uom),
		"unit": item.stock_uom,
		"stock_status": item.cago_stock_status_manual,
		"actual_stock_qty": get_actual_qty(item.name),
		"shelf_location": item.cago_shelf_location,
		"public_description": item.cago_public_description,
		"staff_advice": item.cago_staff_advice,
		"use_cases": item.cago_use_cases,
		"crop_or_animal_targets": item.cago_crop_or_animal_targets,
		"package_color": item.cago_package_color,
		"quality_tier": item.cago_product_quality_tier,
		"call_owner_when": item.cago_call_owner_when,
		"alternatives": get_alternatives(item.name),
		"is_chemical": bool(item.cago_is_chemical),
		"safety_notes": safety_warning_for(item),
		**_expiry_dto(item.name),
	}


def owner_dto(item):
	"""Owner DTO = staff DTO today. Margin/cost stay in ERPNext Desk, owner-only."""
	return staff_dto(item)
