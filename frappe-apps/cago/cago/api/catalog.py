# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Catalog lookups — barcode scan.

Uses ERPNext's native Item Barcode child table so a USB/handheld scanner (which types
the code + Enter) and native POS scanning both work without extra hardware glue.
"""

import frappe

from cago.utils.permissions import ensure_staff


@frappe.whitelist()
def find_by_barcode(barcode):
	"""Resolve a scanned/typed barcode to its item_code (exact match). Staff may use."""
	ensure_staff()
	code = frappe.db.get_value("Item Barcode", {"barcode": (barcode or "").strip()}, "parent")
	return {"item_code": code}
