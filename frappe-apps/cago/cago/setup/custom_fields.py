# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Custom fields that aren't product-row data.

Category presentation (icon emoji + colour) belongs to the CATEGORY, set by the
owner — not hardcoded as Vietnamese keyword matching in the UI. We store it on the
Item Group so the kiosk simply renders what the data says, with a neutral default.

    bench --site <site> execute cago.setup.custom_fields.ensure_category_fields
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def ensure_category_fields():
	"""Add cago_icon / cago_color to Item Group (idempotent)."""
	create_custom_fields(
		{
			"Item Group": [
				{
					"fieldname": "cago_icon",
					"label": "Cago Icon (emoji)",
					"fieldtype": "Data",
					"insert_after": "item_group_name",
					"description": "Biểu tượng hiển thị cho danh mục trên kiosk (vd 🐔).",
				},
				{
					"fieldname": "cago_color",
					"label": "Cago Color (hex)",
					"fieldtype": "Data",
					"insert_after": "cago_icon",
					"description": "Màu nền danh mục trên kiosk (vd #fef3c7).",
				},
				{
					"fieldname": "cago_sort_order",
					"label": "Cago Sort Order",
					"fieldtype": "Int",
					"insert_after": "cago_color",
					"description": "Thứ tự hiển thị danh mục trên kiosk (số nhỏ hiện trước). Owner sắp được.",
				},
			]
		},
		ignore_validate=True,
	)
	frappe.db.commit()
	print("Item Group fields ensured: cago_icon, cago_color, cago_sort_order")


def ensure_retail_field():
	"""Per-product toggle: show retail (per-kg/lạng…) prices to customers on the kiosk.
	Staff/POS always see them; this only controls public visibility."""
	create_custom_fields(
		{
			"Item": [
				{
					"fieldname": "cago_show_retail_on_kiosk",
					"label": "Hiện giá bán lẻ trên kiosk",
					"fieldtype": "Check",
					"insert_after": "cago_is_public_visible",
					"description": "Cho khách xem giá theo đơn vị lẻ (kg, lạng…) trên kiosk.",
				}
			]
		},
		ignore_validate=True,
	)
	frappe.db.commit()
	print("Item field ensured: cago_show_retail_on_kiosk")


def ensure_stock_fields():
	"""Auto stock status from real on-hand qty + a reorder threshold."""
	create_custom_fields(
		{
			"Item": [
				{
					"fieldname": "cago_stock_auto",
					"label": "Tự tính tồn theo số thật",
					"fieldtype": "Check",
					"insert_after": "cago_stock_status_manual",
					"description": "Bật: trạng thái tồn tự tính từ số lượng thật + mức đặt lại (thay cho chọn tay).",
				},
				{
					"fieldname": "cago_reorder_level",
					"label": "Mức đặt lại (còn ít khi ≤)",
					"fieldtype": "Float",
					"insert_after": "cago_stock_auto",
					"description": "Theo đơn vị tồn kho. Tồn thật ≤ mức này = 'Còn ít' → gợi ý nhập hàng.",
				},
				{
					"fieldname": "cago_min_price",
					"label": "Giá bán tối thiểu (sàn) / đơn vị tồn",
					"fieldtype": "Currency",
					"insert_after": "cago_reorder_level",
					"description": "Chặn lỡ tay đặt giá thấp hơn giá vốn. Để trống = không chặn. Theo đơn vị tồn (vd /Bao); giá lẻ được quy đổi.",
				},
			]
		},
		ignore_validate=True,
	)
	frappe.db.commit()
	print("Item stock fields ensured: cago_stock_auto, cago_reorder_level, cago_min_price")


def ensure_customer_fields():
	"""Per-customer credit limit (hạn mức nợ) — 0/empty = no limit."""
	create_custom_fields(
		{
			"Customer": [
				{
					"fieldname": "cago_debt_limit",
					"label": "Hạn mức nợ (đồng)",
					"fieldtype": "Currency",
					"insert_after": "cago_debt_note",
					"description": "Chặn ghi nợ khi tổng nợ vượt mức này. Để trống = không giới hạn.",
				},
				{
					"fieldname": "cago_points",
					"label": "Điểm tích lũy",
					"fieldtype": "Int",
					"insert_after": "cago_debt_limit",
					"read_only": 1,
					"description": "Điểm thưởng tích theo doanh số (tự động khi xuất hoá đơn).",
				},
				{
					"fieldname": "cago_wholesale",
					"label": "Khách sỉ (dùng bảng giá sỉ)",
					"fieldtype": "Check",
					"insert_after": "cago_points",
					"description": "Bật: khách này mua theo Giá sỉ (nếu sản phẩm có đặt giá sỉ).",
				},
			]
		},
		ignore_validate=True,
	)
	frappe.db.commit()
	print("Customer fields ensured: cago_debt_limit, cago_points, cago_wholesale")


def ensure_loyalty_fields():
	"""Record points actually awarded on each Sales Invoice, so cancel reverses the EXACT
	amount even if the loyalty rate changed between submit and cancel."""
	create_custom_fields(
		{
			"Sales Invoice": [
				{
					"fieldname": "cago_points_awarded",
					"label": "Cago Points Awarded",
					"fieldtype": "Int",
					"insert_after": "customer",
					"read_only": 1,
					"no_copy": 1,
					"print_hide": 1,
				}
			]
		},
		ignore_validate=True,
	)
	frappe.db.commit()
	print("Sales Invoice loyalty field ensured: cago_points_awarded")


def ensure_shift_fields():
	"""Stamp the real cashier on each till sale so a Cago Till Shift can reconcile the drawer
	per person — quick_sale submits the invoice under Administrator (staff lack the perms), so
	`owner` is not the cashier; this field is."""
	create_custom_fields(
		{
			"Sales Invoice": [
				{
					"fieldname": "cago_cashier",
					"label": "Cago Cashier",
					"fieldtype": "Link",
					"options": "User",
					"insert_after": "cago_points_awarded",
					"read_only": 1,
					"no_copy": 1,
					"print_hide": 1,
				}
			]
		},
		ignore_validate=True,
	)
	frappe.db.commit()
	print("Sales Invoice shift field ensured: cago_cashier")


def ensure_payment_fields():
	"""Store bank account for VietQR (hiện QR để khách chuyển khoản)."""
	create_custom_fields(
		{
			"Company": [
				{"fieldname": "cago_bank_bin", "label": "Cago Bank BIN", "fieldtype": "Data", "insert_after": "company_name", "description": "Mã ngân hàng (BIN), vd Vietcombank=970436."},
				{"fieldname": "cago_bank_account", "label": "Cago Bank Account", "fieldtype": "Data", "insert_after": "cago_bank_bin"},
				{"fieldname": "cago_bank_account_name", "label": "Cago Bank Account Name", "fieldtype": "Data", "insert_after": "cago_bank_account"},
				{
					"fieldname": "cago_kiosk_debt_visible",
					"label": "Cho khách xem công nợ trên kiosk (cần người bán xác nhận)",
					"fieldtype": "Check",
					"insert_after": "cago_bank_account_name",
					"description": "Bật: khách nhập SĐT trên kiosk, người bán xác nhận, rồi khách xem được nợ của mình.",
				},
				{
					"fieldname": "cago_allow_price_edit",
					"label": "Cho phép sửa giá từng dòng khi bán (mặc cả)",
					"fieldtype": "Check",
					"insert_after": "cago_kiosk_debt_visible",
					"description": "Bật: người bán được sửa đơn giá từng mặt hàng ngay khi bán (bớt giá). Tắt: luôn bán theo bảng giá.",
				},
			]
		},
		ignore_validate=True,
	)
	frappe.db.commit()
	print("Company bank fields ensured: cago_bank_*, cago_kiosk_debt_visible, cago_allow_price_edit")
