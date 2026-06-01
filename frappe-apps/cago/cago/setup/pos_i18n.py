# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Vietnamese cashier-UI translations for the (optional) POS Awesome screen.

POS Awesome uses Frappe's native gettext (`__()`), so we localize WITHOUT touching its code
or forking: each entry below becomes a Frappe `Translation` record (language `vi`) that
OVERRIDES the app's shipped `vi.csv` at runtime, on both server and the POS frontend, and
survives upstream updates (DB wins over CSV).

This is plain i18n data — it imports nothing from posawesome and is harmless if posawesome is
not installed (the records simply translate generic English POS terms for `vi`). Cago does
NOT depend on POS Awesome. See docs/35.

Apply:   bench --site <site> execute cago.setup.pos_i18n.seed_pos_translations
Rollback: bench --site <site> execute cago.setup.pos_i18n.clear_pos_translations

The shop sells with exactly two payment methods: Tiền mặt (Cash) and Chuyển khoản (bank).
Source strings are the EXACT text POS Awesome passes to `__()` (verified against its frontend).
"""

import frappe

LANG = "vi"

# Curated for a rural till: simple, short, concrete Vietnamese; no ERP/accounting jargon.
POS_VI = {
	# Items / cart
	"Item": "Sản phẩm", "Items": "Sản phẩm", "Item Code": "Mã sản phẩm", "Item Name": "Tên sản phẩm",
	"Cart": "Giỏ hàng", "Your Cart": "Giỏ hàng", "No items in cart": "Giỏ chưa có sản phẩm",
	"Waiting for cart items": "Chưa có hàng trong giỏ", "Items added to invoice": "Đã thêm vào đơn",
	"Item order updated": "Đã cập nhật giỏ", "Item is out of stock": "Hết hàng",
	"Item not found": "Không tìm thấy sản phẩm", "Invoice Items": "Sản phẩm trong đơn",
	"Available QTY": "Tồn khả dụng", "Enter Quantity": "Nhập số lượng", "Free Qty": "SL tặng",
	"Minimum Qty": "SL tối thiểu", "Search": "Tìm", "Add": "Thêm",
	# Quantities / prices / totals
	"Quantity": "Số lượng", "Qty": "SL", "QTY": "SL", "Rate": "Đơn giá", "Amount": "Thành tiền",
	"Total": "Tổng tiền", "Grand Total": "Tổng cộng", "Net Total": "Tổng trước thuế", "Total Qty": "Tổng SL",
	"Discount": "Giảm giá", "Discount %": "Giảm giá %", "Discount Amount": "Tiền giảm",
	"Discounts": "Giảm giá", "add discount": "thêm giảm giá",
	"Coupon": "Mã giảm giá", "Offer": "Khuyến mãi", "Offers": "Khuyến mãi", "Offer Removed": "Đã bỏ khuyến mãi",
	# Customer
	"Customer": "Khách hàng", "Create Customer": "Thêm khách", "Customer Balance": "Số dư khách",
	"Customer Details": "Thông tin khách", "Customer not selected": "Chưa chọn khách",
	"Please select a party": "Hãy chọn khách hàng", "Customers not found": "Không thấy khách",
	"Name": "Tên", "Balance": "Số dư", "Outstanding": "Còn nợ",
	# Payment / shift
	"Payment": "Thanh toán", "Payments": "Thanh toán", "Payment Methods": "Hình thức thanh toán",
	"Mode of Payment": "Hình thức thanh toán", "Add Payment": "Thêm thanh toán",
	"Make New Payment": "Thanh toán mới", "Payment Summary": "Tổng kết thanh toán",
	"Cash": "Tiền mặt", "Bank": "Chuyển khoản", "Bank Transfer": "Chuyển khoản",
	"Wire Transfer": "Chuyển khoản", "Bank Draft": "Chuyển khoản",
	"Pay": "Trả tiền", "PAY": "TRẢ TIỀN", "Paid": "Đã trả", "Paid:": "Đã trả:",
	"Processing Payment": "Đang xử lý thanh toán",
	"Submit": "Hoàn tất", "Submit & Print": "Hoàn tất & In",
	"Opening Amount": "Số dư đầu ca", "Opening Cash": "Tiền mặt đầu ca", "Closing Amount": "Số tiền cuối ca",
	"Close Shift": "Đóng ca", "Closing POS Shift": "Đóng ca", "Open drawer": "Mở ngăn kéo",
	# Buttons / actions / common
	"Print": "In phiếu", "Print Draft": "In nháp", "Print Last Invoice": "In phiếu gần nhất",
	"Cancel": "Hủy", "Cancel Sale": "Hủy đơn", "Cancel Sale ?": "Hủy đơn?", "Cancelled": "Đã hủy",
	"Yes, Cancel sale": "Có, hủy đơn", "Return": "Trả hàng", "Returns": "Trả hàng",
	"Sales Return": "Trả hàng", "Refund": "Hoàn tiền",
	"Save": "Lưu", "Confirm": "Xác nhận", "Close": "Đóng", "Back": "Quay lại", "Apply": "Áp dụng",
	"Clear": "Xóa hết", "Remove": "Bỏ", "Delete": "Xóa", "Reset": "Đặt lại", "Refresh": "Tải lại",
	"Retry": "Thử lại", "Select": "Chọn", "Selected": "Đã chọn", "Settings": "Cài đặt",
	"Logout": "Đăng xuất", "Menu": "Tùy chọn", "Yes": "Có", "Today": "Hôm nay",
	"Draft": "Nháp", "Drafts": "Đơn nháp", "Load Sale": "Mở đơn đã lưu", "Active sale": "Đơn đang bán",
	"Ready to resume": "Sẵn sàng mở lại", "Order": "Đơn hàng", "Sale": "Đơn bán",
	"Invoice": "Hóa đơn", "Invoices": "Hóa đơn", "Draft invoice deleted": "Đã xóa đơn nháp",
	# Stock / warehouse / loading / profile
	"Warehouse": "Kho", "All Warehouses": "Tất cả kho", "Low Stock": "Sắp hết hàng",
	"Loading...": "Đang tải...", "Loading items...": "Đang tải sản phẩm...",
	"Loading customers...": "Đang tải khách hàng...",
	"Profile": "Quầy", "Profiles": "Quầy",
	# Long-tail strings that had no vi at all (push __() coverage to ~100%)
	"qty": "sl", "sales": "bán hàng", "gift card": "thẻ quà tặng",
	"Scan with Camera": "Quét bằng camera", "Return count": "Số lần trả",
	"Switched to: ": "Đã chuyển sang: ", "Day Δ": "Δ ngày", "Week Δ": "Δ tuần", "Month Δ": "Δ tháng",
}


def _upsert(source, translated):
	"""Idempotent upsert of a context-less Translation for LANG."""
	name = frappe.db.get_value(
		"Translation", {"language": LANG, "source_text": source, "context": ["in", ["", None]]}, "name"
	)
	if name:
		doc = frappe.get_doc("Translation", name)
		if doc.translated_text != translated:
			doc.translated_text = translated
			doc.save(ignore_permissions=True)
		return 0
	frappe.get_doc(
		{"doctype": "Translation", "language": LANG, "source_text": source, "translated_text": translated}
	).insert(ignore_permissions=True)
	return 1


def seed_pos_translations():
	"""Create/update the Vietnamese cashier translations, then clear cache so the POS picks them up."""
	new = 0
	for src, vi in POS_VI.items():
		new += _upsert(src, vi)
	frappe.db.commit()
	frappe.clear_cache()
	print(f"POS vi translations seeded: {new} new, {len(POS_VI) - new} already current (total {len(POS_VI)}).")


def clear_pos_translations():
	"""Rollback: remove the Cago POS Vietnamese overrides (app vi.csv then applies again)."""
	removed = 0
	for src in POS_VI:
		for name in frappe.get_all("Translation", filters={"language": LANG, "source_text": src}, pluck="name"):
			frappe.delete_doc("Translation", name, ignore_permissions=True)
			removed += 1
	frappe.db.commit()
	frappe.clear_cache()
	print(f"POS vi translations removed: {removed}.")
