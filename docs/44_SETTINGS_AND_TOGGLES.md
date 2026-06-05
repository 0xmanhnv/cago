# 44 — Registry of settings, toggles, limits & capabilities

Single source of truth for **every owner/admin switch** and what gates it. Whenever you add or
touch a feature controlled by a setting, update this file.

## Golden rule — gate at BOTH layers

> A setting must be enforced on the **server** (the security boundary) **and** reflected in the
> **frontend** (so the UI hides/disables what isn't allowed). The UI gate is UX only; never rely on
> it for security. The server gate alone is not enough either — a button that always shows and then
> errors on submit is a bug (the "sửa giá" / "thu nợ" class).

Concretely, for each switch:
- **Backend**: the whitelisted method that performs the action calls the check (`ensure_cap`,
  `ensure_can_collect_debt`, `selling_limits`, `require_proof`, `_check_stock`, …) and throws when
  off. **Never trust a client-sent flag.**
- **Bootstrap** (`cago.api.session.bootstrap`): exposes a field that already encodes the *effective*
  gate for the current user (owner-aware), NOT the raw role. e.g. `_staff_can_collect_debt()` must
  return `is_owner() or Company.cago_staff_can_collect_debt`, **not** `has_cap("debt")`.
- **Frontend**: reads that bootstrap field and hides/disables the control.

## Company-level toggles (Cài đặt cửa hàng → `cago.api.verify.*`)

| Setting (UI) | Field on `Company` | set/get | Server enforcement | Frontend gate |
|---|---|---|---|---|
| Cho phép sửa giá khi bán (mặc cả) | `cago_allow_price_edit` | `verify.set_price_edit` / `get_price_edit` | **master switch** in `permissions.selling_limits()` → off ⇒ nobody (incl. owner) can override a line price; on ⇒ owner unlimited, staff per `User.cago_allow_price_edit`. Used by `sales.quick_sale`. | `boot.allow_price_edit` gates the "Đơn giá" input + "Giảm trực tiếp" in `Checkout.tsx` |
| Khách tự xem công nợ trên kiosk | `cago_kiosk_debt_visible` | `verify.set_visible` | `verify.request` `_enabled()` refuses an OTP session when off | kiosk `Home` tile + `MyDebt.tsx` (`boot.kiosk_debt_visible`) |
| Cho phép nhân viên thu nợ khách | `cago_staff_can_collect_debt` | `verify.set_staff_collect_debt` / `get_staff_collect_debt` | `debt.ensure_can_collect_debt()` in `record_debt` + `record_repayment` (owner always allowed) | `boot.staff_can_collect_debt` (owner-aware) gates Home `recordpay`/`recorddebt` tiles + `Debt.tsx canEdit` (record buttons) |
| Hạn mức nợ mặc định | `cago_default_debt_limit` | `verify.set_default_debt_limit` | `debt.effective_debt_limit()` enforced in `record_debt` + `quick_sale` credit checks | server-only (no UI control needed) |
| Xác nhận khi ghi/trả nợ (chữ ký/ảnh) | `cago_debt_confirm`, `cago_debt_confirm_min`, `cago_repay_confirm`, `cago_repay_confirm_min` | `verify.set_debt_proof` | `debt_proof.require_proof()` in `record_debt`/`record_repayment`/`quick_sale` (throws if required proof missing) | `boot.debt_proof` → `ConfirmDebt.tsx` shows modal & requires signature ≥ min |
| Cảnh báo cận hạn (HSD) — số ngày | `cago_expiry_warn_days` | `verify.set_expiry_warn` | `dto.expiry_warn_days()` drives `expiry_status` + `expiring_soon` | shown in alerts/badges (derived) |
| ⭐ Tích điểm (rate, **không phải on/off**) | `cago_loyalty_earn_vnd`, `cago_loyalty_redeem_vnd`, `cago_loyalty_on_credit` | `verify.set_loyalty` / `get_loyalty` | `loyalty.accrue()` (awards on submit; subtracts unpaid debt from basis unless `loyalty_on_credit`), `loyalty.redeem_value()` + `quick_sale` redeem | `boot.loyalty_redeem_vnd` → redeem UI in `Checkout`. NOTE: blank = default rate (loyalty is on by default); there is no "off" — don't treat 0 as a kill-switch. |
| 📩 Nhắn tin Zalo/SMS | `owner_phone`, webhook (token admin-only) | `notify.set_notify_config` (owner), `notify.set_webhook` (admin) | `notify.send_draft` → `ensure_internal()` + `is_configured()` (no-op when unconfigured) | `DraftModal` shows "Gửi luôn" only when `notify.notify_status()` reports configured |
| 🤖 Telegram cửa hàng (ops bot) | `cago_telegram_bot_token` (Password), `cago_telegram_chat_id`, `cago_telegram_webhook_secret` (Password) — all **admin-only** | `notify.set_telegram` / `telegram_test` (admin); `telegram.set_webhook` / `webhook_info` (admin, registers with Telegram) | **Outbound:** `notify.notify_ops()` broadcasts đơn mới / call-staff / nhắc việc to Zalo **+** Telegram (best-effort, no-op when unconfigured). **Inbound:** `telegram.webhook` (allow_guest) gated by (1) secret-token header == `cago_telegram_webhook_secret` **and** (2) message chat_id == `cago_telegram_chat_id`; read-only commands run under `privileged.as_user("Administrator")` (the chat-id match is the auth boundary). | **Admin-only screen `🔌 Kết nối & Kênh`** (`ConnectScreen`, `/pos/integrations`, Home tile `cap:"admin"`): Bot Token + Chat ID + "Gửi thử" + "Đăng ký nhận lệnh" + webhook status. Non-admins never see it. |
| 🌐 Địa chỉ công khai (public origin) | `cago_public_url` (Data) — **admin-only** | `integrations.set_public_url` | One HTTPS origin reused by Telegram webhook register (`telegram.set_webhook` defaults to it), Zalo, share links. `integrations.public_url()` helper. | `ConnectScreen` field + "Lưu địa chỉ". |
| 💬 Zalo Mini App + ZaloPay | `cago_zalo_app_id`, `cago_zalo_oa_id` (Data), `cago_zalo_app_secret` (Password); `cago_zalopay_merchant_id` (Data), `cago_zalopay_key` (Password) — all **admin-only** | `integrations.set_zalo` | Server-side identity/phone verification + (optional) ZaloPay signing. Secrets masked to `has_*` in `integrations.get_integrations`. The `zmp` frontend is a separate project (docs/45). | `ConnectScreen` Zalo section. |
| 📩 Zalo/SMS relay (kênh gửi tin) | `cago_notify_webhook` (Data), `cago_notify_token` (Password) — **admin-only** | `notify.set_webhook` | POST `{phone,text}`+Bearer to any relay; `notify.send_*` no-op when unset. | Moved to `ConnectScreen` (was in `Settings.tsx`). Owner's `cago_owner_phone` (business) stays in `Settings.tsx`. |
| 🖥 Màn hình phụ cho khách (CFD) | token | — | token-scoped display route | `Home` CFD tile / `CustomerDisplay` |

## Per-staff limits (User doctype — Nhân viên & quyền → `cago.api.staff_admin.*`)

These only apply to **staff**; the owner is unlimited (and the relevant Company master switch must
be on for `allow_price_edit`).

| Limit | Field on `User` | Server enforcement | Frontend |
|---|---|---|---|
| Cho phép sửa giá (per-staff) | `cago_allow_price_edit` | `permissions.selling_limits()` (only when Company master on) → `quick_sale` rejects line overrides | `boot.allow_price_edit` |
| Giảm giá tối đa % | `cago_max_discount_pct` | `quick_sale` rejects a discount whose % exceeds the cap | `boot.max_discount_pct` → "Bạn được giảm tối đa N%" hint in `Checkout` |
| Chốt ca mù (blind) | `cago_blind_shift_close` | `shift._shift_dto()` omits expected cash / variance when blind | `Checkout` hides the expected figure |

## Per-item flags (Item — trong trang Sửa sản phẩm)

| Flag | Server | Frontend |
|---|---|---|
| `cago_allow_oversell` | `sales._check_stock()` (skip block when on) | `Checkout` only offers "Vẫn bán?" when on |
| `cago_stock_auto` | auto stock status from on-hand | "Tự động theo tồn thực" |
| `cago_is_public_visible` | kiosk APIs filter | kiosk visibility |
| `cago_show_retail_on_kiosk` | `dto.public_dto` includes sale_units only when on | kiosk retail prices |
| `cago_is_chemical` | safety warning attached | warning shown on card/detail |
| `has_batch_no` (+`create_new_batch`) | FEFO lô/HSD in `sales._allocate_rows`; `_check_item` | LotPicker on the sell line. See [docs/.. lot model] |

## Capabilities (cap roles — `ensure_cap("<cap>")`)

Backend: every whitelisted write method calls `ensure_cap("<cap>")` (or `ensure_owner`/`ensure_admin`).
Frontend: `ACTIONS[k].cap` in `pos/Home.tsx` + route guards in `pos/Shell.tsx` use the **same** cap
key — tile-visible ⟺ route-allowed ⟺ API-permitted. Caps: `sell, products, stock, debt, returns,
reports, customers, coupon, settings` + the **admin** tier (LLM keys / webhook / backup). Profit
(`reports.gross_profit`) is `ensure_owner` (never delegable). See docs/28 (matrix) + docs/29.

## How to add a new switch (checklist)

1. Add the field (Company/User/Item) in `setup/custom_fields.py`.
2. Add `set_*`/`get_*` in `api/verify.py` (guard with `ensure_cap("settings")` / `ensure_owner`).
3. **Enforce in the action's whitelisted method** (throw when off) — the security boundary.
4. Expose an **owner-aware effective** field in `session.bootstrap` (not the raw role).
5. Gate the **frontend** control on that bootstrap field (hide/disable when off).
6. Add the Settings UI control in `owner/Settings.tsx`.
7. **Add a row to this file.**
