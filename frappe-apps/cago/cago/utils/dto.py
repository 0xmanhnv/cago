# Copyright (c) 2026, 0xManhnv
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
from frappe.utils import flt

from cago.utils.safety import safety_warning_for
from cago.utils.slug import slugify as _slugify

WALKIN_NAME = "Khách lẻ"  # the generic cash customer — one source of truth (loyalty excludes it)
SELLING_PRICE_LIST = "Standard Selling"
WHOLESALE_PRICE_LIST = "Giá sỉ"  # optional second selling list for wholesale customers

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
	"""Batch-fetch {group: {icon, color, sort}} in one query (avoids N+1 in lists)."""
	groups = [g for g in set(groups) if g]
	out = {}
	if groups:
		for r in frappe.get_all(
			"Item Group",
			filters={"name": ["in", groups]},
			fields=["name", "cago_icon", "cago_color", "cago_sort_order"],
		):
			out[r.name] = {
				"icon": r.cago_icon or DEFAULT_CATEGORY_ICON,
				"color": r.cago_color or DEFAULT_CATEGORY_COLOR,
				"sort": r.cago_sort_order or 0,
			}
	for g in groups:
		out.setdefault(g, {"icon": DEFAULT_CATEGORY_ICON, "color": DEFAULT_CATEGORY_COLOR, "sort": 0})
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
	"""Selling rate for the STOCK unit (an item may now have per-UOM retail prices too).

	Shares logic with the batch path (_price_map/_rate_for): prefer the stock-uom price,
	then a uom-less price, then any — so multi-UOM retail prices never override the main
	price (and NULL-uom rows are matched correctly).
	"""
	stock_uom = frappe.db.get_value("Item", item_code, "stock_uom")
	return _rate_for(_price_map([item_code]).get(item_code) or {}, stock_uom)


# Weight sale units are stored with neutral, math-style codes (base "Kg" + factor) so the
# data layer never carries Vietnamese strings, while the UI always shows the Vietnamese name.
# Codes: kg10 = yến (10kg), kg100 = tạ (100kg), kg1000 = tấn (1000kg). Anything not in the map
# (Bao, Kg, Gói, Chai, …) is shown verbatim. "Nos" is ERPNext's default count UOM (Numbers) — it
# must never leak to the Vietnamese kiosk, so it (and "Unit") map to "Cái".
UOM_LABELS = {"kg10": "Yến", "kg100": "Tạ", "kg1000": "Tấn", "Nos": "Cái", "Unit": "Cái"}


def uom_label(uom):
	"""Vietnamese display label for a UOM code (codes pass through if not a weight code)."""
	return UOM_LABELS.get(uom, uom)


def format_price(rate, uom=None):
	"""Format a VND amount the way a rural customer reads it: 320.000đ / Bao."""
	# Treat anything that rounds to 0đ as "no price set" — a sub-1đ rate (rounding crumb) must not
	# render as a free "0đ". Negative amounts (returns) still format normally.
	if not rate or (rate > 0 and round(rate) == 0):
		return "Liên hệ"
	text = f"{int(round(rate)):,}".replace(",", ".") + "đ"
	if uom:
		text += f" / {uom_label(uom)}"
	return text


# --------------------------------------------------------------------------- #
# Expiry (lô + hạn sử dụng) — Phase 1. Uses ERPNext Batch.expiry_date.
# --------------------------------------------------------------------------- #
EXPIRY_WARN_DAYS = 60  # default; owner can override via Company.cago_expiry_warn_days (Settings)


def expiry_warn_days():
	"""Days-before-expiry that count as 'sắp hết hạn'. Owner-set on Company, else the default.
	Memoised on frappe.flags so a list of N items reads it once, not once per item (no N+1)."""
	import frappe

	cached = getattr(frappe.flags, "cago_expiry_warn_days", None)
	if cached is not None:
		return cached
	days = EXPIRY_WARN_DAYS
	try:
		from cago.api import debt

		days = int(frappe.db.get_value("Company", debt._company(), "cago_expiry_warn_days") or 0) or EXPIRY_WARN_DAYS
	except Exception:
		days = EXPIRY_WARN_DAYS
	frappe.flags.cago_expiry_warn_days = days
	return days


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
	if days <= expiry_warn_days():
		return "near"
	return "ok"


def nearest_expiry(item_code):
	"""Expiry of the lot that would actually be sold next (FEFO): the earliest-expiring batch that
	STILL HAS STOCK at the selling warehouse. Each receive makes a new Batch, so a sold-out old lô
	must NOT drag the product to 'sắp hết hạn' when the on-hand stock is a newer lô with a later
	date — mirrors how cago.api.sales._auto_batch picks the lot at checkout. None when no in-stock
	dated lot (so the detail simply shows no HSD rather than a stale one)."""
	batches = frappe.get_all(
		"Batch",
		filters={"item": item_code, "disabled": 0, "expiry_date": ["is", "set"]},
		fields=["name", "expiry_date"],
		order_by="expiry_date asc",
	)
	if not batches:
		return None
	try:
		from erpnext.stock.doctype.batch.batch import get_batch_qty
	except Exception:
		return batches[0].expiry_date  # can't measure per-lot qty → keep prior (earliest) behaviour
	wh = selling_warehouse()
	for b in batches:  # already nearest-expiry first
		try:
			qty = flt(get_batch_qty(b.name, wh, item_code)) if wh else flt(get_batch_qty(batch_no=b.name, item_code=item_code))
		except Exception:
			qty = 0
		if qty > 0:
			return b.expiry_date
	return None


def _expiry_dto(item_code):
	"""Shared expiry block for detail DTOs (kiosk + staff)."""
	exp = nearest_expiry(item_code)
	return {
		"nearest_expiry": exp,
		"expiry_text": format_date_vi(exp),
		"expiry_status": expiry_status(exp),
	}


def selling_warehouse():
	"""The warehouse a counter sale draws from — on-hand for stock status MUST be measured here, not
	summed across every warehouse (transit/scrap/another branch), or the shelf shows "Còn hàng" while
	the counter is empty. Mirrors cago.api.sales._warehouse; cached per request to stay cheap."""
	if frappe.flags.get("cago_selling_warehouse") is not None:
		return frappe.flags.cago_selling_warehouse or None
	company = frappe.defaults.get_global_default("company") or frappe.db.get_value("Company", {}, "name")
	wh = None
	for name in ("Stores", "Finished Goods"):
		wh = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0, "warehouse_name": name}, "name")
		if wh:
			break
	wh = wh or frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")
	frappe.flags.cago_selling_warehouse = wh or ""
	return wh


def get_actual_qty(item_code):
	"""On-hand qty at the selling warehouse (ERPNext Bin)."""
	bin_table = frappe.qb.DocType("Bin")
	q = frappe.qb.from_(bin_table).select(Sum(bin_table.actual_qty)).where(bin_table.item_code == item_code)
	wh = selling_warehouse()
	if wh:
		q = q.where(bin_table.warehouse == wh)
	result = q.run()
	return (result[0][0] if result and result[0] else 0) or 0


def bin_qty_map(codes):
	"""Batch on-hand qty for many items in one query: {item_code: qty} at the selling warehouse."""
	codes = [c for c in set(codes) if c]
	if not codes:
		return {}
	bin_table = frappe.qb.DocType("Bin")
	q = (
		frappe.qb.from_(bin_table)
		.select(bin_table.item_code, Sum(bin_table.actual_qty).as_("q"))
		.where(bin_table.item_code.isin(codes))
		.groupby(bin_table.item_code)
	)
	wh = selling_warehouse()
	if wh:
		q = q.where(bin_table.warehouse == wh)
	rows = q.run(as_dict=True)
	return {r.item_code: flt(r.q) for r in rows}


def stock_status_for(item, qty):
	"""Displayed stock status: auto from real qty + reorder level when cago_stock_auto, else the
	owner's manual status. Items that don't need counting (auto off, no manual status set — dây,
	đinh, dịch vụ…) default to "Còn hàng" (always available, no number) so the kiosk/assistant never
	shows the confusing "tồn kho không rõ". (qty is on-hand in the stock UOM.)"""
	if not _get(item, "cago_stock_auto"):
		return _get(item, "cago_stock_status_manual") or "Còn hàng"
	reorder = flt(_get(item, "cago_reorder_level"))
	if flt(qty) <= 0:
		return "Hết hàng"
	if reorder and flt(qty) <= reorder:
		return "Còn ít"
	return "Còn hàng"


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
	"cago_stock_auto",
	"cago_allow_oversell",
	"cago_recommended",
	"cago_reorder_level",
	"cago_shelf_location",
	"cago_is_chemical",
	"cago_safety_notes",
	"cago_kiosk_sort_order",
	"has_batch_no",
]


# --------------------------------------------------------------------------- #
# Search
# --------------------------------------------------------------------------- #
def best_seller_codes(days=30, limit=10):
	"""Ordered list of top-selling PUBLIC item_codes over the last `days` (returns excluded).

	Ranked by HOW OFTEN sold (count of sale lines), NOT by summed quantity — quantities aren't
	comparable across items with different stock UOMs (Bao vs Kg vs Chai), so a feed sold by the bag
	would lose to fertiliser sold by the kg. Frequency = "nhiều người mua" = the real 'bán chạy'.
	30-day window keeps it season-aware (an off-season top item drops off). Cached ~1h so the 🏆
	badge + kiosk row don't re-aggregate Sales Invoices on every product-list request. [] when no sales."""
	cache = frappe.cache()
	key = f"cago:best_sellers:{days}:{limit}"
	cached = cache.get_value(key)
	if cached is not None:
		return cached
	from frappe.query_builder import Order
	from frappe.query_builder.functions import Count
	from frappe.utils import add_days, today

	si = frappe.qb.DocType("Sales Invoice")
	sii = frappe.qb.DocType("Sales Invoice Item")
	item = frappe.qb.DocType("Item")
	start = add_days(today(), -int(days))
	try:
		rows = (
			frappe.qb.from_(sii)
			.join(si).on(sii.parent == si.name)
			.join(item).on(sii.item_code == item.name)
			.select(sii.item_code)
			.where(
				(si.docstatus == 1) & (si.is_return == 0) & (si.posting_date >= start)
				& (item.disabled == 0) & (item.cago_is_public_visible == 1) & (item.is_stock_item == 1)
			)
			.groupby(sii.item_code)
			.orderby(Count(sii.name), order=Order.desc)
			.limit(int(limit))
		).run(as_dict=True)
		codes = [r.item_code for r in rows]
	except Exception:
		codes = []
	cache.set_value(key, codes, expires_in_sec=3600)
	return codes


def _price_map(codes):
	"""Batch-fetch selling prices for many items in a single query, keyed by uom so a
	per-UOM retail price never shadows the stock-unit price. Returns {code: {uom: rate}}."""
	if not codes:
		return {}
	rows = frappe.get_all(
		"Item Price",
		filters={"price_list": SELLING_PRICE_LIST, "selling": 1, "item_code": ["in", codes]},
		fields=["item_code", "uom", "price_list_rate"],
	)
	out = {}
	for r in rows:
		out.setdefault(r.item_code, {})[r.uom or ""] = r.price_list_rate
	return out


def _rate_for(pmap, stock_uom):
	"""Pick the BASE (stock-unit) rate from a per-uom price map.

	Only the stock-uom price (or a uom-less price) is a valid base rate. We must NOT fall back to
	an arbitrary larger-unit price (e.g. a per-Yến/per-bao price) — that would show/charge a 10×–
	1000× rate as if it were per-kg. A missing base price reads as 0 → "Liên hệ", never a wrong price.
	"""
	if not pmap:
		return 0
	return pmap.get(stock_uom) or pmap.get("") or 0


def list_dtos(query, audience="staff", public_only=False, category=None, limit=24, start=0, recommended_only=False, codes=None):
	"""Lightweight list/search results built with 2 queries total (items + prices).

	List cards don't need alternatives or live stock qty, so we skip the per-item
	get_doc/Bin/alternative lookups that the detail DTOs use (avoids N+1).
	"""
	base = {"disabled": 0}
	if public_only:
		base["cago_is_public_visible"] = 1
	if recommended_only:
		base["cago_recommended"] = 1
	if codes:
		base["name"] = ["in", list(codes)]
	if category:
		# The URL carries a slug (e.g. "cam-chan-nuoi"); resolve it back to the group name.
		# Accepts a real group name too (back-compat). Unknown → keep as-is (yields no match).
		from cago.utils.slug import group_from_slug

		category = group_from_slug(category) or category
		# Flat cago_parent taxonomy: a top-level category aggregates its OWN products + its children's;
		# a child (cago_parent set) is just itself — skip the children lookup entirely in that case
		# (2-level rule → a child has none). frappe.get_all (not get_list) so the kiosk Guest works too.
		if frappe.db.get_value("Item Group", category, "cago_parent"):
			base["item_group"] = category
		else:
			children = frappe.get_all("Item Group", filters={"cago_parent": category}, pluck="name")
			base["item_group"] = ["in", [category, *children]] if children else category

	if query and query.strip():
		like = f"%{query.strip()}%"
		rows = frappe.get_all(
			"Item",
			filters=base,
			or_filters=[[f, "like", like] for f in SEARCH_FIELDS],
			fields=LIST_FIELDS,
			limit=limit,
			limit_start=start,
			order_by="item_name asc",
		)
	else:
		rows = frappe.get_all(
			"Item",
			filters=base,
			fields=LIST_FIELDS,
			limit=limit,
			limit_start=start,
			order_by="cago_kiosk_sort_order asc, item_name asc",
		)

	prices = _price_map([r.name for r in rows])
	cat_meta = category_meta_map([r.item_group for r in rows])
	# on-hand only needed for auto-status items, but one grouped query is cheap
	qty_map = bin_qty_map([r.name for r in rows if r.get("cago_stock_auto")])
	bs = set(best_seller_codes())  # cached; for the 🔥 badge
	# Near-expiry flag for the sell screen — only for lot-tracked items (most aren't), so the list
	# stays cheap. Never for the kiosk (customers don't see HSD).
	exp_map = {}
	if audience != "public":
		for r in rows:
			if r.get("has_batch_no"):
				exp = nearest_expiry(r.name)
				if exp:
					exp_map[r.name] = {"expiry_text": format_date_vi(exp), "expiry_status": expiry_status(exp)}
	return [
		_list_dto(r, _rate_for(prices.get(r.name) or {}, r.stock_uom), audience, cat_meta, qty_map, bs, exp_map)
		for r in rows
	]


def _list_dto(r, rate, audience, cat_meta=None, qty_map=None, bs_set=None, exp_map=None):
	meta = (cat_meta or {}).get(r.item_group) or category_meta(r.item_group)
	out = {
		"item_code": r.name,
		"display_name": r.cago_display_name or r.item_name,
		"image": r.image,
		"price_text": format_price(rate, r.stock_uom),
		"stock_status": stock_status_for(r, (qty_map or {}).get(r.name, 0)),
		"is_chemical": bool(r.cago_is_chemical),
		"recommended": bool(r.get("cago_recommended")),  # ⭐ owner-picked "khuyên dùng"; public-safe
		"best_seller": r.name in (bs_set or ()),  # 🔥 top-selling (computed); public-safe
		"category": r.item_group,
		"category_icon": meta["icon"],
		"category_color": meta["color"],
	}
	if audience == "public":
		out.update(
			{
				"category": r.item_group,
				"unit": uom_label(r.stock_uom),  # display-only (kiosk wanted-list sends no uom) → safe to label
				"public_description": r.cago_public_description,
				"use_cases": r.cago_use_cases,
				"package_color": r.cago_package_color,
				"safety_notes": safety_warning_for(r),
			}
		)
	else:  # staff / owner
		out.update(
			{
				"shelf_location": r.cago_shelf_location,
				"selling_price": rate,
				# Real on-hand so the sell screen can warn BEFORE checkout. Only meaningful when the
				# item auto-tracks stock; manual-status items report stock_auto=False (don't enforce).
				"stock_auto": bool(r.cago_stock_auto),
				"actual_stock_qty": (qty_map or {}).get(r.name, 0) if r.get("cago_stock_auto") else None,
				# Whether this item may be sold beyond stock (default off) — the till uses it to decide
				# between a "Vẫn bán?" confirm (allowed) and a hard block (not allowed).
				"allow_oversell": bool(r.get("cago_allow_oversell")),
				"has_batch": bool(r.get("has_batch_no")),  # lot-tracked → till shows the lô that'll sell
				"unit": r.stock_uom,  # so the till can label the exact on-hand count (Còn N <đơn vị>)
			}
		)
		out.update((exp_map or {}).get(r.name, {}))  # near-expiry flag (lot-tracked items only)
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
def sale_units(item):
	"""Sale units + display prices: the stock unit plus any priced retail units
	(kg/lạng/yến…). Each retail price is its own Item Price (may differ from bulk)."""
	code = item.name
	out = [
		{
			"uom": item.stock_uom,
			"label": uom_label(item.stock_uom),
			"price_text": format_price(get_selling_price(code), item.stock_uom),
		}
	]
	for row in _get(item, "uoms") or []:
		if row.uom == item.stock_uom:
			continue
		rate = frappe.db.get_value(
			"Item Price",
			{"item_code": code, "price_list": SELLING_PRICE_LIST, "selling": 1, "uom": row.uom},
			"price_list_rate",
		)
		if rate:
			out.append({"uom": row.uom, "label": uom_label(row.uom), "price_text": format_price(rate, row.uom)})
	return out


def sale_units_from_prices(prices, stock_uom):
	"""Build sale_units from a prefetched per-uom price map {uom: rate} — the BATCH path, with no
	per-item DB calls (used by catalog_snapshot). Mirrors sale_units(): stock unit first, then any
	priced retail UOM."""
	units = [
		{"uom": stock_uom, "label": uom_label(stock_uom), "price_text": format_price(_rate_for(prices, stock_uom), stock_uom)}
	]
	for uom, rate in (prices or {}).items():
		if not uom or uom == stock_uom or not rate:
			continue
		units.append({"uom": uom, "label": uom_label(uom), "price_text": format_price(rate, uom)})
	return units


def public_dto(item):
	"""Kiosk-safe DTO. No price number, no internal fields — only display text."""
	rate = get_selling_price(item.name)
	qty = get_actual_qty(item.name) if _get(item, "cago_stock_auto") else 0
	return {
		"item_code": item.name,
		"display_name": item.cago_display_name or item.item_name,
		"category": item.item_group,
		"category_slug": _slugify(item.item_group),
		**{f"category_{k}": v for k, v in category_meta(item.item_group).items()},
		"image": item.image,
		"images": image_list(item),
		"price_text": format_price(rate, item.stock_uom),
		"unit": uom_label(item.stock_uom),  # display-only on the kiosk → safe to label (no uom in wanted-list)
		"public_description": item.cago_public_description,
		"use_cases": item.cago_use_cases,
		"label_instructions": _get(item, "cago_label_instructions"),
		"package_color": item.cago_package_color,
		"stock_status": stock_status_for(item, qty),
		"is_chemical": bool(item.cago_is_chemical),
		"recommended": bool(_get(item, "cago_recommended")),
		"best_seller": item.name in set(best_seller_codes()),
		"safety_notes": safety_warning_for(item),
		# No expiry on the kiosk: HSD is operational — for the owner (handle/clear stock) and staff
		# (sell the nearest-expiry lot first). Customers don't need it. Kept in staff_dto/owner_dto.
		**({"sale_units": sale_units(item)} if _get(item, "cago_show_retail_on_kiosk") else {}),
	}


def staff_dto(item):
	"""Staff DTO: selling price + operational fields. No buying price / margin."""
	rate = get_selling_price(item.name)
	qty = get_actual_qty(item.name)
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
		"stock_status": stock_status_for(item, qty),
		"actual_stock_qty": qty,
		"stock_auto": bool(_get(item, "cago_stock_auto")),
		"has_batch": bool(_get(item, "has_batch_no")),  # show the per-lô list (HSD) to staff/owner
		"allow_oversell": bool(_get(item, "cago_allow_oversell")),
		"shelf_location": item.cago_shelf_location,
		"public_description": item.cago_public_description,
		"staff_advice": item.cago_staff_advice,
		"label_instructions": _get(item, "cago_label_instructions"),
		"use_cases": item.cago_use_cases,
		"crop_or_animal_targets": item.cago_crop_or_animal_targets,
		"package_color": item.cago_package_color,
		"quality_tier": item.cago_product_quality_tier,
		"call_owner_when": item.cago_call_owner_when,
		"alternatives": get_alternatives(item.name),
		"is_chemical": bool(item.cago_is_chemical),
		"recommended": bool(_get(item, "cago_recommended")),
		"best_seller": item.name in set(best_seller_codes()),
		"safety_notes": safety_warning_for(item),
		**_expiry_dto(item.name),
		"sale_units": sale_units(item),
	}


def owner_dto(item):
	"""Owner DTO = staff DTO today. Margin/cost stay in ERPNext Desk, owner-only."""
	return staff_dto(item)
