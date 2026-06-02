# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Sample-data import for Milestone 1.

Loads `data/sample_products.csv` into ERPNext as Items (with Cago custom fields)
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
	_ensure_price_list("Giá sỉ")  # wholesale selling list (giá sỉ)

	# Category icon/colour is DATA on the Item Group (owner-editable), not hardcoded
	# keyword matching in the UI — make sure the fields exist before seeding presets.
	from cago.setup.custom_fields import (
		ensure_category_fields,
		ensure_customer_fields,
		ensure_loyalty_fields,
		ensure_payment_fields,
		ensure_retail_field,
		ensure_shift_fields,
		ensure_stock_fields,
	)

	ensure_category_fields()
	ensure_retail_field()
	ensure_stock_fields()
	ensure_customer_fields()
	ensure_payment_fields()
	ensure_loyalty_fields()
	ensure_shift_fields()

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

	seed_category_tree()
	seed_category_presets()
	seed_sample_batches()
	frappe.db.commit()
	print(f"Done. Created {created}, updated {updated} item(s). Price list: {DEFAULT_PRICE_LIST}.")
	return {"created": created, "updated": updated}


# Initial category presentation (icon + colour). This is editable DATA — owners can
# change it per Item Group; it is NOT logic. Categories not listed get neutral defaults.
# Icon/colour presets for the categories a rural farm-supply / general store ("tạp hoá nhà nông")
# is likely to use. Grouped by family (parent → children) so the owner can build a tree of Item
# Groups; presets are matched by name and applied to whichever groups actually exist (others wait
# unused). All editable data — owners can change icon/colour per Item Group.
CATEGORY_PRESETS = {
	# Thức ăn chăn nuôi
	"Thức ăn chăn nuôi": ("🐄", "#fef3c7"),
	"Cám chăn nuôi": ("🐔", "#fef3c7"),
	"Cám gà": ("🐔", "#fef3c7"),
	"Cám vịt / ngan": ("🦆", "#fef3c7"),
	"Cám lợn": ("🐷", "#fde2e4"),
	"Cám cá": ("🐟", "#dbeafe"),
	"Cám bò / trâu": ("🐄", "#fef3c7"),
	"Thức ăn bổ sung / khoáng": ("🧂", "#fef9c3"),
	# Phân bón
	"Phân bón": ("🌱", "#dcfce7"),
	"Phân vô cơ (đạm/lân/kali/NPK)": ("🧪", "#dcfce7"),
	"Phân vô cơ": ("🧪", "#dcfce7"),
	"Phân hữu cơ": ("🍂", "#d9f99d"),
	"Phân vi sinh": ("🦠", "#d1fae5"),
	"Phân bón lá": ("💧", "#cffafe"),
	# Thuốc bảo vệ thực vật
	"Thuốc bảo vệ thực vật": ("🧴", "#e0e7ff"),
	"Thuốc trừ sâu bệnh": ("🐛", "#e0e7ff"),
	"Thuốc trừ sâu": ("🐛", "#e0e7ff"),
	"Thuốc trừ bệnh": ("🍄", "#ede9fe"),
	"Thuốc cỏ": ("🌿", "#d1fae5"),
	"Thuốc trừ ốc": ("🐌", "#e0e7ff"),
	"Thuốc chuột": ("🐀", "#fee2e2"),
	"Thuốc kích thích sinh trưởng": ("🌾", "#fef9c3"),
	# Hạt giống
	"Hạt giống": ("🌰", "#fef9c3"),
	"Giống lúa": ("🌾", "#fef9c3"),
	"Giống ngô": ("🌽", "#fef9c3"),
	"Giống rau": ("🥬", "#dcfce7"),
	"Giống đậu / lạc": ("🥜", "#fef9c3"),
	"Giống cây ăn quả": ("🍎", "#fee2e2"),
	"Giống hoa": ("🌸", "#fce7f3"),
	# Thú y
	"Thú y": ("💉", "#dbeafe"),
	"Thuốc thú y": ("💊", "#dbeafe"),
	"Vắc xin": ("💉", "#dbeafe"),
	"Vitamin / khoáng vật nuôi": ("🧴", "#cffafe"),
	# Dụng cụ & vật tư
	"Dụng cụ": ("🧰", "#e6f4ea"),
	"Dụng cụ & vật tư": ("🧰", "#e6f4ea"),
	"Bình phun / máy phun": ("🛢️", "#e6f4ea"),
	"Cuốc / xẻng / liềm": ("🪓", "#e7e5e4"),
	"Bạt / lưới / dây": ("🕸️", "#e7e5e4"),
	"Ống / tưới tiêu": ("🚿", "#cffafe"),
	"Bảo hộ (găng / ủng / khẩu trang)": ("🧤", "#e0f2fe"),
	# Nông sản (bán theo cân: kg / yến / tạ / tấn)
	"Nông sản": ("🌾", "#fef9c3"),
	"Thóc / gạo": ("🌾", "#fef9c3"),
	"Ngô / khoai": ("🌽", "#fef9c3"),
	"Lạc / đậu": ("🥜", "#fef9c3"),
	# Khác (tạp hoá)
	"Tạp hoá": ("🛒", "#fce7f3"),
}


# Parent → child grouping for the kiosk category tree. "Thuốc bảo vệ thực vật" is the umbrella
# (BVTV); the three pesticide types are its children. Owners can re-tree any Item Group later.
CATEGORY_TREE = {
	"Cám chăn nuôi": ["Cám gà", "Cám vịt / ngan", "Cám lợn", "Cám cá", "Cám bò / trâu"],
	"Phân bón": ["Phân vô cơ", "Phân hữu cơ", "Phân vi sinh"],
	"Hạt giống": ["Giống lúa", "Giống ngô", "Giống rau", "Giống đậu / lạc"],
	"Thuốc bảo vệ thực vật": ["Thuốc trừ sâu bệnh", "Thuốc cỏ", "Thuốc chuột"],
	"Nông sản": ["Thóc / gạo", "Ngô / khoai", "Lạc / đậu"],
}


# Bulk produce sold by weight. Stored with neutral math-style unit codes (see
# cago.utils.dto.UOM_LABELS): kg10 = yến (10kg), kg100 = tạ (100kg), kg1000 = tấn (1000kg).
# Every UI shows the Vietnamese label; the data layer only ever sees the code.
PRODUCE_WEIGHT_UNITS = [("kg10", 10), ("kg100", 100), ("kg1000", 1000)]
PRODUCE_SAMPLES = [
	# (item_code, name, sub_group, price_per_kg, local_names, public_description)
	("NS-GAO-TE", "Gạo tẻ", "Thóc / gạo", 18000, "gạo,gạo tẻ", "Gạo tẻ bán theo cân."),
	("NS-THOC-KHO", "Thóc khô", "Thóc / gạo", 9000, "lúa,thóc", "Thóc khô, bán theo cân/yến/tạ/tấn."),
	("NS-NGO-HAT", "Ngô hạt khô", "Ngô / khoai", 10000, "bắp,ngô,ngô hạt", "Ngô hạt khô."),
	("NS-LAC-NHAN", "Lạc nhân", "Lạc / đậu", 38000, "đậu phộng,lạc,lạc nhân", "Lạc nhân (đậu phộng) đã bóc vỏ."),
	("NS-DO-TUONG", "Đỗ tương", "Lạc / đậu", 25000, "đậu nành,đỗ tương,đậu tương", "Đỗ tương (đậu nành) khô."),
]


def seed_produce_samples():
	"""Create the 'Nông sản' tree + bulk-weight produce items sold by kg/yến/tạ/tấn (idempotent)."""
	root = _ensure_root_item_group()
	if not frappe.db.exists("Item Group", "Nông sản"):
		frappe.get_doc(
			{"doctype": "Item Group", "item_group_name": "Nông sản", "parent_item_group": root, "is_group": 1}
		).insert(ignore_permissions=True)
	for child in CATEGORY_TREE["Nông sản"]:
		if not frappe.db.exists("Item Group", child):
			frappe.get_doc(
				{"doctype": "Item Group", "item_group_name": child, "parent_item_group": "Nông sản", "is_group": 0}
			).insert(ignore_permissions=True)
		elif frappe.db.get_value("Item Group", child, "parent_item_group") != "Nông sản":
			g = frappe.get_doc("Item Group", child)
			g.parent_item_group, g.is_group = "Nông sản", 0
			g.save(ignore_permissions=True)

	_ensure_uom("Kg")
	for uom_code, _ in PRODUCE_WEIGHT_UNITS:
		_ensure_uom(uom_code)

	for code, name, grp, kg_price, locals_, desc in PRODUCE_SAMPLES:
		_upsert_item(
			{
				"item_code": code,
				"item_name": name,
				"item_group": grp,
				"stock_uom": "Kg",
				"cago_display_name": name,
				"cago_local_names": locals_,
				"cago_public_description": desc,
				"cago_use_cases": "Nông sản",
				"cago_shelf_location": "Kho nông sản",
				"cago_stock_status_manual": "Còn hàng",
				"cago_is_public_visible": "1",
			}
		)
		item = frappe.get_doc("Item", code)
		for uom_code, factor in PRODUCE_WEIGHT_UNITS:
			r = next((x for x in item.uoms if x.uom == uom_code), None)
			if r:
				r.conversion_factor = factor
			else:
				item.append("uoms", {"uom": uom_code, "conversion_factor": factor})
		item.cago_show_retail_on_kiosk = 1  # show yến/tạ/tấn prices to customers
		item.save(ignore_permissions=True)
		_upsert_selling_price(code, kg_price, "Kg")
		for uom_code, factor in PRODUCE_WEIGHT_UNITS:
			_upsert_selling_price(code, kg_price * factor, uom_code)
		print(f"  produce: {code} {name} {kg_price:,}đ/Kg (+ yến/tạ/tấn)")

	seed_category_presets()
	try:
		from frappe.utils.nestedset import rebuild_tree

		rebuild_tree("Item Group")
	except Exception:
		pass


def seed_category_tree():
	"""Make the configured parent groups and re-parent their children (idempotent)."""
	root = _ensure_root_item_group()
	moved = False
	for parent, children in CATEGORY_TREE.items():
		if not frappe.db.exists("Item Group", parent):
			frappe.get_doc(
				{"doctype": "Item Group", "item_group_name": parent, "parent_item_group": root, "is_group": 1}
			).insert(ignore_permissions=True)
			moved = True
		elif not frappe.db.get_value("Item Group", parent, "is_group"):
			# An existing leaf category becoming a parent (e.g. "Cám chăn nuôi") must be a group node.
			frappe.db.set_value("Item Group", parent, "is_group", 1)
			moved = True
		for child in children:
			if frappe.db.exists("Item Group", child) and frappe.db.get_value("Item Group", child, "parent_item_group") != parent:
				g = frappe.get_doc("Item Group", child)
				g.parent_item_group = parent
				g.is_group = 0
				g.save(ignore_permissions=True)  # NestedSet recomputes lft/rgt
				moved = True
	if moved:
		try:
			from frappe.utils.nestedset import rebuild_tree

			rebuild_tree("Item Group")
		except Exception:
			pass


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
			try:
				item.save(ignore_permissions=True)
			except Exception:
				# ERPNext forbids enabling batch tracking once an item has stock transactions —
				# skip it so a re-import of an already-selling shop doesn't abort mid-way.
				continue
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
			# Receive a little stock into the lot so the chemical is sellable out of the box
			# (selling a batch item needs a received lot — see cago.api.sales._assign_batch).
			try:
				from cago.api import purchasing

				purchasing.receive_stock(item_code, 20, cost_rate=0, batch_no=batch_id)
			except Exception:
				pass
			print(f"  batch: {batch_id} (HSD +{days}d, +20 tồn)")


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
	uom = uom or frappe.db.get_value("Item", item_code, "stock_uom")
	# Update ONLY the main (stock-unit) price. Dedup just the rows for this unit (or legacy
	# blank-unit rows) so a save doesn't hit ERPNext's duplicate check — but DON'T touch the
	# owner's per-unit retail prices (kg/lạng) on the same list, which carry a different uom.
	existing = frappe.get_all(
		"Item Price",
		filters={"item_code": item_code, "price_list": DEFAULT_PRICE_LIST, "selling": 1},
		fields=["name", "uom"],
		order_by="creation asc",
	)
	main = [r.name for r in existing if (r.uom or "") in ("", uom)]
	for extra in main[1:]:
		frappe.delete_doc("Item Price", extra, ignore_permissions=True, force=True)
	if main:
		price = frappe.get_doc("Item Price", main[0])
	else:
		price = frappe.new_doc("Item Price")
		price.item_code = item_code
		price.price_list = DEFAULT_PRICE_LIST
		price.selling = 1

	price.price_list_rate = rate
	if uom:
		price.uom = uom
	price.save(ignore_permissions=True)
