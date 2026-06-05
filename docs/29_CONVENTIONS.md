# 29 — Conventions (read before changing UI / RBAC / DocTypes)

Hard-won rules. Follow them so we don't repeat past mistakes. Each line is a "do this / not that".

## UI / UX
1. **Two design sets, kept separate.** Kiosk (customer) = `components/kiosk/*` with its own header/
   cards. POS (owner+staff) = `components/owner/*` + `staff/*` + `pos/*`, sharing `owner/Shared.tsx`
   (BackBar + helpers) and `ui/ListUI` (FilterTabs / DateHeader / SearchInput / groupOrdered). Restyle
   one without touching the other. Do NOT merge kiosk and POS into one component set.
2. **One POS header = `BackBar`** (back + title + optional `right` action + 🏠 home). Never hand-roll a
   `‹ Trang chủ`/title header in a /pos screen — import BackBar.
3. **Mobile list rows:** either (a) full-width tap-to-open, or (b) two lines (name on top, action
   buttons below) when there are several actions. Never cram name + many buttons on one line (it
   truncates the name — see CategoryOrder). Always `truncate`/`line-clamp` a title that can be long.
4. **Grouped lists:** categorical groups (by village, supplier…) → **collapsible** (so you can jump
   between groups). Chronological groups (by date) → sticky header + scroll + "Xem thêm", NOT
   collapsible (collapsing dates fights top-down browsing).
5. **Product card (mobile) = image on top, text below.** Not a tiny left thumbnail with wrapping text.
6. **iOS focus-zoom:** all `input/textarea/select` are forced to `font-size:16px` on `(pointer:coarse)`
   in globals.css. Don't ship sub-16px form controls expecting no zoom; don't fix it with viewport
   `maximum-scale` (kills pinch-zoom / a11y).
7. **Confirm destructive actions** (delete) when the row/record has content; an empty just-added row may
   delete silently.
8. **Icons must be semantically right** for a low-tech user: ↔️ = đổi/exchange (NOT 🔁, which reads as
   refresh/back). Pick the icon a rural shopkeeper would read correctly.
9. **Headers/labels:** Vietnamese UI text; friendly dates ("Hôm nay/Hôm qua/dd/MM/yyyy", not raw ISO);
   each card must be identifiable without expanding (lead with WHAT it is, not a generic count).

## Naming
9b. **No folder-redundant prefixes on component files/exports.** A folder already gives context, so
    `kiosk/Chrome.tsx` (not `KioskChrome`), `pos/Home.tsx`/`pos/Shell.tsx` (not `PosHome`/`PosShell`),
    `staff/Chat.tsx` (not `StaffChat`). Same-named components in different folders are fine
    (module-scoped: `kiosk/Home` vs `pos/Home`). Shared utility modules: `owner/Shared.tsx` (not
    `OwnerShared`). When renaming an identifier project-wide, sed the UNIQUE old name (`\bPosHome\b`)
    so common words aren't corrupted, then `git mv` the file, then build.

## Units & money
10. **UOM display vs payload.** Relabel a unit for DISPLAY only — backend `dto.uom_label`/`UOM_LABELS`
    (public DTO `unit`) and frontend `lib/uom.ts uomLabel()` at render sites. NEVER relabel the `uom`
    sent in an API payload (quick_sale items[].uom, save_unit, stock_uom) — the sale must post against
    the real ERPNext UOM ("Nos"). "Nos"/"Unit" → "Cái"; weight codes kg10/kg100/kg1000 → Yến/Tạ/Tấn.
11. **VND money:** use `formatVnd/parseVnd/groupVnd` (lib/utils). Never `parseFloat` a grouped string
    ("1.000" → 1 bug). VND has no decimals.

## RBAC (see docs/28 for the full matrix)
12. **Tiers: Admin ⊇ Owner ⊇ Staff.** `ADMIN_ROLES={Cago Admin, System Manager}`,
    `OWNER_ROLES={Cago Owner}∪ADMIN_ROLES`. Helpers: `ensure_admin/ensure_owner/ensure_cap/ensure_internal`
    + FE `isAdmin/isOwner/hasCap/isInternal`.
13. **Technical screens** (LLM keys, messaging webhook+token, backup) = `ensure_admin` / capFor `admin`.
    Business = owner/cap. **Profit/margin (`gross_profit`) = owner-only**; cost/valuation/supplier price
    never in `staff_dto`/`public_dto` (`chatbot/context._FORBIDDEN` asserts it for the LLM too).
14. **Every `@frappe.whitelist`** carries a guard (ensure_*; or `allow_guest` + `rate_guard` returning
    only public-safe DTOs). Helpers like `_check_item` that call ensure_cap count — but verify.
15. **tile cap (pos/Home.ACTIONS) == route guard (pos/Shell.capFor)** for every route. Don't let a tile be
    stricter than its route (a capless user could URL in and hit an error).
16. **Owner/Staff are confined to /pos** — Cago business roles have `desk_access=0`; only `Cago Admin`
    keeps the Frappe Desk. `permissions.confine_to_pos` strips leftover ERPNext desk roles (Sales/Accounts
    User) on staff-edit + `after_migrate`. The "⚙️ Quản lý ERPNext" tile is `isAdmin`-only.
17. **Write APIs elevate** via `cago.utils.privileged.as_user("Administrator")` + `ignore_permissions`
    (so business users need NO ERPNext doctype perms). Never raw `frappe.set_user`.

## Frappe / DocType gotchas
18. **Controller class name = DocType name minus spaces** (`Cago Chatbot FAQ` → `class CagoChatbotFAQ`).
    Get it wrong and `bench migrate` DELETES the doctype as an "orphan" (controller import fails).
19. **Roles live in `fixtures/role.json`** — hand-edit; NEVER `export-fixtures` (it wipes the cap-roles).
20. **Custom fields** via `setup/custom_fields.py` (wired to `after_migrate` `setup_all_fields`); our own
    DocTypes carry their fields in their `.json`.
21. **Defaults in code, live overrides in DB.** Pattern: env > Company/DocType field > site_config >
    code default (LLM config, kiosk chips, chatbot keywords/FAQ). Works zero-config/offline.

## Deploy
22. Backend code is **baked into the image** → `docker compose build backend` before tests/deploy reflect
    backend changes. New DocType fields → `bench migrate`.
23. After recreating the backend container → **restart `frontend` and `web`** (stale nginx upstream → 502).
24. Frontend: `docker compose build web` runs typecheck/lint — a clean build is the gate.

## Process
25. `git commit -F -` with a heredoc (not backtick-substituting). No co-author / "Generated with" trailers.
26. Copyright headers `0xManhnv`. No "Claude"/CLAUDE.md in code comments — cite `docs/` instead.
27. English identifiers (vars/functions/components); Vietnamese only for user-facing text.
28. POS = Cago-native `/pos`. Never reintroduce POS Awesome or an external POS app. Auxiliary services
    are Python (no Go).
29. Every owner/admin **switch must gate BOTH server (security boundary) + UI** (hide what's off — a
    button that always shows then errors on submit is a bug). Bootstrap exposes an **owner-aware
    effective** field, not the raw role. Registry of all switches + their gates: **docs/44**.
