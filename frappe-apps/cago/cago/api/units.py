# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Multi-UOM retail selling (đa đơn vị bán lẻ).

A product is stocked in one UOM (e.g. Bao) but can be sold loose in others (Kg, Lạng,
Yến…) at a DIFFERENT, higher per-unit price. This uses ERPNext natively:

- Item.uoms (UOM Conversion Detail) keeps stock accurate: selling 3 Kg deducts the
  right fraction of a Bao. We store the conversion as 1/(units per stock unit).
- A per-UOM Item Price gives each sale unit its own selling price.

Native ERPNext POS then lets staff pick the UOM at checkout → correct price + stock +
accounting. We only manage the configuration here; ERPNext owns the maths.
"""

import frappe
from frappe import _
from frappe.utils import flt

from cago.utils import dto
from cago.utils.permissions import ensure_owner, ensure_staff

SELLING_PRICE_LIST = dto.SELLING_PRICE_LIST

# Suggestions only — owner enters how many fit in one stock unit + the retail price.
RETAIL_PRESETS = [
	{"uom": "Kg", "hint": "ki-lô-gam"},
	{"uom": "Lạng", "hint": "100g (1 kg = 10 lạng)"},
	{"uom": "Yến", "hint": "10 kg"},
	{"uom": "Gói", "hint": ""},
	{"uom": "Chai", "hint": ""},
]


def _ensure_uom(name):
	if not frappe.db.exists("UOM", name):
		frappe.get_doc({"doctype": "UOM", "uom_name": name}).insert(ignore_permissions=True)


def _uom_rate(item_code, uom):
	return (
		frappe.db.get_value(
			"Item Price",
			{"item_code": item_code, "price_list": SELLING_PRICE_LIST, "selling": 1, "uom": uom},
			"price_list_rate",
		)
		or 0
	)


def _upsert_price(item_code, uom, rate):
	name = frappe.db.get_value(
		"Item Price",
		{"item_code": item_code, "price_list": SELLING_PRICE_LIST, "selling": 1, "uom": uom},
		"name",
	)
	doc = frappe.get_doc("Item Price", name) if name else frappe.new_doc("Item Price")
	if not name:
		doc.item_code = item_code
		doc.price_list = SELLING_PRICE_LIST
		doc.selling = 1
		doc.uom = uom
	doc.price_list_rate = flt(rate)
	doc.save(ignore_permissions=True)


@frappe.whitelist()
def get_units(item_code):
	"""All sale units for a product (stock unit + retail units) with prices."""
	ensure_staff()
	item = frappe.get_doc("Item", item_code)
	stock_uom = item.stock_uom
	main_rate = dto.get_selling_price(item_code)
	units = [
		{
			"uom": stock_uom,
			"is_stock": 1,
			"units_per_stock": 1,
			"rate": main_rate,
			"price_text": dto.format_price(main_rate, stock_uom),
		}
	]
	for row in item.uoms or []:
		if row.uom == stock_uom:
			continue
		rate = _uom_rate(item_code, row.uom)
		ups = round(1.0 / row.conversion_factor, 3) if row.conversion_factor else None
		units.append(
			{
				"uom": row.uom,
				"is_stock": 0,
				"conversion_factor": row.conversion_factor,
				"units_per_stock": ups,
				"rate": rate,
				"price_text": dto.format_price(rate, row.uom),
			}
		)
	return {
		"stock_uom": stock_uom,
		"units": units,
		"show_retail": bool(item.cago_show_retail_on_kiosk),
		"presets": RETAIL_PRESETS,
	}


@frappe.whitelist()
def save_unit(item_code, uom, units_per_stock, price):
	"""Add/update a sale unit. `units_per_stock` = how many of this unit in one stock
	unit (e.g. 1 Bao = 25 Kg → 25). For the stock unit itself pass units_per_stock=1."""
	ensure_owner()
	if not frappe.db.exists("Item", item_code):
		frappe.throw(_("Không tìm thấy sản phẩm."))
	uom = (uom or "").strip()
	if not uom:
		frappe.throw(_("Nhập tên đơn vị."))
	item = frappe.get_doc("Item", item_code)

	if uom == item.stock_uom:
		_upsert_price(item_code, uom, price)  # just the main price
		frappe.db.commit()
		return get_units(item_code)

	ups = flt(units_per_stock)
	if ups <= 0:
		frappe.throw(_("Số đơn vị trong 1 %s phải lớn hơn 0.") % item.stock_uom)
	_ensure_uom(uom)
	conversion = 1.0 / ups  # ERPNext stores factor relative to the stock UOM
	row = next((r for r in item.uoms if r.uom == uom), None)
	if row:
		row.conversion_factor = conversion
	else:
		item.append("uoms", {"uom": uom, "conversion_factor": conversion})
	item.save(ignore_permissions=True)
	_upsert_price(item_code, uom, price)
	frappe.db.commit()
	return get_units(item_code)


@frappe.whitelist()
def remove_unit(item_code, uom):
	ensure_owner()
	item = frappe.get_doc("Item", item_code)
	if uom == item.stock_uom:
		frappe.throw(_("Không thể xoá đơn vị tồn kho."))
	item.uoms = [r for r in item.uoms if r.uom != uom]
	item.save(ignore_permissions=True)
	name = frappe.db.get_value(
		"Item Price",
		{"item_code": item_code, "price_list": SELLING_PRICE_LIST, "selling": 1, "uom": uom},
		"name",
	)
	if name:
		frappe.delete_doc("Item Price", name, ignore_permissions=True)
	frappe.db.commit()
	return get_units(item_code)


@frappe.whitelist()
def set_retail_visible(item_code, visible):
	ensure_owner()
	frappe.db.set_value("Item", item_code, "cago_show_retail_on_kiosk", 1 if int(visible) else 0)
	frappe.db.commit()
	return {"show_retail": bool(int(visible))}
