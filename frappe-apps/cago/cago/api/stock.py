# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Kho hàng — inventory-VALUE overview.

How much money is sitting in stock (giá trị tồn = on-hand × giá vốn), per product + store totals.
OWNER ONLY: valuation is cost-derived and staff must never see cost (docs/28). Values come straight
from ERPNext's Bin.stock_value (no recompute). Items received without a cost read 0đ value — the
owner fixes that by entering giá vốn when receiving.
"""

import frappe
from frappe.utils import cint, flt

from cago.utils import dto
from cago.utils.permissions import ensure_owner


def _company():
	return frappe.defaults.get_global_default("company") or (frappe.get_all("Company", pluck="name") or [None])[0]


_SORTS = ("value_desc", "value_asc", "qty_desc", "qty_asc", "name_asc", "name_desc")


@frappe.whitelist()
def inventory_overview(query=None, category=None, sort=None, start=0, limit=24):
	"""Owner: paginated inventory-value list + store totals (giá trị tồn, số mã, tổng SL)."""
	ensure_owner()
	start, limit = cint(start), cint(limit) or 24

	base = {"disabled": 0, "is_stock_item": 1}
	if category:
		from cago.utils.slug import group_from_slug

		grp = group_from_slug(category) or category
		if frappe.db.get_value("Item Group", grp, "cago_parent"):
			base["item_group"] = grp
		else:
			children = frappe.get_all("Item Group", filters={"cago_parent": grp}, pluck="name")
			base["item_group"] = ["in", [grp, *children]] if children else grp

	q = (query or "").strip()
	if q:
		codes = frappe.get_all("Item", filters=base, or_filters=[[f, "like", f"%{q}%"] for f in dto.SEARCH_FIELDS], pluck="name")
	else:
		codes = frappe.get_all("Item", filters=base, pluck="name")
	if not codes:
		return {"rows": [], "total_value_text": _vnd(0), "total_qty_text": "0", "sku_count": 0, "has_more": False}

	# On-hand qty + stock value per item, summed across the store's (non-group) warehouses, in one query.
	company = _company()
	warehouses = frappe.get_all("Warehouse", filters={"company": company, "is_group": 0}, pluck="name") if company else []
	qty_map, val_map = {}, {}
	if warehouses:
		for b in frappe.get_all(
			"Bin",
			filters={"item_code": ["in", codes], "warehouse": ["in", warehouses]},
			fields=["item_code", "actual_qty", "stock_value"],
		):
			qty_map[b.item_code] = qty_map.get(b.item_code, 0) + flt(b.actual_qty)
			val_map[b.item_code] = val_map.get(b.item_code, 0) + flt(b.stock_value)

	meta = {
		r.name: r
		for r in frappe.get_all(
			"Item", filters={"name": ["in", codes]}, fields=["name", "item_name", "cago_display_name", "image", "stock_uom"]
		)
	}
	rows = [
		{
			"item_code": c,
			"display_name": meta[c].cago_display_name or meta[c].item_name,
			"image": meta[c].image,
			"unit": meta[c].stock_uom,
			"qty": qty_map.get(c, 0),
			"stock_value": val_map.get(c, 0),
		}
		for c in codes
		if c in meta and qty_map.get(c, 0)  # Kho hàng = what's actually IN stock; drop 0 on-hand (clutter)
	]

	# Store totals across ALL matching items (not just the page) for the KPI card.
	total_value = sum(r["stock_value"] for r in rows)
	total_qty = sum(r["qty"] for r in rows)
	sku_count = len(rows)

	keyfns = {
		"value_desc": lambda r: -r["stock_value"],
		"value_asc": lambda r: r["stock_value"],
		"qty_desc": lambda r: -r["qty"],
		"qty_asc": lambda r: r["qty"],
		"name_asc": lambda r: (r["display_name"] or "").lower(),
		"name_desc": lambda r: "",  # handled below
	}
	if sort == "name_desc":
		rows.sort(key=lambda r: (r["display_name"] or "").lower(), reverse=True)
	else:
		rows.sort(key=keyfns.get(sort, keyfns["value_desc"]))  # default: most money tied up first

	page = rows[start : start + limit]
	for r in page:
		r["qty_text"] = _qty(r["qty"])
		# In stock but 0 value = no giá vốn entered yet → say so (nudge the owner) instead of a bare "0đ".
		r["value_text"] = _vnd(r["stock_value"]) if round(flt(r["stock_value"])) else "Chưa có giá vốn"
	return {
		"rows": page,
		"total_value_text": _vnd(total_value),
		"total_qty_text": _qty(total_qty),
		"sku_count": sku_count,
		"has_more": start + limit < len(rows),
	}


def _vnd(n):
	"""Inventory value in VND — a real 0 shows '0đ' (no cost yet), never format_price's 'Liên hệ'."""
	return f"{int(round(flt(n))):,}".replace(",", ".") + "đ"


def _qty(n):
	"""Group a (possibly fractional, possibly negative) quantity the VN way: 13578.7 -> '13.578,7',
	675 -> '675', -0.5 -> '-0,5', 0.999 -> '1'. Rounds to 2dp FIRST so a 0.999 carries into the whole
	(was '0,0') and keeps the sign for a -1<n<0 balance (was a wrong positive '0,5')."""
	n = flt(n)
	neg = n < 0
	r = round(abs(n), 2)
	whole = int(r)
	grouped = f"{whole:,}".replace(",", ".")
	frac = round(r - whole, 2)
	if frac:
		grouped += "," + f"{frac:.2f}".split(".")[1].rstrip("0")
	return ("-" if neg and (whole or frac) else "") + grouped
