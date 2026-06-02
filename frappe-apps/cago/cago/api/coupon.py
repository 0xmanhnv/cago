# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Discount coupons (mã giảm giá).

Staff apply a code at checkout (validated server-side so the discount can't be forged); the
owner manages codes. Redemption (usage count) happens inside quick_sale so a code is only
counted on a completed sale.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

from cago.utils import dto
from cago.utils.permissions import ensure_owner, ensure_staff


def _validate(code, subtotal):
	"""Return (coupon_dict, discount_amount) or throw a friendly Vietnamese reason."""
	code = (code or "").strip().upper()
	if not code:
		frappe.throw(_("Nhập mã giảm giá."))
	c = frappe.db.get_value(
		"Cago Coupon",
		code,
		["coupon_code", "is_active", "discount_type", "discount_value", "min_order_amount", "max_uses", "used_count", "valid_from", "valid_to"],
		as_dict=True,
	)
	if not c:
		frappe.throw(_("Mã giảm giá không tồn tại."))
	if not c.is_active:
		frappe.throw(_("Mã giảm giá đã ngừng dùng."))
	today = getdate(nowdate())
	if c.valid_from and getdate(c.valid_from) > today:
		frappe.throw(_("Mã giảm giá chưa tới ngày dùng."))
	if c.valid_to and getdate(c.valid_to) < today:
		frappe.throw(_("Mã giảm giá đã hết hạn."))
	if c.max_uses and cint(c.used_count) >= cint(c.max_uses):
		frappe.throw(_("Mã giảm giá đã hết lượt dùng."))
	if c.min_order_amount and flt(subtotal) < flt(c.min_order_amount):
		frappe.throw(_("Đơn tối thiểu {0} mới dùng được mã này.").format(dto.format_price(c.min_order_amount)))
	if c.discount_type == "Percent":
		disc = round(flt(subtotal) * flt(c.discount_value) / 100.0)
	else:
		disc = flt(c.discount_value)
	disc = max(0, min(disc, flt(subtotal)))
	return c, disc


@frappe.whitelist()
def apply_coupon(code, subtotal):
	"""Staff: validate a code against the current subtotal; returns the discount to preview."""
	ensure_staff()
	c, disc = _validate(code, flt(subtotal))
	return {
		"code": c.coupon_code,
		"discount_amount": disc,
		"discount_text": dto.format_price(disc),
		"type": c.discount_type,
		"value": c.discount_value,
	}


def redeem(code, subtotal):
	"""Validate + increment usage; returns (code, discount). Called inside a completed sale.

	The increment is an ATOMIC guarded UPDATE (not read-then-write): under InnoDB it locks the
	row and re-reads used_count, so two concurrent sales can't both consume the last use of a
	limited code. Runs inside the sale's transaction → rolls back if the sale fails."""
	c, disc = _validate(code, subtotal)
	frappe.db.sql(
		"""UPDATE `tabCago Coupon`
		   SET used_count = used_count + 1
		   WHERE name = %s AND (max_uses = 0 OR used_count < max_uses)""",
		c.coupon_code,
	)
	if not frappe.db.sql("SELECT ROW_COUNT()")[0][0]:  # guard didn't match → cap already reached
		frappe.throw(_("Mã giảm giá đã hết lượt dùng."))
	return c.coupon_code, disc


# --------------------------------------------------------------------------- #
# Owner management
# --------------------------------------------------------------------------- #
@frappe.whitelist()
def list_coupons():
	ensure_owner()
	return frappe.get_all(
		"Cago Coupon",
		fields=["coupon_code", "is_active", "discount_type", "discount_value", "min_order_amount", "max_uses", "used_count", "valid_from", "valid_to", "description"],
		order_by="modified desc",
	)


@frappe.whitelist()
def save_coupon(coupon_code, discount_type, discount_value, min_order_amount=0, max_uses=0, valid_from=None, valid_to=None, is_active=1, description=None):
	ensure_owner()
	code = (coupon_code or "").strip().upper()
	if not code:
		frappe.throw(_("Nhập mã giảm giá."))
	if discount_type not in ("Percent", "Amount"):
		frappe.throw(_("Kiểu giảm không hợp lệ."))
	if flt(discount_value) <= 0:
		frappe.throw(_("Giá trị giảm phải lớn hơn 0."))
	if discount_type == "Percent" and flt(discount_value) > 100:
		frappe.throw(_("Phần trăm giảm không quá 100%."))
	doc = frappe.get_doc("Cago Coupon", code) if frappe.db.exists("Cago Coupon", code) else frappe.new_doc("Cago Coupon")
	doc.coupon_code = code
	doc.discount_type = discount_type
	doc.discount_value = flt(discount_value)
	doc.min_order_amount = flt(min_order_amount)
	doc.max_uses = cint(max_uses)
	doc.valid_from = valid_from or None
	doc.valid_to = valid_to or None
	doc.is_active = cint(is_active)
	doc.description = description
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return list_coupons()


@frappe.whitelist()
def toggle_coupon(coupon_code):
	ensure_owner()
	cur = frappe.db.get_value("Cago Coupon", coupon_code, "is_active")
	frappe.db.set_value("Cago Coupon", coupon_code, "is_active", 0 if cur else 1)
	frappe.db.commit()
	return list_coupons()


@frappe.whitelist()
def delete_coupon(coupon_code):
	ensure_owner()
	if frappe.db.exists("Cago Coupon", coupon_code):
		frappe.delete_doc("Cago Coupon", coupon_code, ignore_permissions=True)
		frappe.db.commit()
	return list_coupons()
