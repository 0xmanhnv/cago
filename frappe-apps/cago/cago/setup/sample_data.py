# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Sample-data import for Milestone 1.

Loads `data/sample_products.csv` into ERPNext as Items (with AgriMate custom fields)
and matching selling Item Prices. Idempotent: re-running updates existing records
instead of creating duplicates.

Run from your frappe-bench directory:

    bench --site <site> execute cago.setup.sample_data.import_sample_products

Optionally pass a different CSV path:

    bench --site <site> execute cago.setup.sample_data.import_sample_products \\
        --kwargs "{'csv_path': '/absolute/path/to/products.csv'}"
"""

import csv
import os

import frappe
from frappe.utils import cint, flt

DEFAULT_PRICE_LIST = "Standard Selling"

# CSV columns that map onto Item custom fields verbatim.
AGRI_TEXT_FIELDS = [
	"cago_display_name",
	"cago_local_names",
	"cago_public_description",
	"cago_staff_advice",
	"cago_use_cases",
	"cago_crop_or_animal_targets",
	"cago_package_color",
	"cago_shelf_location",
	"cago_stock_status_manual",
	"cago_safety_notes",
	"cago_image_gallery",
]
AGRI_CHECK_FIELDS = [
	"cago_is_chemical",
	"cago_is_public_visible",
]


def import_sample_products(csv_path=None):
	"""Import / update Items and selling prices from a products CSV."""
	csv_path = csv_path or _default_csv_path()
	if not os.path.exists(csv_path):
		frappe.throw(f"CSV không tìm thấy: {csv_path}")

	# A freshly created site (no setup wizard) has no default price lists, so make
	# sure the selling price list exists before we attach Item Prices to it.
	_ensure_price_list(DEFAULT_PRICE_LIST)

	# Category icon/colour is DATA on the Item Group (owner-editable), not hardcoded
	# keyword matching in the UI — make sure the fields exist before seeding presets.
	from cago.setup.custom_fields import (
		ensure_category_fields,
		ensure_customer_fields,
		ensure_payment_fields,
		ensure_retail_field,
		ensure_stock_fields,
	)

	ensure_category_fields()
	ensure_retail_field()
	ensure_stock_fields()
	ensure_customer_fields()
	ensure_payment_fields()

	created, updated = 0, 0
	with open(csv_path, encoding="utf-8-sig") as fh:
		for row in csv.DictReader(fh):
			row = {k: (v.strip() if isinstance(v, str) else v) for k, v in row.items()}
			item_code = row.get("item_code")
			if not item_code:
				continue

			_ensure_item_group(row.get("item_group"))
			_ensure_uom(row.get("stock_uom"))

			existed = frappe.db.exists("Item", item_code)
			_upsert_item(row)
			_upsert_selling_price(item_code, flt(row.get("selling_price")), row.get("stock_uom"))

			if existed:
				updated += 1
			else:
				created += 1
			print(f"  {'updated' if existed else 'created'}: {item_code}")

	seed_category_presets()
	seed_sample_batches()
	frappe.db.commit()
	print(f"Done. Created {created}, updated {updated} item(s). Price list: {DEFAULT_PRICE_LIST}.")
	return {"created": created, "updated": updated}


# Initial category presentation (icon + colour). This is editable DATA — owners can
# change it per Item Group; it is NOT logic. Categories not listed get neutral defaults.
CATEGORY_PRESETS = {
	"Cám chăn nuôi": ("🐔", "#fef3c7"),
	"Phân bón": ("🌱", "#dcfce7"),
	"Thuốc chuột": ("🐀", "#fee2e2"),
	"Thuốc bảo vệ thực vật": ("🐛", "#e0e7ff"),
	"Thuốc cỏ": ("🌿", "#d1fae5"),
	"Hạt giống": ("🌰", "#fef9c3"),
	"Dụng cụ": ("🧰", "#e6f4ea"),
}


def seed_category_presets():
	"""Set a sensible icon/colour on known sample categories (only if unset)."""
	for group, (icon, color) in CATEGORY_PRESETS.items():
		if not frappe.db.exists("Item Group", group):
			continue
		if not frappe.db.get_value("Item Group", group, "cago_icon"):
			frappe.db.set_value("Item Group", group, {"cago_icon": icon, "cago_color": color})
			print(f"  category preset: {group} {icon}")


def seed_sample_batches():
	"""Give chemical sample items demo batches with expiry so the Phase 1 expiry
	report/badges have data out of the box. Idempotent (skips existing batch ids)."""
	from frappe.utils import add_days, nowdate

	chem_items = frappe.get_all(
		"Item", filters={"disabled": 0, "cago_is_chemical": 1}, pluck="name"
	)
	for item_code in chem_items:
		item = frappe.get_doc("Item", item_code)
		if not item.has_batch_no:
			item.has_batch_no = 1
			item.create_new_batch = 1
			item.save(ignore_permissions=True)
		# one batch near expiry (30 days) + one comfortably in date (400 days)
		for suffix, days in (("L1", 30), ("L2", 400)):
			batch_id = f"{item_code}-{suffix}"
			if frappe.db.exists("Batch", {"batch_id": batch_id, "item": item_code}):
				continue
			frappe.get_doc(
				{
					"doctype": "Batch",
					"batch_id": batch_id,
					"item": item_code,
					"expiry_date": add_days(nowdate(), days),
				}
			).insert(ignore_permissions=True)
			print(f"  batch: {batch_id} (HSD +{days}d)")


def _default_csv_path():
	return os.path.join(frappe.get_app_path("cago"), "data", "sample_products.csv")


def _ensure_price_list(name):
	if frappe.db.exists("Price List", name):
		return
	currency = frappe.db.get_default("currency") or "VND"
	frappe.get_doc(
		{
			"doctype": "Price List",
			"price_list_name": name,
			"enabled": 1,
			"selling": 1,
			"currency": currency,
		}
	).insert(ignore_permissions=True)


def _ensure_item_group(name):
	if not name:
		return
	root = _ensure_root_item_group()
	if frappe.db.exists("Item Group", name):
		return
	frappe.get_doc(
		{
			"doctype": "Item Group",
			"item_group_name": name,
			"parent_item_group": root,
			"is_group": 0,
		}
	).insert(ignore_permissions=True)


def _ensure_root_item_group():
	"""Return the name of the Item Group tree root, creating it if the tree is empty.

	A site created without the setup wizard has no Item Groups at all, so the sample
	groups need a single parent to avoid "Multiple root nodes not allowed".
	"""
	root = frappe.db.get_value(
		"Item Group", {"is_group": 1, "parent_item_group": ["in", ["", None]]}, "name"
	)
	if root:
		return root
	if frappe.db.exists("Item Group", "All Item Groups"):
		return "All Item Groups"
	doc = frappe.get_doc(
		{"doctype": "Item Group", "item_group_name": "All Item Groups", "is_group": 1}
	).insert(ignore_permissions=True)
	return doc.name


def _ensure_uom(name):
	if not name or frappe.db.exists("UOM", name):
		return
	frappe.get_doc({"doctype": "UOM", "uom_name": name}).insert(ignore_permissions=True)


def _upsert_item(row):
	item_code = row["item_code"]
	if frappe.db.exists("Item", item_code):
		item = frappe.get_doc("Item", item_code)
	else:
		item = frappe.new_doc("Item")
		item.item_code = item_code

	item.item_name = row.get("item_name") or item_code
	item.item_group = row.get("item_group")
	item.stock_uom = row.get("stock_uom")
	item.is_stock_item = 1
	item.is_sales_item = 1
	if row.get("image"):  # optional main product image (URL / path) from CSV
		item.image = row.get("image")

	for field in AGRI_TEXT_FIELDS:
		if row.get(field) is not None:
			item.set(field, row.get(field))
	for field in AGRI_CHECK_FIELDS:
		item.set(field, cint(row.get(field)))

	item.save(ignore_permissions=True)


def _upsert_selling_price(item_code, rate, uom=None):
	if not rate:
		return
	existing = frappe.db.get_value(
		"Item Price",
		{"item_code": item_code, "price_list": DEFAULT_PRICE_LIST, "selling": 1},
		"name",
	)
	if existing:
		price = frappe.get_doc("Item Price", existing)
	else:
		price = frappe.new_doc("Item Price")
		price.item_code = item_code
		price.price_list = DEFAULT_PRICE_LIST
		price.selling = 1

	price.price_list_rate = rate
	if uom:
		price.uom = uom
	price.save(ignore_permissions=True)
