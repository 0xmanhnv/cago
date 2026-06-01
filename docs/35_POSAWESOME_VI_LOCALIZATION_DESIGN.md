# 35 — POS Awesome Vietnamese Localization — Design (no code yet)

**Date:** 2026-06-01 · **Status:** design for approval · **Scope:** make the POS Awesome cashier UI Vietnamese for Cago, safely and maintainably. Builds on docs/34 (POS Awesome = optional, owner-scoped POS on v16).

Hard constraints honored: no ERPNext core, no Frappe core, no Cago business logic inside POS Awesome, **Cago does not depend on POS Awesome**, native ERPNext POS stays usable.

> **Direction update 2026-06-01:** POS Awesome is now for **owner + staff** (the owner waived
> hiding cost from staff in the POS — see docs/34 §5 / memory). So **no fork is needed for
> privacy**; localization uses the no-fork path below (Frappe i18n + `Translation` overrides).
> A `cago_posawesome` fork would only be considered if the M2 audit finds cashier-critical
> *hardcoded* (non-`__()`) strings that can't be reached via translations.

---

## 1. Current localization support found (inspected on the eval checkout @ `c7e2b93`)

| Question | Finding |
|---|---|
| Uses Frappe `__()`? | **YES** — 101 of 127 `.vue` files call `__()` (Frappe's gettext-style translator). Strings are translatable through Frappe's standard pipeline. |
| Uses Vue i18n / vue-i18n? | **No** dependency. It relies entirely on Frappe translation. |
| Translation files? | **YES** — `posawesome/translations/<lang>.csv`, **including `vi.csv` (1362 rows, full catalog) and `en.csv`.** |
| Hardcoded strings in `.vue`? | ~26 files don't call `__()` — some may hold hardcoded English (needs a targeted audit; see Risks/M2). |
| Labels from DocType translations? | Mode-of-Payment / field labels come from Frappe DocType + translations; same pipeline. |
| Build supports locale files? | **YES** — `bench build` / `migrate` logs "Compiling translations for posawesome"; the compiled bundle is served to the frontend. |
| **Custom override mechanism** | Frappe `get_all_translations(lang)` **merges the `Translation` DocType** (`filters={language}`) into server **and** client/boot messages (`frappe/translate.py:135,225,129`). → we can override any string per-language at runtime **without editing the app**. |
| Language selection | `User.language → Session Defaults → frappe.local.lang → 'en'` (`translate.py:96–104`). Set per-user; English fallback is automatic. No global ERPNext language change required. |

**Conclusion:** POS Awesome already has first-class i18n (Frappe gettext + per-app CSV) and a Vietnamese file. The job is **terminology curation**, not building i18n. The existing `vi.csv` is machine-quality and wrong/awkward for a rural till in places, e.g.:

| Term | Existing `vi.csv` | Problem | Cago target |
|---|---|---|---|
| Submit | "Nộp" | formal/wrong for a sale | **Hoàn tất** |
| Return | "Trở lại" | means "go back" — WRONG for POS return | **Trả hàng** |
| Quantity | "số lượng" | lowercase | **Số lượng** |
| Print Receipt | *(missing)* | not present | **In phiếu** |
| POS Awesome | "POS tuyệt vời" | awkward | **POS bán hàng** |

## 2. UI string classification (drives priority)

- **Cashier-critical** (translate first): Item/Items, Search Item, Quantity/Qty, Rate, Amount, Total, Grand Total, Discount, Customer, Payment, Cash, Bank/Transfer, Submit/Complete Order, New Sale, Hold, Resume, Cancel, Return, Qty/price steppers, "No data".
- **Customer/payment**: payment dialog, change due, paid amount, customer balance/credit, mode of payment names.
- **Error/validation**: out-of-stock, "select customer", "no open shift", overpay/short-pay, network/save errors.
- **Receipt/print**: store header, item lines, total, paid, change, "Phiếu bán", safety note (chemicals).
- **Admin/config**: POS Profile, Opening/Closing Shift, warehouse, price list, settings, gift cards, delivery — owner-facing, lower urgency.
- **Developer/debug**: console logs, internal toasts — **do not translate.**

## 3. Translation strategy (preference order A→D)

**A. Use the existing Frappe i18n mechanism — ADOPTED.** Set the POS (owner) user's `User.language = "vi"`; the POS UI renders from `vi.csv` + any overrides. English fallback = any other language.

**B/C. Curated Vietnamese override dictionary via the `Translation` DocType — ADOPTED for terminology.** Seed a small set of `Translation` records (language `vi`) for the cashier-critical terms + the corrections/missing above. These **override** `vi.csv` at runtime, reach the frontend (boot messages), and are **upstream-merge-safe** (we never edit posawesome's CSV; a future posawesome update can't clobber our override — DB wins).

Delivery of the dictionary (recommended): a small **optional Cago setup helper** `cago.setup.pos_i18n.seed_pos_translations()` that upserts the Translation records idempotently. Rationale that keeps the constraints intact:
- It lives in **Cago**, creates **generic Frappe `Translation` rows** (plain English→Vietnamese strings). It does **not** import or reference POS Awesome, so **Cago does not depend on POS Awesome** and works (harmlessly) whether or not posawesome is installed.
- It puts **no Cago business logic into POS Awesome**.
- Alternative if you prefer zero Cago footprint: ship the same rows as a **CSV imported via Frappe's Translation tool**, or a Cago **fixture** — design doc treats the helper as default, CSV/fixture as equivalent.

**D. Patch hardcoded text (fork) — ONLY IF NEEDED.** If the ~26 non-`__()` files contain cashier-critical hardcoded English (M2 audit decides), create the minimal fork **`cago_posawesome`** and wrap just those strings in `__()` (or add to CSV), documenting each in `PORTING_NOTES.md`. Expected to be small or unnecessary.

## 4. Vietnamese dictionary (cashier tone for a rural shop)

Source string → Cago Vietnamese (these become `Translation` records for `vi`; ★ = corrects/adds vs existing `vi.csv`):

| EN | VI | | EN | VI |
|---|---|---|---|---|
| Item / Items | Sản phẩm ★ | | Cash | Tiền mặt |
| Search Item | Tìm sản phẩm ★ | | Bank / Transfer | Chuyển khoản |
| Quantity / Qty | Số lượng ★ | | Submit | Hoàn tất ★ |
| Rate | Đơn giá | | Complete Order | Hoàn tất đơn |
| Amount | Thành tiền | | Print Receipt | In phiếu ★ |
| Total | Tổng tiền | | Receipt | Phiếu bán |
| Grand Total | Tổng cộng | | Invoice | Hóa đơn |
| Discount | Giảm giá | | New Sale | Đơn mới |
| Customer | Khách hàng | | Hold | Giữ đơn |
| Payment | Thanh toán | | Resume | Mở lại đơn |
| Cancel | Hủy | | Return | Trả hàng ★ |
| Refund | Hoàn tiền | | Stock | Tồn kho |
| Warehouse | Kho | | POS Profile | Cấu hình quầy |
| Opening Shift | Mở ca | | Closing Shift | Đóng ca |
| Change | Tiền thối lại | | Paid Amount | Khách đưa |

(Full list finalized in M3 after the M2 string audit; this is the cashier-critical core.)

## 5. UX language rules
- Simple, concrete Vietnamese; avoid ERP/accounting jargon in the cashier flow (e.g., prefer **Phiếu bán** over "Hóa đơn" on the receipt button, **Hoàn tất** over "Submit", **Tìm sản phẩm** over "Search Item").
- **Short** button labels; verify they fit POS buttons/cards (Vuetify) — see Risks (overflow).
- Reserve formal accounting terms for owner/admin screens, not the till.

## 6. Configuration
- **Default language = Vietnamese for the Cago POS user(s):** set `User.language = "vi"` on the owner/POS user (a User-record setting — not Cago code, not posawesome).
- **English fallback:** set that user's language to `en` (or unset) → Frappe falls back automatically.
- Setting lives in the **User** record (per-user), optionally System Settings default. **No global ERPNext language change needed.** Site config not required.

## 7. Maintainability
- **No fork for the common case** — terminology via `Translation` records; upstream `vi.csv` untouched; posawesome updates remain mergeable.
- **If a fork is needed** (hardcoded strings): name **`cago_posawesome`**, isolate i18n patches, log every change in **`PORTING_NOTES.md`**, do not reformat unrelated files, keep upstream merge possible (wrap strings in `__()` rather than rewriting components).
- The curated dictionary is version-controlled in Cago (helper or fixture), reviewable, and idempotent.

## 8. Test plan
1. POS page loads with the cashier UI in Vietnamese (user lang = vi).
2. No untranslated **cashier-critical** strings remain (M2 checklist green).
3. Buttons/cards don't overflow with VI labels (visual pass at POS width + tablet).
4. Product search still works (no behavior change).
5. Payment flow (cash + transfer) still submits correctly.
6. Receipt/print labels read acceptably in Vietnamese.
7. English fallback works when user lang = en.
8. **No business logic changed** — re-run a sale; SLE/GL/stock match docs/34 (translation is data-only).
9. Native ERPNext POS still works.
10. Cago owner/staff/kiosk + 76 Cago tests still pass (translation doesn't touch Cago code).

## 9. Deliverables summary

- **Localization support found:** Frappe gettext + per-app CSV (`vi.csv` already present); overridable via the `Translation` DocType; language via `User.language`. (§1)
- **Recommended strategy:** A (existing i18n, user lang = vi) + B/C (curated `Translation` overrides for cashier terms); fork only if hardcoded strings remain. (§3)
- **Dictionary:** §4 (cashier-critical core; finalized in M3).
- **Files likely to change:** (data) Frappe `Translation` records for `vi`; (Cago, optional) `cago/setup/pos_i18n.py` + fixture/CSV + this doc; the POS user's `User.language`. **No posawesome source files** unless the fork path (M5) is triggered.
- **Risks:** (a) ~26 non-`__()` files may hold hardcoded cashier strings → audit (M2), fork-patch if needed; (b) existing `vi.csv` mistranslations → overridden by Translation records; (c) must `clear-cache`/rebuild translations after seeding so the frontend updates; (d) VI label overflow on buttons → keep short + visual check; (e) updates re-ship `vi.csv` but DB overrides win (safe).
- **Status (2026-06-01):** M1–M4 done on the eval site. Curated dictionary (120 cashier
  strings) formalized in **`cago/setup/pos_i18n.py`** (`seed_pos_translations` /
  `clear_pos_translations`, idempotent, no posawesome import). Applied via Frappe `Translation`
  (vi) — overrides the app's `vi.csv` at runtime. Verified: critical cashier terms resolve to
  curated Vietnamese; **Cago 76 tests pass**; **English fallback** clean (vi overrides don't
  leak into `en`). Remaining = human browser pass (button overflow / full flow visual) at
  `/app/posapp`, then production install (owner-approved) + run the seeder there.
- **Final decision (2026-06-01): accept ~99%, NO fork.** Owner chose to keep it simple. The
  **cashier sell flow is 100% Vietnamese**; ~100% of `__()` strings are covered (1310 strings).
  The only remaining English is ~9 **hardcoded** (non-`__()`) labels outside the sell flow —
  customer-create form (`City`, `State`, `Gender`, `Search by Name`, `Search by Mobile`) and
  report filters (`Filter by Currency`, `Filter Invoices by POS Profile`, `Due Date`,
  `No limit`). These are intentionally left in English (would require a `cago_posawesome` fork
  to wrap in `__()`); **not a bug.** Revisit M5 only if the owner later wants them localized.
- **Implementation milestones:**
  - **M1** — set POS user lang = vi, load `/app/posapp`, baseline how much `vi.csv` already covers.
  - **M2** — audit cashier-critical strings (untranslated / wrong / hardcoded) → gap list.
  - **M3** — author curated `Translation` override dictionary (Cago helper or fixture/CSV) for cashier-critical + corrections + missing; clear-cache.
  - **M4** — test per §8 (Vietnamese complete, no overflow, flows OK, English fallback, native POS + Cago intact).
  - **M5** *(only if M2 finds hardcoded critical strings)* — minimal `cago_posawesome` fork wrapping those in `__()`, documented in `PORTING_NOTES.md`.
