# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Catalog lookups — barcode scan.

Uses ERPNext's native Item Barcode child table so a USB/handheld scanner (which types
the code + Enter) and native POS scanning both work without extra hardware glue.
"""

import frappe

from cago.utils import dto
from cago.utils.permissions import ensure_internal


@frappe.whitelist()
def find_by_barcode(barcode):
	"""Resolve a scanned/typed barcode to its item_code (exact match). Staff may use."""
	ensure_internal()
	code = frappe.db.get_value("Item Barcode", {"barcode": (barcode or "").strip()}, "parent")
	return {"item_code": code}


@frappe.whitelist()
def label_data(codes):
	"""Data for printable shelf labels / price tags: name + selling price + barcode + shelf code.
	After re-pricing the shelf (update_price) staff can reprint tags; the barcode enables scan-to-sell.
	No cost/margin — selling price only. `codes` is a JSON list or comma-separated string of item_codes."""
	ensure_internal()
	if isinstance(codes, str):
		codes = frappe.parse_json(codes) if codes.strip().startswith("[") else [c.strip() for c in codes.split(",")]
	codes = [c for c in (codes or []) if c]
	if not codes:
		return []
	out = []
	for code in codes:
		if not frappe.db.exists("Item", code):
			continue
		item = frappe.db.get_value("Item", code, ["item_name", "cago_display_name", "stock_uom", "cago_shelf_location"], as_dict=True)
		barcode = frappe.db.get_value("Item Barcode", {"parent": code}, "barcode") or code
		out.append(
			{
				"item_code": code,
				"display_name": item.cago_display_name or item.item_name,
				"price_text": dto.format_price(dto.get_selling_price(code), item.stock_uom),
				"barcode": barcode,
				"shelf_location": item.cago_shelf_location or "",
			}
		)
	return out
