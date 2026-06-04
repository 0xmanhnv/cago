# 28 — Permission Matrix (RBAC reference)

> The single source of truth for "who can do what" in Cago. The **server always re-checks**
> (`cago/utils/permissions.py` + `ensure_*` in every `cago.api.*` method); the frontend only
> *hides* what a user can't use (never trusts the client). If this doc and the code ever disagree,
> the code (`permissions.py` + the `ensure_*` call on each endpoint) wins — update this doc.

## 1. The tiers — Admin ⊇ Owner ⊇ Staff (+ Kiosk/Guest)

| Tier | Frappe role(s) | Who | Mental model |
|---|---|---|---|
| **Admin (kỹ thuật)** | `Cago Admin`, `System Manager` | Installer / technical support (you) | Everything Owner can do **+ technical config**. `Cago Admin` is POS-scoped least-privilege (no Frappe Desk root); `System Manager` is the site root and is always Admin. |
| **Owner (chủ)** | `Cago Owner` | Shop owner (cô Tuyết) | Every **business** capability, but **not** the technical screens. |
| **Staff (nhân viên)** | one or more `Cago <Capability>` roles | Employees | Only the capabilities granted. |
| **Kiosk / Guest** | none (not logged in) | Customers | Public-safe kiosk only — never sees price internals, cost, customer/debt data. |

Key relationships (enforced in `permissions.py`):
- `ADMIN_ROLES = {"Cago Admin", "System Manager"}`
- `OWNER_ROLES = {"Cago Owner"} ∪ ADMIN_ROLES` → **an Admin is also an Owner** (superset).
- `is_admin()` ⟹ `is_owner()` ⟹ has every capability.
- Helpers: `is_admin()` / `ensure_admin()`, `is_owner()` / `ensure_owner()`, `has_cap(cap)` /
  `ensure_cap(cap)`, `is_internal()` (any back-of-house user) / `ensure_internal()`.
- Bootstrap (`cago.api.session.bootstrap`) returns `is_admin`, `is_owner`, and `caps` for UI gating.

## 2. Capability roles (Staff granularity)

Each capability = one Frappe role (`CAP_ROLES` in `permissions.py`). Owner/Admin hold all of them implicitly.

| Capability key | Frappe role | Unlocks |
|---|---|---|
| `sell` | Cago Sell | Bán hàng (POS), khách cần hỗ trợ queue |
| `returns` | Cago Returns | Trả / đổi hàng |
| `debt_view` | Cago Debt View | Xem công nợ (read-only) |
| `debt` | Cago Debt | Ghi nợ / thu nợ (**implies `debt_view`**) |
| `stock` | Cago Stock | Nhập hàng, kho, cảnh báo, gợi ý nhập, lô/hạn |
| `products` | Cago Products | Sản phẩm, giá, loại hàng, tem giá, kiểm tra dữ liệu |
| `reports` | Cago Reports | Báo cáo, câu hỏi cần lưu ý, trợ lý học gì, dạy trợ lý |
| `cash` | Cago Cash | Sổ quỹ / chốt ca |
| `supplier` | Cago Supplier | Nhà cung cấp + công nợ NCC |
| `settings` | Cago Settings | Coupon, QR/ngân hàng, sơ đồ cửa hàng |

`IMPLIES = {"debt": {"debt_view"}}` — a write capability auto-grants its read capability.

## 3. Screen access matrix (`/pos/*`)

Gating lives in `web/src/components/pos/PosShell.tsx` (`capFor`) for the route guard and
`PosHome.tsx` (`ACTIONS[].cap`) for the tile. "Any internal" = any logged-in back-of-house user.

| Route | Requires | Tier that sees it |
|---|---|---|
| `/pos` (home), `/pos/search`, `/pos/orders`, `/pos/assistant` | any internal | Staff+ |
| `/pos/sell`, `/pos/support` | `sell` | Staff(sell)+ |
| `/pos/returns`, `/pos/exchange` | `returns` | Staff(returns)+ |
| `/pos/debt`, `/pos/verify` | `debt_view` | Staff(debt*)+ |
| `/pos/record-payment`, `/pos/record-debt` | `debt` | Staff(debt)+ |
| `/pos/receive`, `/pos/bulk`, `/pos/alerts`, `/pos/reorder`, `/pos/low-stock`, `/pos/expiry`, `/pos/receive-history` | `stock` | Staff(stock)+ |
| `/pos/products*`, `/pos/price`, `/pos/edit`, `/pos/categories`, `/pos/labels`, `/pos/recommended`, `/pos/health` | `products` | Staff(products)+ |
| `/pos/reports`, `/pos/unsafe`, `/pos/assistant-insights`, `/pos/assistant-content` | `reports` | Staff(reports)+ |
| `/pos/cashbook` | `cash` | Staff(cash)+ |
| `/pos/suppliers` | `supplier` | Staff(supplier)+ |
| `/pos/coupons`, `/pos/settings` (bank QR + shop phone), `/pos/map` | `settings` | Staff(settings)+ |
| `/pos/staff`, `/pos/readiness` | **owner** | Owner, Admin |
| `/pos/ai-settings` (LLM provider + API key), `/pos/backup` | **admin** | **Admin only** |
| `/pos/settings` → webhook URL + token section | **admin** | **Admin only** (owner sees a note, edits only the shop phone) |

Notes:
- `/pos/health` (catalog hygiene: duplicate names / missing images) is **products** (a business
  data-quality task), deliberately NOT admin.
- `/pos/readiness` ("Sẵn sàng khai trương?") is **owner** — it's a go-live checklist for the owner;
  the technical fixes it links to may themselves be admin screens.

## 4. Kiosk / Guest (no login)

Guest-allowed endpoints return **public-safe DTOs only** (no cost, margin, supplier, customer/debt).
- Browse: `cago.api.kiosk.*` (categories, products, product, related, best-sellers).
- Assistant: `cago.api.chatbot.ask_kiosk` (customer role → `public_dto`).
- Wanted list: `cago.api.kiosk.create_wanted_list` (rate-limited, anti-abuse caps).
- Call staff: `cago.api.support.create_request` / `request_status` / `cancel_request`
  (no login/phone — speed in-store; cancel is scoped to the caller's `session_id`).
- Store map: `cago.api.storemap.get_store_map` (layout + category names only).

## 5. Use cases

1. **Install & hand over** — You (System Manager) set up the shop: LLM key, webhook, backup,
   store map, create the `Cago Owner` user + staff. Hand the device to cô Tuyết. She runs the
   business; the technical tiles (LLM/webhook/backup) are hidden from her.
2. **Remote support** — You log into `/pos` with an Admin account, change the LLM model or re-run
   readiness, **without** opening the scary Frappe Desk and without touching her business screens.
3. **Delegate support to a non-root person** — Grant them `Cago Admin` (POS-scoped). They get the
   technical screens but **cannot** drop tables / manage arbitrary users / see all DocTypes (that's
   System Manager only).
4. **Owner adds an employee** — Owner opens `/pos/staff`, creates the user, ticks chức danh
   (capabilities). No technical knowledge needed.
5. **Seasonal cashier** — Grant only `Cago Sell` (+ maybe `returns`). They see Bán hàng + Trả hàng
   + the support queue, nothing else.

## 6. Edge cases (important)

- **Administrator / System Manager** is always Admin (and therefore Owner) — so first-run setup
  works before any `Cago Admin`/`Cago Owner` user exists.
- **Owner cannot self-elevate to Admin.** The `/pos/staff` screen only assigns *capability* job-roles
  (`Cago Sell`, …); it never grants `Cago Admin`/`Cago Owner`. `save_staff`/`set_staff_account`
  also **refuse to edit** a user who already holds an owner/admin role (`is_owner_roles` guard), so
  staff management can't tamper with an owner's or admin's account. Granting `Cago Admin` is done by
  an existing Admin via the Frappe Desk (or a future admin-only control).
- **Admin ⊇ Owner**: an Admin sees every owner screen too (they can operate the shop). There is no
  screen that an Owner sees but an Admin doesn't.
- **A staffer with every capability is still not Owner** — `isOwner`/`is_owner` check the *role*,
  not "has all caps". They can't manage staff or see technical config.
- **`debt` implies `debt_view`** — granting write debt auto-includes read; don't grant both.
- **Frontend hiding ≠ security.** Editing the URL to a screen you lack access to redirects to `/pos`
  (UX), and the underlying API still throws `PermissionError` server-side (the real guarantee).
- **Webhook token never leaks down a tier**: `get_notify_config` returns the webhook *URL* only to an
  Admin; Owner/Staff just learn whether it's configured (`has_webhook`/`has_token` booleans).
- **Kiosk PIN lock** is a *device* quick-lock (any staff/owner sets their own 4-digit PIN), independent
  of roles — it gates re-entry on a shared screen, not capabilities. See the POS PIN notes.
- **Offline sell**: capability checks run server-side at sync time; an offline cashier still needs
  `sell`. Bank/coupon/new-customer are locked offline by design.
- **Roles install via `fixtures/role.json`** on migrate (hand-edited — do NOT `export-fixtures`, it
  would wipe the capability roles). Adding a new capability = add the role to the fixture + `CAP_ROLES`.

## 7. How to grant roles

- **Make someone a cashier/etc. (capabilities):** Owner → `/pos/staff` → add user → tick chức danh.
- **Make someone the Owner:** assign the `Cago Owner` role (Frappe Desk → User, by an Admin).
- **Make someone an Admin (technical support):** assign the `Cago Admin` role (Frappe Desk → User, by
  an Admin / System Manager). They can then log into `/pos` and use the technical screens.
- **Site root:** `System Manager` (Frappe's built-in) — full Desk access; keep this to the installer.

See also: docs/18 (security model), docs/27 (frontend), and `cago/utils/permissions.py`.
