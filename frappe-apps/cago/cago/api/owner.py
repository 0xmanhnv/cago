# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Owner API — tra giá / sửa giá.

Price edits are owner-only (enforced server-side) and every change writes an
Cago Owner Action Log entry.
"""

import re

import frappe
from frappe import _
from frappe.utils import flt, format_datetime

from cago.cago.doctype.cago_owner_action_log.cago_owner_action_log import (
	record_action,
)
from cago.utils import dto
from cago.utils.permissions import ensure_cap, ensure_internal


@frappe.whitelist()
def price_history(item_code, limit=20):
	"""Owner: past selling-price changes for an item (đã được ghi tự động khi sửa giá).

	Reads the existing Cago Owner Action Log (action_type='Price Update') — no new data.
	"""
	ensure_cap("products")
	from frappe.utils import cint

	rows = frappe.get_all(
		"Cago Owner Action Log",
		filters={"action_type": "Price Update", "ref_doctype": "Item", "ref_name": item_code},
		fields=["timestamp", "old_value", "new_value", "user"],
		order_by="timestamp desc",
		limit=cint(limit) or 20,
	)
	return [
		{
			"when": format_datetime(r.timestamp, "dd/MM/yyyy HH:mm"),
			"old_text": dto.format_price(flt(r.old_value)) if r.old_value else "—",
			"new_text": dto.format_price(flt(r.new_value)),
			"up": flt(r.new_value) > flt(r.old_value or 0),
			"by": r.user,
		}
		for r in rows
	]


@frappe.whitelist()
def search_products(query=None):
	"""Owner product search -> list of owner DTOs."""
	ensure_cap("products")
	return dto.list_dtos(query, audience="owner", public_only=False)


@frappe.whitelist()
def get_product(item_code):
	"""Single owner DTO."""
	ensure_cap("products")
	if not frappe.db.exists("Item", item_code):
		frappe.throw(_("Không tìm thấy sản phẩm."))
	return dto.owner_dto(frappe.get_doc("Item", item_code))


@frappe.whitelist()
def update_price(item_code, new_price):
	"""Update the selling Item Price for an item and log the action.

	Returns the new formatted price text for confirmation in the UI.
	"""
	ensure_cap("products")
	if not frappe.db.exists("Item", item_code):
		frappe.throw(_("Không tìm thấy sản phẩm."))

	new_rate = flt(new_price)
	if new_rate <= 0:
		frappe.throw(_("Giá phải lớn hơn 0."))
	# Enforce the giá-sàn floor here too — update_product enforces it, but this separate endpoint
	# must not be a back door to set the catalogue price below cost-protection.
	min_price = flt(frappe.db.get_value("Item", item_code, "cago_min_price"))
	if min_price and new_rate < min_price:
		frappe.throw(_("Giá bán không được thấp hơn giá sàn ({0}).").format(dto.format_price(min_price)))

	old_rate = dto.get_selling_price(item_code)
	uom = frappe.db.get_value("Item", item_code, "stock_uom")
	# No-op: same price → don't write a spurious history row (it would read as a price change).
	if flt(old_rate) == new_rate:
		return {
			"item_code": item_code,
			"old_price_text": dto.format_price(old_rate, uom),
			"new_price_text": dto.format_price(new_rate, uom),
		}
	_upsert_selling_price(item_code, new_rate, uom)

	record_action(
		"Price Update",
		ref_doctype="Item",
		ref_name=item_code,
		old_value=old_rate,
		new_value=new_rate,
	)
	frappe.db.commit()

	return {
		"item_code": item_code,
		"old_price_text": dto.format_price(old_rate, uom),
		"new_price_text": dto.format_price(new_rate, uom),
	}


def _upsert_selling_price(item_code, rate, uom=None):
	# Target the row for THIS uom (the stock unit) so per-UOM retail prices aren't overwritten.
	filters = {"item_code": item_code, "price_list": dto.SELLING_PRICE_LIST, "selling": 1}
	if uom:
		filters["uom"] = uom
	existing = frappe.db.get_value("Item Price", filters, "name")
	if existing:
		price = frappe.get_doc("Item Price", existing)
	else:
		price = frappe.new_doc("Item Price")
		price.item_code = item_code
		price.price_list = dto.SELLING_PRICE_LIST
		price.selling = 1
		if uom:
			price.uom = uom
	price.price_list_rate = rate
	price.save(ignore_permissions=True)


@frappe.whitelist()
def get_wholesale_price(item_code):
	"""Owner: the wholesale (giá sỉ) price for an item's stock unit, if set."""
	_check_item(item_code)
	uom = frappe.db.get_value("Item", item_code, "stock_uom")
	rate = frappe.db.get_value(
		"Item Price",
		{"item_code": item_code, "price_list": dto.WHOLESALE_PRICE_LIST, "selling": 1, "uom": uom},
		"price_list_rate",
	)
	return {"wholesale_price": flt(rate) if rate else None}


@frappe.whitelist()
def set_wholesale_price(item_code, price):
	"""Owner: set/clear the wholesale price (stock unit). 0/empty clears it."""
	_check_item(item_code)
	uom = frappe.db.get_value("Item", item_code, "stock_uom")
	rate = flt(price)
	existing = frappe.db.get_value(
		"Item Price",
		{"item_code": item_code, "price_list": dto.WHOLESALE_PRICE_LIST, "selling": 1, "uom": uom},
		"name",
	)
	if rate <= 0:
		if existing:
			frappe.delete_doc("Item Price", existing, ignore_permissions=True)
		frappe.db.commit()
		return {"wholesale_price": None}
	doc = frappe.get_doc("Item Price", existing) if existing else frappe.new_doc("Item Price")
	doc.update({"item_code": item_code, "price_list": dto.WHOLESALE_PRICE_LIST, "selling": 1, "uom": uom, "price_list_rate": rate})
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"wholesale_price": rate}


# --------------------------------------------------------------------------- #
# Product images (owner can manage from the simplified UI, no ERPNext Desk)
# --------------------------------------------------------------------------- #
def _images(item_code):
	row = frappe.db.get_value("Item", item_code, ["image", "cago_image_gallery"], as_dict=True)
	gallery = [u.strip() for u in re.split(r"[\n,]+", (row.cago_image_gallery or "")) if u.strip()]
	# the full album = main image first (if any) + gallery (deduped)
	album = ([row.image] if row.image else []) + [u for u in gallery if u != row.image]
	return {"item_code": item_code, "main": row.image, "gallery": gallery, "images": album}


def _check_item(item_code):
	ensure_cap("products")
	if not frappe.db.exists("Item", item_code):
		frappe.throw(_("Không tìm thấy sản phẩm."))


@frappe.whitelist()
def get_product_images(item_code):
	_check_item(item_code)
	return _images(item_code)


@frappe.whitelist()
def add_product_image(item_code, image_url):
	"""Append an uploaded image to the product album; first image becomes the main."""
	_check_item(item_code)
	if not image_url:
		frappe.throw(_("Thiếu ảnh."))
	imgs = _images(item_code)
	gallery = imgs["gallery"]
	if image_url not in gallery and image_url != imgs["main"]:
		gallery.append(image_url)
	frappe.db.set_value("Item", item_code, "cago_image_gallery", "\n".join(gallery))
	if not imgs["main"]:  # no main yet -> make this the primary photo
		frappe.db.set_value("Item", item_code, "image", image_url)
	record_action("Other", ref_doctype="Item", ref_name=item_code, new_value=f"add image {image_url}")
	frappe.db.commit()
	return _images(item_code)


@frappe.whitelist()
def set_main_image(item_code, image_url):
	"""Promote an album image to the main product photo."""
	_check_item(item_code)
	frappe.db.set_value("Item", item_code, "image", image_url)
	record_action("Other", ref_doctype="Item", ref_name=item_code, new_value=f"main image {image_url}")
	frappe.db.commit()
	return _images(item_code)


@frappe.whitelist()
def remove_product_image(item_code, image_url):
	"""Remove an image from the album (and clear main if it was the one removed)."""
	_check_item(item_code)
	imgs = _images(item_code)
	gallery = [u for u in imgs["gallery"] if u != image_url]
	frappe.db.set_value("Item", item_code, "cago_image_gallery", "\n".join(gallery))
	if imgs["main"] == image_url:
		frappe.db.set_value("Item", item_code, "image", gallery[0] if gallery else "")
	record_action("Other", ref_doctype="Item", ref_name=item_code, new_value=f"remove image {image_url}")
	frappe.db.commit()
	return _images(item_code)


# --------------------------------------------------------------------------- #
# Unified product editor (owner can update ANY product info in one place)
# --------------------------------------------------------------------------- #
# Only these fields are editable from the simplified UI (never buying price /
# valuation / accounting). Item Price (selling_price) + images are handled too.
EDITABLE_FIELDS = (
	"item_name",
	"cago_display_name",
	"cago_local_names",
	"cago_public_description",
	"cago_use_cases",
	"cago_crop_or_animal_targets",
	"cago_package_color",
	"cago_shelf_location",
	"cago_stock_status_manual",
	"cago_stock_auto",
	"cago_reorder_level",
	"cago_min_price",
	"cago_product_quality_tier",
	"cago_staff_advice",
	"cago_call_owner_when",
	"cago_safety_notes",
	"cago_is_chemical",
	"cago_is_public_visible",
	"disabled",  # "Ngừng bán" — discontinued items vanish from sell/kiosk/alerts/reorder but keep history
)
_CHECKBOX_FIELDS = ("cago_is_chemical", "cago_is_public_visible", "cago_stock_auto", "disabled")
STOCK_STATUS_OPTIONS = ["Còn nhiều", "Còn hàng", "Còn ít", "Hết hàng", "Sắp nhập"]
QUALITY_OPTIONS = ["Phổ thông", "Trung cấp", "Cao cấp"]


@frappe.whitelist()
def get_product_for_edit(item_code):
	"""Raw editable field values (not the display DTO) + price + images + options."""
	_check_item(item_code)
	row = frappe.db.get_value("Item", item_code, list(EDITABLE_FIELDS) + ["stock_uom"], as_dict=True)
	row["item_code"] = item_code
	row["selling_price"] = dto.get_selling_price(item_code)
	row["barcode"] = frappe.db.get_value("Item Barcode", {"parent": item_code}, "barcode") or ""
	row["images"] = _images(item_code)
	row["stock_status_options"] = STOCK_STATUS_OPTIONS
	row["quality_options"] = QUALITY_OPTIONS
	# Suggestions for the free-text "Vị trí để hàng": shelf labels already used on other products +
	# the store-map zone names — so the owner reuses consistent wording (this is a human note; the
	# map itself is located by the product's item_group, not this text).
	shelves = frappe.get_all("Item", filters={"cago_shelf_location": ["not in", ["", None]]}, pluck="cago_shelf_location") or []
	zones = []
	try:
		zones = [z.label for z in frappe.get_single("Cago Store Map").zones if z.label]
	except Exception:
		pass
	row["shelf_suggestions"] = sorted({s for s in (shelves + zones) if s})
	return row


def _set_barcode(item_code, code):
	"""Set/clear a product's barcode (ERPNext Item Barcode child). One barcode per item here."""
	item = frappe.get_doc("Item", item_code)
	item.set("barcodes", [])
	if code:
		item.append("barcodes", {"barcode": code})
	try:
		item.save(ignore_permissions=True)
	except frappe.DuplicateEntryError:
		frappe.throw(_("Mã vạch này đã dùng cho sản phẩm khác."))


@frappe.whitelist()
def update_product(item_code, data):
	"""Update any allowed product fields (+ selling price) in one call. Owner only."""
	_check_item(item_code)
	data = frappe.parse_json(data) if isinstance(data, str) else (data or {})

	updates = {}
	for field in EDITABLE_FIELDS:
		if field in data:
			val = data[field]
			if field in _CHECKBOX_FIELDS:
				val = 1 if str(val) in ("1", "true", "True", "on", "yes") else 0
			updates[field] = val
	if updates:
		frappe.db.set_value("Item", item_code, updates)

	# Barcode (Item Barcode child table — handled outside the field loop).
	if "barcode" in data:
		_set_barcode(item_code, (data.get("barcode") or "").strip())

	# Optional selling price (with a floor guard against selling below cost).
	if data.get("selling_price") not in (None, ""):
		rate = flt(data["selling_price"])
		if rate > 0:
			min_price = flt(frappe.db.get_value("Item", item_code, "cago_min_price"))
			if min_price and rate < min_price:
				frappe.throw(
					_("Giá bán {0} thấp hơn giá sàn {1}. Bác kiểm tra lại.").format(
						dto.format_price(rate), dto.format_price(min_price)
					)
				)
			uom = frappe.db.get_value("Item", item_code, "stock_uom")
			_upsert_selling_price(item_code, rate, uom)

	record_action("Other", ref_doctype="Item", ref_name=item_code, new_value="update product")
	frappe.db.commit()
	return get_product_for_edit(item_code)


# --------------------------------------------------------------------------- #
# Create new product (owner adds an item without ERPNext Desk)
# --------------------------------------------------------------------------- #
# ERPNext seeds these default Item Groups on every new site — they are not our categories and
# must be hidden from the owner's product forms.
ERPNEXT_DEFAULT_GROUPS = ["Products", "Raw Material", "Services", "Sub Assemblies", "Consumable", "All Item Groups"]


@frappe.whitelist()
def get_product_meta():
	"""Options for the create/edit forms: item groups, units, selects."""
	ensure_cap("products")
	groups = frappe.get_all(
		"Item Group",
		filters={"is_group": 0, "name": ["not in", ERPNEXT_DEFAULT_GROUPS]},
		pluck="name",
		order_by="name asc",
	)
	uoms = frappe.get_all("UOM", filters={"enabled": 1}, pluck="name", order_by="name asc")
	return {
		"item_groups": groups,
		"uoms": uoms or ["Bao", "Gói", "Chai", "Cái", "Kg"],
		"stock_status_options": STOCK_STATUS_OPTIONS,
		"quality_options": QUALITY_OPTIONS,
	}


@frappe.whitelist()
def create_product(data):
	"""Create a new Item (+ optional selling price) from the simplified UI.

	A machine item_code is auto-generated (owner only cares about the display name).
	Returns the editable view so the UI can continue (add images, advice, ...).
	"""
	ensure_cap("products")
	data = frappe.parse_json(data) if isinstance(data, str) else (data or {})

	name = (data.get("cago_display_name") or data.get("item_name") or "").strip()
	if not name:
		frappe.throw(_("Nhập tên sản phẩm."))
	item_group = data.get("item_group")
	if not item_group or not frappe.db.exists("Item Group", item_group):
		frappe.throw(_("Chọn nhóm hàng hợp lệ."))
	unit = (data.get("stock_uom") or "").strip() or "Cái"
	if not frappe.db.exists("UOM", unit):
		frappe.get_doc({"doctype": "UOM", "uom_name": unit}).insert(ignore_permissions=True)

	from frappe.model.naming import make_autoname

	code = make_autoname("SP-.#####")
	item = frappe.new_doc("Item")
	item.item_code = code
	item.item_name = name
	item.item_group = item_group
	item.stock_uom = unit
	item.is_stock_item = 1
	item.is_sales_item = 1
	for field in EDITABLE_FIELDS:
		if field in data and field != "item_name":
			val = data[field]
			if field in _CHECKBOX_FIELDS:
				val = 1 if str(val) in ("1", "true", "True", "on", "yes") else 0
			item.set(field, val)
	if not item.cago_display_name:
		item.cago_display_name = name
	if item.cago_is_public_visible is None:
		item.cago_is_public_visible = 1
	item.insert(ignore_permissions=True)

	if flt(data.get("selling_price")) > 0:
		_upsert_selling_price(code, flt(data["selling_price"]), unit)

	record_action("Other", ref_doctype="Item", ref_name=code, new_value=f"create product {name}")
	frappe.db.commit()
	return get_product_for_edit(code)


# --------------------------------------------------------------------------- #
# Zalo/SMS message drafts (owner copies & sends manually — no integration yet)
# --------------------------------------------------------------------------- #
@frappe.whitelist()
def zalo_draft(kind, customer=None, item_code=None):
	"""Generate a ready-to-copy Zalo/SMS message (debt reminder or restock alert)."""
	ensure_internal()
	if kind == "debt_reminder":
		from cago.customer import resolve_customer

		customer = resolve_customer(customer)
		if not customer or not frappe.db.exists("Customer", customer):
			frappe.throw(_("Không tìm thấy khách hàng."))
		from cago.api.debt import get_customer_debt

		d = get_customer_debt(customer)
		name = d["customer_name"]
		if d["outstanding"] <= 0:
			text = f"Chào bác {name}, cảm ơn bác đã mua hàng và thanh toán đầy đủ ạ!"
		else:
			text = (
				f"Chào bác {name}, hiện bác còn nợ cửa hàng {d['outstanding_text']}. "
				f"Khi nào tiện bác ghé trả giúp em nhé. Em cảm ơn bác ạ!"
			)
		return {"text": text}

	if kind == "restock":
		if not item_code or not frappe.db.exists("Item", item_code):
			frappe.throw(_("Không tìm thấy sản phẩm."))
		item = frappe.get_doc("Item", item_code)
		name = item.cago_display_name or item.item_name
		price_text = dto.format_price(dto.get_selling_price(item_code), item.stock_uom)
		text = (
			f"Chào bác, {name} loại bác hay lấy đã về hàng tại cửa hàng ạ. "
			f"Giá hiện tại: {price_text}. Bác qua lấy giúp em nhé!"
		)
		return {"text": text}

	frappe.throw(_("Loại tin không hợp lệ."))


@frappe.whitelist()
def list_categories():
	"""Owner: ALL leaf categories (incl. empty + just-created ones) for the manage/reorder screen.
	Shows a group if it carries a cago icon (owner-managed) or has products — hides ERPNext's
	stock default groups that this shop never uses."""
	ensure_cap("products")
	rows = frappe.get_all(
		"Item Group",
		filters={"is_group": 0},
		fields=["name", "cago_icon", "cago_color", "cago_sort_order"],
		order_by="cago_sort_order asc, name asc",
	)
	out = []
	for r in rows:
		count = frappe.db.count("Item", {"item_group": r.name, "disabled": 0})
		if not (r.cago_icon or count):
			continue
		out.append({"category": r.name, "icon": r.cago_icon or "📦", "color": r.cago_color or "#e6f4ea", "count": count})
	return out


def _root_item_group():
	"""The tree root to hang new leaf categories under (usually 'All Item Groups')."""
	return (
		frappe.db.get_value("Item Group", {"is_group": 1, "parent_item_group": ["in", ["", None]]}, "name")
		or frappe.db.get_value("Item Group", {"is_group": 1}, "name")
		or "All Item Groups"
	)


@frappe.whitelist()
def save_category(name, icon=None, color=None, old_name=None):
	"""Owner: create a new nhóm hàng, or rename/restyle (icon+màu) an existing one.
	Renaming an Item Group updates every product's category automatically (Frappe rename)."""
	ensure_cap("products")
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Nhập tên loại hàng."))
	# Refuse a name that collides with an ERPNext built-in group — otherwise we'd silently restyle a
	# system group, and the owner could never assign products to it (the product forms exclude these).
	if name in ERPNEXT_DEFAULT_GROUPS:
		frappe.throw(_("Tên '{0}' trùng nhóm hệ thống. Hãy chọn tên khác.").format(name))
	old = (old_name or "").strip()
	if old and old != name:
		if not frappe.db.exists("Item Group", old):
			frappe.throw(_("Không tìm thấy loại hàng cần đổi tên."))
		if frappe.db.exists("Item Group", name):
			frappe.throw(_("Đã có loại hàng tên '{0}'.").format(name))
		from cago.utils.privileged import as_user

		with as_user("Administrator"):  # rename_doc enforces perms + this version has no ignore_permissions kwarg
			frappe.rename_doc("Item Group", old, name)
	elif not frappe.db.exists("Item Group", name):
		frappe.get_doc(
			{"doctype": "Item Group", "item_group_name": name, "parent_item_group": _root_item_group(), "is_group": 0}
		).insert(ignore_permissions=True)
	if icon is not None:
		frappe.db.set_value("Item Group", name, "cago_icon", (icon or "").strip() or None)
	if color is not None:
		frappe.db.set_value("Item Group", name, "cago_color", (color or "").strip() or None)
	frappe.db.commit()
	return {"name": name}


@frappe.whitelist()
def delete_category(name):
	"""Owner: delete a nhóm hàng — refused if any product still uses it or it has sub-groups."""
	ensure_cap("products")
	name = (name or "").strip()
	if not frappe.db.exists("Item Group", name):
		return {"deleted": True}
	if frappe.db.exists("Item", {"item_group": name}):
		frappe.throw(_("Còn sản phẩm trong loại '{0}'. Hãy chuyển sản phẩm sang loại khác trước khi xoá.").format(name))
	if frappe.db.exists("Item Group", {"parent_item_group": name}):
		frappe.throw(_("Loại '{0}' còn loại con bên trong.").format(name))
	frappe.delete_doc("Item Group", name, ignore_permissions=True)
	frappe.db.commit()
	return {"deleted": True}


@frappe.whitelist()
def set_category_order(categories):
	"""Owner: persist the display order. `categories` is a JSON list of Item Group names in the
	desired order; we write cago_sort_order = 1..N so the kiosk lists them that way."""
	ensure_cap("products")
	names = frappe.parse_json(categories) if isinstance(categories, str) else (categories or [])
	for i, name in enumerate(names, start=1):
		if frappe.db.exists("Item Group", name):
			frappe.db.set_value("Item Group", name, "cago_sort_order", i)
	frappe.db.commit()
	return {"ordered": len(names)}
