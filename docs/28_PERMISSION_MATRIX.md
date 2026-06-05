# 28 — Permission Matrix (RBAC reference)

> The single source of truth for "who can do what". **The server always re-checks** every
> `cago.api.*` method via `cago/utils/permissions.py` (`ensure_*`); the frontend only *hides* what a
> user can't use and *redirects* away from forbidden routes (UX, never trusted). This doc was
> regenerated from a full API↔UI audit. If code and doc disagree, the code wins — update this doc.

## 1. Tiers — Admin ⊇ Owner ⊇ Staff (+ Kiosk/Guest)

| Tier | Frappe role(s) | Desk (/app)? | Who |
|---|---|---|---|
| **Admin (kỹ thuật)** | `Cago Admin`, `System Manager` | ✅ yes | Installer / technical support |
| **Owner (chủ)** | `Cago Owner` | ❌ no | Shop owner (cô Tuyết) |
| **Staff** | one+ `Cago <Capability>` roles | ❌ no | Employees |
| **Kiosk / Guest** | none | ❌ | Customers |

`permissions.py`: `ADMIN_ROLES = {Cago Admin, System Manager}`; `OWNER_ROLES = {Cago Owner} ∪
ADMIN_ROLES` (an **Admin is also an Owner**). Helpers + their meaning:

| Helper | Passes for |
|---|---|
| `is_admin()` / `ensure_admin()` | Cago Admin, System Manager |
| `is_owner()` / `ensure_owner()` | Cago Owner + Admin tier |
| `has_cap(c)` / `ensure_cap(c)` | holders of cap `c` (Owner/Admin = all caps) |
| `is_internal()` / `ensure_internal()` | any back-of-house user (owner or ≥1 cap) |

Bootstrap (`cago.api.session.bootstrap`) returns `is_owner`, `is_admin`, `caps[]`. FE mirrors:
`isAdmin`/`isOwner`/`hasCap`/`isInternal` in `lib/caps.ts`.

**Desk lockdown.** All Cago business roles have `desk_access=0` (fixtures/role.json); only `Cago
Admin` keeps `desk_access=1`. `permissions.confine_to_pos(user)` strips leftover ERPNext desk roles
(Sales User, Accounts User…) from Cago internal non-admin users — wired into `sync_user_caps` (staff
edit) and `confine_internal_users()` on `after_migrate`. So Owner/Staff live only in `/pos`; the
"⚙️ Quản lý ERPNext" tile (PosHome) shows only to `isAdmin`. This is safe because every Cago write
API elevates to Administrator internally (`as_user("Administrator")` + `ignore_permissions`), so
business users never needed ERPNext doctype permissions.

## 2. Capability roles (Staff granularity)

`CAP_ROLES` (key → role). Owner/Admin hold all implicitly. `IMPLIES = {debt: {debt_view}}`.

| key | role | unlocks |
|---|---|---|
| `sell` | Cago Sell | POS bán hàng · hàng đợi "khách cần hỗ trợ" |
| `returns` | Cago Returns | trả / đổi hàng |
| `debt_view` | Cago Debt View | xem công nợ (read) |
| `debt` | Cago Debt | ghi/thu nợ (⊃ debt_view) |
| `stock` | Cago Stock | nhập hàng, kho, cảnh báo, gợi ý nhập, lô/hạn |
| `products` | Cago Products | sản phẩm, giá, loại hàng, tem, kiểm tra dữ liệu |
| `reports` | Cago Reports | báo cáo, câu hỏi cần lưu ý, trợ lý học gì / dạy trợ lý |
| `cash` | Cago Cash | sổ quỹ / chốt ca |
| `supplier` | Cago Supplier | nhà cung cấp + công nợ NCC |
| `settings` | Cago Settings | coupon, QR/ngân hàng + cài đặt cửa hàng, sơ đồ |

## 3. Screen access (`/pos/*`) — tile cap == route guard (verified)

Tile visibility = `PosHome.ACTIONS[].cap`; route guard = `PosShell.capFor`. Audited equal for every
route; a single product DETAIL view is intentionally looser than the product hub.

| Route | Requires |
|---|---|
| `/pos`, `/pos/search`, `/pos/orders`, `/pos/assistant`, `/pos/help` | any internal |
| `/pos/products/<code>` (detail view) | any internal |
| `/pos/products` (hub), `/pos/price`, `/pos/edit`, `/pos/products/new`, `/pos/products/*/edit`, `/pos/categories`, `/pos/recommended`, `/pos/labels`, `/pos/health` | `products` |
| `/pos/sell`, `/pos/support` | `sell` |
| `/pos/returns`, `/pos/exchange` | `returns` |
| `/pos/debt`, `/pos/verify` | `debt_view` |
| `/pos/record-payment`, `/pos/record-debt` | `debt` |
| `/pos/receive`, `/pos/bulk`, `/pos/receive-history`, `/pos/alerts`, `/pos/reorder`, `/pos/low-stock`, `/pos/expiry` | `stock` |
| `/pos/cashbook` | `cash` |
| `/pos/suppliers` | `supplier` |
| `/pos/reports`, `/pos/unsafe`, `/pos/assistant-insights`, `/pos/assistant-content` | `reports` |
| `/pos/coupons`, `/pos/settings`, `/pos/map` | `settings` |
| `/pos/staff`, `/pos/readiness` | **owner** |
| `/pos/ai-settings`, `/pos/backup` | **admin** |
| `/pos/settings` → webhook URL + token *section* | **admin** (owner edits only the shop phone) |
| PosHome "⚙️ Quản lý ERPNext" tile (→ `/app`) | **admin** |

## 4. API guard map (all 181 whitelisted methods carry a guard)

| Guard | Representative methods |
|---|---|
| `allow_guest` + `rate_guard` | chatbot.ask_kiosk · kiosk.create_wanted_list · support.create_request · verify.request/status/my_debt |
| `allow_guest` (public-safe read) | kiosk.get_categories/list_products/get_product/best_sellers/related_products · storemap.get_store_map · display.get_state · support.request_status/cancel_request |
| `ensure_internal` (any back-of-house) | catalog.* · staff.* (search/get/wanted) · sales.search_customers_lite/customers_snapshot/get_receipt · units.get_units · pos.create_invoice_from_wanted · session.set_pos_pin/pos_lock · notify.send_draft/notify_status · alerts.today_alerts · reports.daily_digest |
| `ensure_cap(<key>)` | sell: quick_sale/credit_sale/return_sale/exchange_sale; products: owner.* (via `_check_item`)/units.save_unit/payment.*; stock: purchasing.*/inventory.add_batch; debt(_view): debt.*; cash: cashbook.*/shift.*; supplier: supplier.*; settings: coupon.*/verify.* settings/storemap.save_store_map; reports: reports.*/chatbot_admin.* |
| `ensure_owner` | alerts.preview_digest/onboarding_status · readiness.golive_check · staff_admin.* (all) · notify.get/set_notify_config · chatbot.ask_owner · **reports.gross_profit** |
| `ensure_admin` | ai_config.* (LLM keys) · owner.backup_now/last_backup · notify.set_webhook |

Notes:
- Methods my scanner first flagged "no guard" are guarded transitively: owner.py image/wholesale/
  edit methods via `_check_item()` → `ensure_cap("products")`; prefs.* via `_ensure_user()` (rejects
  Guest); reports.today_summary aliases `period_summary` (guarded).
- `staff_admin` assigns only *capability* job-roles — it can't grant `Cago Owner`/`Cago Admin`, and
  refuses to edit an owner/admin account (`is_owner_roles` guard). Granting the Admin role is done by
  an existing Admin in the Frappe Desk.

## 5. Sensitive-data axis (orthogonal to screens)

Even with a screen open, money internals are tier-gated by the DTO/endpoint, not the screen:
- **Cost / valuation / margin / supplier price**: never in `public_dto`/`staff_dto`
  (`utils/dto.py`); `chatbot/context._FORBIDDEN` asserts they never reach the LLM.
- **Profit / margin** (`reports.gross_profit`): **owner-only** even on the `reports` screen — a
  staffer with `reports` sees revenue/counts but the API throws, and the UI `catch`es → the profit
  block simply doesn't render.
- **Buying price in receive history**: hidden from non-owner.
- **Webhook token**: returned only to an Admin (others get `has_webhook`/`has_token` booleans).

## 6. Kiosk / Guest

Guest endpoints return public-safe DTOs only. Browse (kiosk.*), assistant (ask_kiosk →
`public_dto`), wanted list, store map, call-staff (support.create_request, no login/phone; cancel is
`session_id`-scoped), and the customer debt self-check (verify.request/status/my_debt, rate-limited).

## 7. Use cases & edge cases

- **Install → hand over**: System Manager sets up (LLM/webhook/backup, store map, creates Owner +
  staff) then hands over. Owner runs the business; technical tiles hidden; can't open `/app`.
- **Remote support**: log in as Admin → technical screens in `/pos`, no Desk needed.
- **Delegate to non-root support**: grant `Cago Admin` (POS-scoped, no Desk root).
- **Seasonal cashier**: grant `Cago Sell` (+`returns`) only.
- Administrator/System Manager is always Admin (setup works before any Cago user exists).
- Admin ⊇ Owner: an Admin sees every owner screen too.
- A staffer with every capability is still **not** Owner (role check, not "has all caps").
- Frontend hiding ≠ security: URL into a forbidden route → redirect to `/pos`; the API still throws.
- Roles install via `fixtures/role.json` (hand-edit; never `export-fixtures` — it wipes cap-roles).

See `cago/utils/permissions.py`, `web/src/components/pos/PosShell.tsx` (capFor), `PosHome.tsx`
(ACTIONS), docs/18 (security), docs/27 (frontend).
