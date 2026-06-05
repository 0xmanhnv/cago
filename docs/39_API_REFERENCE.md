# 39 — API Reference (`cago.api.*`)

The contract between Next.js (`web/`) and Frappe. Every endpoint is `@frappe.whitelist`, called via
`POST /api/method/<dotted.path>` (reads use `?method=GET` in the client). Generated from the code —
if anything drifts, the code is canonical.

## Conventions & security
- **Session + CSRF:** cookie session; writes (POST) need the `X-Frappe-CSRF-Token` header (the client adds it). See `web/src/lib/api.ts`.
- **`[guest]`** = `allow_guest=True` (kiosk / not-logged-in customer). Everything else requires login.
- **Authorization:** functions call `ensure_internal()` / `ensure_cap("<cap>")` / `ensure_owner()` up front. Capabilities are per-staff (see `staff_admin`).
- **Role-scoped DTOs:** responses are filtered by audience (`public`/`staff`/`owner`) in `cago/utils/dto.py` — **cost/profit/margin/supplier/debt NEVER reach the public or staff DTOs** (verified by `cago.setup.audit.run_audit`).
- **Money:** VND has no decimals; the client uses `formatVnd/parseVnd/groupVnd`.
- **Idempotency:** sale functions take `client_uuid` (dedup) + `posted_at` (correct shift window when an offline sale syncs late).

---

## Session & bootstrap
- `session.bootstrap()` **[guest]** — everything the front end needs once per load: user, role/caps, CSRF, branding/persona.

## Kiosk (customer — public)
- `kiosk.get_categories()` **[guest]** — top-level categories (public items only).
- `kiosk.list_products(category, query, recommended_only)` **[guest]** — public product list.
- `kiosk.get_product(item_code)` **[guest]** — one public product (404 if not kiosk-visible).
- `kiosk.related_products(item_code, limit)` **[guest]** — related products in the same category.
- `kiosk.best_sellers(limit)` **[guest]** — top-selling public products (for the home "🏆 Bán chạy" row).
- `kiosk.create_wanted_list(items, note)` **[guest]** — create a "customer wanted list", returns a lookup code.
- `storemap.get_store_map()` **[guest]** — store map (no sensitive fields).
- `verify.request(phone)` / `status(id)` / `my_debt(token)` **[guest]** — customer self-checks own debt (confirmed at the counter; never reveals whether a phone matches).

## Selling (staff — `sell`/internal)
- `staff.search_products(query, category, start, recommended_only)` — product search (staff DTO, cost hidden).
- `staff.list_categories()` · `staff.get_product(item_code)` · `staff.catalog_snapshot()` (offline cache).
- `staff.list_wanted_lists(include_done)` · `get_wanted_list(code)` · `set_wanted_list_status` · `cancel_wanted_list`.
- `sales.quick_sale(items, payment_mode, customer, discount_amount, payments, coupon, redeem_points, client_uuid, posted_at, delivery_charge)` — **main checkout** (cash/bank/credit/split).
- `sales.credit_sale(...)` — credit invoice; `sales.return_sale(invoice, lines)` — returns; `sales.exchange_sale(...)` — exchange (return + new sale).
- `sales.get_receipt(invoice)` — 58 mm receipt data; `list_recent_sales`, `recent_sales_counts`, `get_returnable` — for the returns screen.
- `sales.search_customers_lite` / `add_customer_lite` / `customers_snapshot(limit)` — pick/add a customer at the till (+ offline cache).
- `catalog.find_by_barcode(barcode)` — scanned barcode → item_code.
- `coupon.apply_coupon(code, subtotal)` — validate a discount code.
- `payment.vietqr(amount, info)` — VietQR image.
- `shift.current_shift()` / `open_shift(opening_cash)` / `add_cash_movement(kind, amount, reason)` / `close_shift(counted_cash, payouts, note)` — till shift & cash drawer.
- `display.cfd_token()` / `set_state(data)` / `get_state(token)` **[guest, token-gated]** — customer-facing display.

## Customer debt (`debt` / `debt_view`)
- `debt.search_customers` · `get_customer_debt(customer)` · `get_customer_ledger` · `customer_statement` · `debt_list` (via `reports`).
- `debt.record_debt(customer, amount, note)` · `record_repayment(...)` · `cancel_entry(...)` — add debt / collect / cancel a voucher.
- `debt.add_customer(...)` · `set_wholesale(customer, on)`.

## Stock & purchasing (`stock`)
- `purchasing.get_stock(item_code)` · `receive_stock(item_code, qty, cost_rate, batch_no, invoiced, invoice_image)` · `receive_history` · `adjust_stock(item_code, counted_qty, reason)` · `reorder_suggestions()`.
- `bulk.parse_text(text)` / `parse_image(file_url)` / `bulk_receive(items, invoice_image)` — bulk receive (typed/photo).
- `inventory.list_batches(item_code)` · `add_batch(...)` · `expiring_soon(days)` — batches & expiry.
- `supplier.*` — suppliers: `search_suppliers`, `add_supplier`, `get_supplier_debt`, `credit_purchase`, `pay_supplier`, `supplier_debt_list`, `get_supplier_ledger`.

## Products & pricing (owner — `products`)
- `owner.search_products(query, recommended_only)` · `get_product` · `get_product_for_edit` · `get_product_meta`.
- `owner.create_product(data)` · `update_product(item_code, data)` · `update_price(item_code, new_price)` · `price_history`.
- `owner.set_recommended(item_code, on)` — ⭐ recommended; `data_health()` · `merge_products(source, target)` · `dismiss_duplicate(item_codes)`.
- `owner.get_wholesale_price` / `set_wholesale_price` — wholesale price.
- Images: `get_product_images` · `add_product_image` · `set_main_image` · `remove_product_image`.
- Sale units: `units.get_units` · `save_unit(item_code, uom, units_per_stock, price)` · `remove_unit` · `set_retail_visible`.
- Categories: `owner.list_categories` · `save_category` · `delete_category` · `set_category_order`.
- `catalog.label_data(codes)` — price-tag printing.

## Reports (owner — `reports`)
- `reports.period_summary(period, from_date, to_date)` · `payment_split` · `gross_profit` (owner) · `sales_by_customer` (owner) · `best_sellers` · `low_stock` · `debt_list` · `daily_digest` · `unsafe_questions(days, limit)`.
- `cashbook.today_summary()` · `day_close(counted_cash, opening_cash, payouts)`.
- `alerts.today_alerts(limit)` · `preview_digest()` · `onboarding_status()`.

## Assistant (chatbot)
- `chatbot.ask_kiosk(message, history, session_id, phone, focus_item, focus_category)` **[guest]** — public data only; chemical-safe.
- `chatbot.ask_staff(...)` · `chatbot.ask_owner(...)` — role-scoped DTO; never invents dosage.

## Settings / admin (`owner`/`settings`)
- `ai_config.get_ai_config` / `set_ai_config` / `test_ai(which)` — LLM config (keys are never returned).
- `notify.*` — Zalo/SMS webhook; `payment.get_bank` / `save_bank` — VietQR account.
- `verify.get_* / set_*` — toggles: kiosk debt self-view, till price-edit, staff debt collection, loyalty rates, near-expiry window.
- `owner.zalo_draft(kind, customer, item_code)` — compose a debt-reminder / restock message.
- `owner.backup_now()` / `last_backup()` — in-app backup.
- `staff_admin.*` — staff & roles: `list_staff`, `create_staff`, `save_staff`, `set_staff_account`, `list_job_roles`, `save_job_role`, `delete_job_role`.
- `prefs.get_home_favorites` / `set_home_favorites` — pin/reorder ⭐ home favourites.

> Full parameter detail + errors: read the docstring in `frappe-apps/cago/cago/api/<module>.py`.
