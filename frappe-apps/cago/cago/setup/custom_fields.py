# Copyright (c) 2026, 0xManhnv
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
				{
					# Soft-hide a category from the kiosk (seasonal / discontinued) WITHOUT deleting it —
					# keeps the label + history; products stay sellable at the POS. Disable-don't-delete.
					"fieldname": "cago_hidden",
					"label": "Ẩn khỏi kiosk",
					"fieldtype": "Check",
					"insert_after": "cago_sort_order",
					"description": "Bật: danh mục này không hiện cho khách trên kiosk (vẫn giữ dữ liệu, vẫn bán được ở POS).",
				},
				{
					# Logical parent (WordPress-style): the shop taxonomy is flat is_group=0 leaves under
					# the root + this 2-level link, so a category can BOTH hold its own products AND be a
					# parent (a group can't hold items in ERPNext's tree). Empty = top-level.
					"fieldname": "cago_parent",
					"label": "Cago Parent Category",
					"fieldtype": "Link",
					"options": "Item Group",
					"insert_after": "cago_sort_order",
					"description": "Loại cha (để trống = loại gốc). Xem cha sẽ gộp cả sản phẩm của các loại con.",
				},
			]
		},
		ignore_validate=True,
	)
	frappe.db.commit()
	print("Item Group fields ensured: cago_icon, cago_color, cago_sort_order, cago_parent")


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
				{
					"fieldname": "cago_allow_oversell",
					"label": "Cho bán quá tồn (bán âm)",
					"fieldtype": "Check",
					"insert_after": "cago_min_price",
					"description": "Mặc định TẮT: hàng tự-tính-tồn không bán quá số tồn thật. Bật cho mặt hàng được phép bán dù chưa kịp ghi nhập (tồn xuống âm).",
				},
				{
					"fieldname": "cago_recommended",
					"label": "Khuyên dùng (ưu tiên gợi ý)",
					"fieldtype": "Check",
					"insert_after": "cago_allow_oversell",
					"description": "Đánh dấu mặt hàng cửa hàng khuyên dùng trong nhóm. Trợ lý ưu tiên gợi ý khi khách hỏi 'loại nào tốt nhất', và hiện huy hiệu ⭐ trên thẻ sản phẩm.",
				},
				{
					# Official label instructions (dosage / mixing / pre-harvest interval) the owner copies
					# from the manufacturer's label. When present, the assistant QUOTES it for a dosage/
					# mixing question instead of refusing — quoting the label is not "inventing a dose".
					"fieldname": "cago_label_instructions",
					"label": "Hướng dẫn trên nhãn (liều lượng / pha trộn / cách ly)",
					"fieldtype": "Long Text",
					"insert_after": "cago_recommended",
					"description": "Chép NGUYÊN VĂN hướng dẫn liều lượng/pha trộn/cách ly từ nhãn nhà sản xuất. Có nội dung này thì trợ lý sẽ trích dẫn cho khách (vẫn kèm cảnh báo an toàn). Để trống = trợ lý từ chối và mời hỏi người bán.",
				},
			]
		},
		ignore_validate=True,
	)
	frappe.db.commit()
	print("Item stock fields ensured: cago_stock_auto, cago_reorder_level, cago_min_price, cago_allow_oversell, cago_recommended, cago_label_instructions")


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
				{
					# Stable URL handle so customer links don't carry the Vietnamese docname
					# (some customers are named "Cô Ba Test" → fragile in a URL). Auto-filled,
					# unique-by-code (see cago.customer.set_slug). Resolved back in debt APIs.
					"fieldname": "cago_slug",
					"label": "Mã đường dẫn (slug)",
					"fieldtype": "Data",
					"insert_after": "cago_wholesale",
					"read_only": 1,
					"no_copy": 1,
					"hidden": 1,
				},
			]
		},
		ignore_validate=True,
	)
	frappe.db.commit()
	print("Customer fields ensured: cago_debt_limit, cago_points, cago_wholesale, cago_slug")


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
				},
				{
					"fieldname": "cago_points_redeemed",
					"label": "Cago Points Redeemed",
					"fieldtype": "Int",
					"insert_after": "cago_points_awarded",
					"read_only": 1,
					"no_copy": 1,
					"print_hide": 1,
				},
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
				},
				# Idempotency key for offline sells: the till generates a UUID per sale and sends it
				# with quick_sale. A unique index lets a re-sent queue entry (flaky network) resolve
				# to the SAME invoice instead of double-booking. Empty for online sells.
				{
					"fieldname": "cago_client_uuid",
					"label": "Cago Client UUID",
					"fieldtype": "Data",
					"insert_after": "cago_cashier",
					"unique": 1,
					"read_only": 1,
					"no_copy": 1,
					"print_hide": 1,
				},
			]
		},
		ignore_validate=True,
	)
	frappe.db.commit()
	print("Sales Invoice shift field ensured: cago_cashier, cago_client_uuid")


def ensure_user_fields():
	"""Per-account UI prefs + per-staff selling limits (set by the owner per employee)."""
	create_custom_fields(
		{
			"User": [
				{"fieldname": "cago_home_favorites", "label": "Cago Home Favorites", "fieldtype": "Small Text", "hidden": 1, "no_copy": 1},
				# Per-staff "mặc cả" allowance — replaces the old store-wide Company.cago_allow_price_edit.
				{"fieldname": "cago_allow_price_edit", "label": "Cago Allow Price Edit", "fieldtype": "Check", "hidden": 1, "no_copy": 1},
				# Max whole-bill discount this staff may give (0 = none). Owner = unlimited.
				{"fieldname": "cago_max_discount_pct", "label": "Cago Max Discount %", "fieldtype": "Float", "hidden": 1, "no_copy": 1},
				# Hide the expected-cash figure at shift close so the cashier counts the drawer blind
				# (anti-fraud); only the owner sees the variance afterwards.
				{"fieldname": "cago_blind_shift_close", "label": "Cago Blind Shift Close", "fieldtype": "Check", "hidden": 1, "no_copy": 1},
				# Chức danh (job roles) assigned to this user — M2M. Effective caps = union of these
				# roles' capabilities, compiled into the Frappe cap-roles by cago.utils.permissions.
				{"fieldname": "cago_job_roles", "label": "Cago Job Roles", "fieldtype": "Table", "options": "Cago User Job Role", "hidden": 1, "no_copy": 1},
				# Hashed 4-digit quick-unlock PIN for the shared kiosk+POS device (server-side lock).
				{"fieldname": "cago_pos_pin", "label": "Cago POS PIN", "fieldtype": "Data", "hidden": 1, "no_copy": 1, "read_only": 1},
				# When this user last viewed the support queue → drives the "new/unread" badge (notify-
				# style): the badge counts only requests created after this, and clears on view.
				{"fieldname": "cago_support_seen_at", "label": "Cago Support Seen At", "fieldtype": "Datetime", "hidden": 1, "no_copy": 1},
			]
		},
		ignore_validate=True,
	)
	frappe.db.commit()
	print("User fields ensured: cago_home_favorites, cago_allow_price_edit, cago_max_discount_pct")


def ensure_stock_entry_fields():
	"""Mark whether a stock-in had an official invoice. Suppliers (esp. phân/đạm) often put part
	of a delivery on the invoice and part off-book (their tax dodge) — the goods + cost are real
	so both go into stock/valuation; this flag lets the owner separate the official portion later."""
	create_custom_fields(
		{
			"Stock Entry": [
				{
					"fieldname": "cago_invoiced",
					"label": "Có hoá đơn",
					"fieldtype": "Check",
					"default": "1",
					"insert_after": "stock_entry_type",
				},
				{
					"fieldname": "cago_invoice_image",
					"label": "Ảnh hoá đơn (chứng từ)",
					"fieldtype": "Attach Image",
					"insert_after": "cago_invoiced",
				},
			]
		},
		ignore_validate=True,
	)
	frappe.db.commit()
	print("Stock Entry field ensured: cago_invoiced")


def ensure_payment_fields():
	"""Store bank account for VietQR (hiện QR để khách chuyển khoản)."""
	create_custom_fields(
		{
			"Company": [
				{"fieldname": "cago_bank_bin", "label": "Cago Bank BIN", "fieldtype": "Data", "insert_after": "company_name", "description": "Mã ngân hàng (BIN), vd Vietcombank=970436."},
				{"fieldname": "cago_bank_account", "label": "Cago Bank Account", "fieldtype": "Data", "insert_after": "cago_bank_bin"},
				{"fieldname": "cago_bank_account_name", "label": "Cago Bank Account Name", "fieldtype": "Data", "insert_after": "cago_bank_account"},
				# Debt-acknowledgement (số nợ số hoá): require a finger signature / photo / witness when
				# taking on debt or collecting repayment. off | optional | required; *_min = only REQUIRE
				# at/above this amount (0 = always). See cago.debt_proof.
				{"fieldname": "cago_debt_confirm", "label": "Xác nhận khi ghi nợ", "fieldtype": "Select", "options": "off\noptional\nrequired", "default": "optional", "insert_after": "cago_bank_account_name"},
				{"fieldname": "cago_debt_confirm_min", "label": "Bắt buộc xác nhận nợ khi ≥ (đồng)", "fieldtype": "Currency", "insert_after": "cago_debt_confirm"},
				{"fieldname": "cago_repay_confirm", "label": "Xác nhận khi khách trả nợ", "fieldtype": "Select", "options": "off\noptional\nrequired", "default": "optional", "insert_after": "cago_debt_confirm_min"},
				{"fieldname": "cago_repay_confirm_min", "label": "Bắt buộc xác nhận trả nợ khi ≥ (đồng)", "fieldtype": "Currency", "insert_after": "cago_repay_confirm"},
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
				{
					"fieldname": "cago_staff_can_collect_debt",
					"label": "Cho phép nhân viên thu nợ khách",
					"fieldtype": "Check",
					"insert_after": "cago_allow_price_edit",
					"description": "Bật: nhân viên được ghi 'Khách trả nợ' (tiền vào sổ quỹ ca, ghi rõ người thu). Tắt: chỉ chủ thu nợ.",
				},
				{
					"fieldname": "cago_default_debt_limit",
					"label": "Hạn mức nợ mặc định mỗi khách (đồng)",
					"fieldtype": "Currency",
					"insert_after": "cago_staff_can_collect_debt",
					"description": "Áp dụng khi khách chưa đặt hạn mức riêng. 0 = không giới hạn.",
				},
				{
					"fieldname": "cago_loyalty_earn_vnd",
					"label": "Tích điểm: bao nhiêu đồng = 1 điểm",
					"fieldtype": "Int",
					"insert_after": "cago_staff_can_collect_debt",
					"description": "Khách mua bao nhiêu đồng thì được 1 điểm (mặc định 10.000đ = 1 điểm). 0 = dùng mặc định.",
				},
				{
					"fieldname": "cago_loyalty_redeem_vnd",
					"label": "Đổi điểm: 1 điểm trừ được bao nhiêu đồng",
					"fieldtype": "Int",
					"insert_after": "cago_loyalty_earn_vnd",
					"description": "Khi khách dùng điểm tại quầy, 1 điểm trừ bao nhiêu đồng (mặc định 1.000đ). 0 = dùng mặc định.",
				},
				{
					"fieldname": "cago_loyalty_on_credit",
					"label": "Tích điểm cho cả đơn mua nợ",
					"fieldtype": "Check",
					"insert_after": "cago_loyalty_redeem_vnd",
					"description": "Bật: đơn mua nợ cũng được tích điểm. Tắt (mặc định): chỉ tính điểm trên phần đã trả.",
				},
				{
					"fieldname": "cago_expiry_warn_days",
					"label": "Cảnh báo cận hạn trước bao nhiêu ngày",
					"fieldtype": "Int",
					"insert_after": "cago_loyalty_on_credit",
					"description": "Sản phẩm còn hạn dùng ≤ số ngày này sẽ hiện 'sắp hết hạn' (mặc định 60). 0 = dùng mặc định.",
				},
				{
					"fieldname": "cago_owner_phone",
					"label": "Số điện thoại chủ (nhận nhắc việc)",
					"fieldtype": "Data",
					"insert_after": "cago_expiry_warn_days",
					"description": "Số nhận tin nhắc việc hằng ngày (hết hàng / sắp hết hạn / công nợ) qua Zalo/SMS.",
				},
				{
					"fieldname": "cago_notify_webhook",
					"label": "Cago Notify Webhook URL",
					"fieldtype": "Data",
					"insert_after": "cago_owner_phone",
					"description": "Tùy chọn: URL dịch vụ gửi Zalo/SMS (nhận POST {phone, text}). Để trống = chỉ soạn nháp, không gửi.",
				},
				{
					"fieldname": "cago_notify_token",
					"label": "Cago Notify Token",
					"fieldtype": "Password",
					"insert_after": "cago_notify_webhook",
					"description": "Tùy chọn: token Bearer gửi kèm tới webhook nhắn tin.",
				},
				{
					"fieldname": "cago_telegram_bot_token",
					"label": "Cago Telegram Bot Token",
					"fieldtype": "Password",
					"insert_after": "cago_notify_token",
					"description": "Tùy chọn: token bot Telegram (từ @BotFather) — đẩy cảnh báo/đơn mới vào nhóm vận hành & nhận lệnh.",
				},
				{
					"fieldname": "cago_telegram_chat_id",
					"label": "Cago Telegram Chat ID",
					"fieldtype": "Data",
					"insert_after": "cago_telegram_bot_token",
					"description": "Tùy chọn: chat/nhóm Telegram nhận cảnh báo & đơn mới (chủ + nhân viên).",
				},
				{
					"fieldname": "cago_telegram_webhook_secret",
					"label": "Cago Telegram Webhook Secret",
					"fieldtype": "Password",
					"insert_after": "cago_telegram_chat_id",
					"description": "Tự sinh khi đăng ký webhook — xác thực update đến từ Telegram.",
				},
				{
					"fieldname": "cago_telegram_owner_ids",
					"label": "Cago Telegram Owner IDs",
					"fieldtype": "Data",
					"insert_after": "cago_telegram_webhook_secret",
					"description": "Telegram user ID của (các) chủ — ngăn cách bởi dấu phẩy. Chỉ những ID này được xem doanh thu/công nợ qua tin nhắn riêng với bot; nhân viên trong nhóm chỉ thấy lệnh vận hành.",
				},
				# Public origin + Zalo Mini App config — technical channel config (ADMIN only), edited in the
				# "Kết nối & Kênh" screen. public_url is the one HTTPS origin reused by the Telegram webhook,
				# Zalo, and share links. See docs/45 + cago.api.integrations.
				{
					"fieldname": "cago_public_url",
					"label": "Cago Public URL",
					"fieldtype": "Data",
					"insert_after": "cago_telegram_webhook_secret",
					"description": "Địa chỉ công khai HTTPS của app (vd https://cuahang.example.com) — dùng cho webhook Telegram, Zalo, link chia sẻ.",
				},
				{
					"fieldname": "cago_zalo_app_id",
					"label": "Cago Zalo App ID",
					"fieldtype": "Data",
					"insert_after": "cago_public_url",
					"description": "Tùy chọn: App ID của Zalo Mini App (Zalo for Developers).",
				},
				{
					"fieldname": "cago_zalo_oa_id",
					"label": "Cago Zalo OA ID",
					"fieldtype": "Data",
					"insert_after": "cago_zalo_app_id",
					"description": "Tùy chọn: Official Account (OA) ID của cửa hàng trên Zalo.",
				},
				{
					"fieldname": "cago_zalo_app_secret",
					"label": "Cago Zalo App Secret",
					"fieldtype": "Password",
					"insert_after": "cago_zalo_oa_id",
					"description": "Tùy chọn: App Secret Zalo — dùng phía server để đổi token lấy số ĐT đã xác thực.",
				},
				{
					"fieldname": "cago_zalopay_merchant_id",
					"label": "Cago ZaloPay Merchant ID",
					"fieldtype": "Data",
					"insert_after": "cago_zalo_app_secret",
					"description": "Tùy chọn: Merchant ID ZaloPay (nếu dùng thanh toán online qua Zalo).",
				},
				{
					"fieldname": "cago_zalopay_key",
					"label": "Cago ZaloPay Key",
					"fieldtype": "Password",
					"insert_after": "cago_zalopay_merchant_id",
					"description": "Tùy chọn: khóa ký ZaloPay (server-side).",
				},
				# AI / trợ lý config — owner-editable in the app so provider/model/fallback can change
				# live (no redeploy). Read by cago.chatbot.config with precedence env > here > site_config.
				{"fieldname": "cago_llm_provider", "label": "Cago LLM Provider", "fieldtype": "Data", "insert_after": "cago_notify_token", "description": "openai | anthropic | gemini | deterministic"},
				{"fieldname": "cago_llm_model", "label": "Cago LLM Model", "fieldtype": "Data", "insert_after": "cago_llm_provider"},
				{"fieldname": "cago_llm_base_url", "label": "Cago LLM Base URL", "fieldtype": "Data", "insert_after": "cago_llm_model"},
				{"fieldname": "cago_llm_api_key", "label": "Cago LLM API Key", "fieldtype": "Password", "insert_after": "cago_llm_base_url"},
				{"fieldname": "cago_llm_vision_model", "label": "Cago LLM Vision Model (đọc ảnh)", "fieldtype": "Data", "insert_after": "cago_llm_api_key", "description": "Model có thị giác để đọc ảnh hoá đơn (vd gpt-4o, gemini-1.5-flash). Trống = dùng model chính."},
				{"fieldname": "cago_llm_fallback_provider", "label": "Cago LLM Fallback Provider", "fieldtype": "Data", "insert_after": "cago_llm_vision_model"},
				{"fieldname": "cago_llm_fallback_model", "label": "Cago LLM Fallback Model", "fieldtype": "Data", "insert_after": "cago_llm_fallback_provider"},
				{"fieldname": "cago_llm_fallback_base_url", "label": "Cago LLM Fallback Base URL", "fieldtype": "Data", "insert_after": "cago_llm_fallback_model"},
				{"fieldname": "cago_llm_fallback_api_key", "label": "Cago LLM Fallback API Key", "fieldtype": "Password", "insert_after": "cago_llm_fallback_base_url"},
				{"fieldname": "cago_cfd_token", "label": "Cago CFD Token", "fieldtype": "Data", "insert_after": "cago_llm_fallback_api_key", "read_only": 1, "hidden": 1, "description": "Khoá ghép màn hình phụ cho khách (/display?k=…). Tự sinh."},
				{"fieldname": "cago_dismissed_dupes", "label": "Cago Dismissed Duplicates", "fieldtype": "Long Text", "insert_after": "cago_cfd_token", "hidden": 1, "no_copy": 1, "description": "Các cặp sản phẩm chủ đã xác nhận KHÔNG trùng (data-health) — JSON list khoá item_code."},
			],
			"Payment Entry": [
				{
					"fieldname": "cago_cashier",
					"label": "Cago Cashier",
					"fieldtype": "Link",
					"options": "User",
					"insert_after": "reference_date",
					"no_copy": 1,
					"read_only": 1,
					"description": "Người thực hiện (thu nợ) — attribution for the till shift.",
				},
			],
		},
		ignore_validate=True,
	)
	frappe.db.commit()
	print("Company/Payment Entry fields ensured: cago_staff_can_collect_debt, cago_cashier")


def ensure_supplier_fields():
	"""A free-text note on the Supplier (địa chỉ, mặt hàng, điều khoản giao…) for the manage screen."""
	create_custom_fields(
		{"Supplier": [{"fieldname": "cago_supplier_note", "label": "Ghi chú NCC", "fieldtype": "Small Text", "insert_after": "supplier_name"}]},
		ignore_validate=True,
	)
	frappe.db.commit()
	print("Supplier field ensured: cago_supplier_note")


def setup_all_fields():
	"""Create EVERY Cago custom field (idempotent). Wired to the `after_migrate` hook so a
	fresh deploy or a `bench migrate` always has the full schema — no manual ensure_* runs."""
	ensure_category_fields()
	ensure_supplier_fields()
	ensure_retail_field()
	ensure_stock_fields()
	ensure_customer_fields()
	ensure_loyalty_fields()
	ensure_shift_fields()
	ensure_user_fields()
	ensure_stock_entry_fields()
	ensure_payment_fields()
	# Migrate an existing site's category tree to the flat cago_parent model (idempotent).
	from cago.setup.category_tree import flatten_category_tree

	flatten_category_tree()
	# Backfill the customer URL slug for any customer created before the field existed.
	from cago.customer import backfill_slugs

	backfill_slugs()
	# Default chức danh (job roles) so the owner has ready permission bundles to assign.
	from cago.job_role import seed_defaults

	seed_defaults()
	# Confine Cago internal users (owner/staff, non-admin) to /pos: strip leftover ERPNext desk roles
	# (Sales User, Accounts User, …) so they never see the raw ERPNext desk. Idempotent, self-healing.
	from cago.utils.permissions import confine_internal_users

	confine_internal_users()
