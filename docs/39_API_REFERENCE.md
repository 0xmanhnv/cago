# 39 — API Reference (`cago.api.*`)

Hợp đồng giữa Next.js (`web/`) và Frappe. Mọi endpoint là `@frappe.whitelist`, gọi qua
`POST /api/method/<dotted.path>` (đọc dùng `?method=GET` trong client). Sinh tự động từ code —
nếu lệch, code là chuẩn.

## Quy ước & bảo mật
- **Phiên + CSRF:** cookie session; ghi (POST) cần header `X-Frappe-CSRF-Token` (client tự gắn). Xem `web/src/lib/api.ts`.
- **`[guest]`** = `allow_guest=True` (kiosk/khách chưa đăng nhập). Còn lại yêu cầu đăng nhập.
- **Phân quyền:** hàm gọi `ensure_internal()` / `ensure_cap("<cap>")` / `ensure_owner()` ở đầu. Capability theo từng nhân viên (xem `staff_admin`).
- **DTO theo vai trò:** dữ liệu trả về lọc theo audience (`public`/`staff`/`owner`) trong `cago/utils/dto.py` — **giá vốn/lãi/biên/NCC/công nợ KHÔNG bao giờ lọt vào DTO public/staff** (có audit kiểm: `cago.setup.audit.run_audit`).
- **Tiền:** VND không thập phân; client dùng `formatVnd/parseVnd/groupVnd`.
- **Chống trùng:** các hàm bán có `client_uuid` (idempotency) + `posted_at` (đúng cửa sổ ca khi đồng bộ offline).

---

## Phiên & khởi tạo
- `session.bootstrap()` **[guest]** — tất cả frontend cần 1 lần/load: user, vai trò/caps, CSRF, branding/persona.

## Kiosk (khách — public)
- `kiosk.get_categories()` **[guest]** — danh mục cấp 1 (chỉ hàng public).
- `kiosk.list_products(category, query, recommended_only)` **[guest]** — danh sách sản phẩm public.
- `kiosk.get_product(item_code)` **[guest]** — 1 sản phẩm public (404 nếu không hiển thị kiosk).
- `kiosk.related_products(item_code, limit)` **[guest]** — sản phẩm liên quan cùng nhóm.
- `kiosk.create_wanted_list(items, note)` **[guest]** — tạo "đơn khách đã chọn", trả mã tra cứu.
- `storemap.get_store_map()` **[guest]** — sơ đồ cửa hàng (không trường nhạy cảm).
- `verify.request(phone)` / `status(id)` / `my_debt(token)` **[guest]** — khách tự xem nợ (xác nhận tại quầy; không lộ phone có khớp hay không).

## Bán hàng (nhân viên — `sell`/internal)
- `staff.search_products(query, category, start, recommended_only)` — tìm sản phẩm (DTO staff, ẩn giá vốn).
- `staff.list_categories()` · `staff.get_product(item_code)` · `staff.catalog_snapshot()` (cache offline).
- `staff.list_wanted_lists(include_done)` · `get_wanted_list(code)` · `set_wanted_list_status` · `cancel_wanted_list`.
- `sales.quick_sale(items, payment_mode, customer, discount_amount, payments, coupon, redeem_points, client_uuid, posted_at, delivery_charge)` — **checkout chính** (tiền mặt/CK/ghi nợ/tách).
- `sales.credit_sale(...)` — hoá đơn ghi nợ; `sales.return_sale(invoice, lines)` — trả hàng; `sales.exchange_sale(...)` — đổi hàng (trả + bán mới).
- `sales.get_receipt(invoice)` — dữ liệu in phiếu 58mm; `list_recent_sales`, `recent_sales_counts`, `get_returnable` — cho màn trả hàng.
- `sales.search_customers_lite` / `add_customer_lite` / `customers_snapshot(limit)` — chọn/thêm khách tại quầy (+ cache offline).
- `catalog.find_by_barcode(barcode)` — quét mã vạch → item_code.
- `coupon.apply_coupon(code, subtotal)` — kiểm mã giảm giá.
- `payment.vietqr(amount, info)` — ảnh QR VietQR.
- `shift.current_shift()` / `open_shift(opening_cash)` / `add_cash_movement(kind, amount, reason)` / `close_shift(counted_cash, payouts, note)` — ca làm việc & két.
- `display.cfd_token()` / `set_state(data)` / `get_state(token)` **[guest, token-gated]** — màn hình phụ cho khách.

## Công nợ khách (`debt` / `debt_view`)
- `debt.search_customers` · `get_customer_debt(customer)` · `get_customer_ledger` · `customer_statement` · `debt_list` (qua `reports`).
- `debt.record_debt(customer, amount, note)` · `record_repayment(...)` · `cancel_entry(...)` — ghi nợ / thu / huỷ bút toán.
- `debt.add_customer(...)` · `set_wholesale(customer, on)`.

## Kho & nhập hàng (`stock`)
- `purchasing.get_stock(item_code)` · `receive_stock(item_code, qty, cost_rate, batch_no, invoiced, invoice_image)` · `receive_history` · `adjust_stock(item_code, counted_qty, reason)` · `reorder_suggestions()`.
- `bulk.parse_text(text)` / `parse_image(file_url)` / `bulk_receive(items, invoice_image)` — nhập hàng loạt (gõ/ảnh).
- `inventory.list_batches(item_code)` · `add_batch(...)` · `expiring_soon(days)` — lô & hạn dùng.
- `supplier.*` — NCC: `search_suppliers`, `add_supplier`, `get_supplier_debt`, `credit_purchase`, `pay_supplier`, `supplier_debt_list`, `get_supplier_ledger`.

## Sản phẩm & giá (chủ — `products`)
- `owner.search_products(query, recommended_only)` · `get_product` · `get_product_for_edit` · `get_product_meta`.
- `owner.create_product(data)` · `update_product(item_code, data)` · `update_price(item_code, new_price)` · `price_history`.
- `owner.set_recommended(item_code, on)` — ⭐ khuyên dùng; `data_health()` — kiểm tra dữ liệu.
- `owner.get_wholesale_price` / `set_wholesale_price` — giá sỉ.
- Ảnh: `get_product_images` · `add_product_image` · `set_main_image` · `remove_product_image`.
- Đơn vị bán: `units.get_units` · `save_unit(item_code, uom, units_per_stock, price)` · `remove_unit` · `set_retail_visible`.
- Danh mục: `owner.list_categories` · `save_category` · `delete_category` · `set_category_order`.
- `catalog.label_data(codes)` — in tem giá.

## Báo cáo (chủ — `reports`)
- `reports.period_summary(period, from_date, to_date)` · `payment_split` · `gross_profit` (owner) · `sales_by_customer` (owner) · `best_sellers` · `low_stock` · `debt_list` · `daily_digest` · `unsafe_questions(days, limit)`.
- `cashbook.today_summary()` · `day_close(counted_cash, opening_cash, payouts)`.
- `alerts.today_alerts(limit)` · `preview_digest()` · `onboarding_status()`.

## Trợ lý (chatbot)
- `chatbot.ask_kiosk(message, history, session_id, phone, focus_item, focus_category)` **[guest]** — chỉ dữ liệu public; an toàn hoá chất.
- `chatbot.ask_staff(...)` · `chatbot.ask_owner(...)` — DTO theo vai trò; KHÔNG tự chế liều.

## Cài đặt / quản trị (`owner`/`settings`)
- `ai_config.get_ai_config` / `set_ai_config` / `test_ai(which)` — cấu hình LLM (key không bao giờ trả về).
- `notify.*` — webhook Zalo/SMS; `payment.get_bank` / `save_bank` — tài khoản VietQR.
- `verify.get_* / set_*` — bật/tắt: kiosk xem nợ, sửa giá tại quầy, NV thu nợ, tỉ lệ loyalty, ngưỡng cận hạn.
- `owner.zalo_draft(kind, customer, item_code)` — soạn tin nhắn nhắc nợ / báo nhập hàng.
- `owner.backup_now()` / `last_backup()` — sao lưu trong app.
- `staff_admin.*` — nhân viên & quyền: `list_staff`, `create_staff`, `save_staff`, `set_staff_account`, `list_job_roles`, `save_job_role`, `delete_job_role`.
- `prefs.get_home_favorites` / `set_home_favorites` — ghim ⭐ Hay dùng.

> Chi tiết tham số đầy đủ + lỗi: đọc docstring trong `frappe-apps/cago/cago/api/<module>.py`.
