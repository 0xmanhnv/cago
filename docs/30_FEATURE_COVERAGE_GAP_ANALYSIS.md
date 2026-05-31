# 30 — Feature Coverage & Gap Analysis (Cago)

> **Status: ANALYSIS ONLY — no code.** Audit of whether current design/docs/code cover the
> features a practical rural agri-supplies store needs. Grounded in the real codebase
> (Frappe 16.19.0 · ERPNext 16.20.0 · `cago` 0.1.0 · Next.js 16 UI in `web/`).
> Legend — **✅ covered · 🟡 partial · ❌ missing · ❔ unknown**. Priority **P0/P1/P2/Later**.

Confirmed building blocks (evidence reused below):
- **Item cago_ fields:** display_name, local_names, public_description, staff_advice, use_cases,
  crop_or_animal_targets, package_color, shelf_location, stock_status_manual, safety_notes,
  image_gallery, is_chemical, is_public_visible, product_quality_tier, call_owner_when,
  kiosk_sort_order. **Item Group:** cago_icon, cago_color. **Customer:** village, zalo_phone,
  customer_type, debt_note, farming_notes.
- **DocTypes:** Cago Product Alternative, Cago Wanted List(+Item), Cago Owner Action Log,
  Cago Chatbot Log; ERPNext Batch (expiry, Phase 1).
- **APIs:** `cago.api.{kiosk,owner,staff,debt,reports,chatbot,inventory,session}`; `pos.py` empty.
- **Utils:** `dto.py` (public/staff/owner DTOs, list_dtos, search_item_codes, expiry, category_meta),
  `permissions.py`, `safety.py`. **Setup:** company, sample_data, audit (11 checks), custom_fields.
- **Tests:** test_api, test_chatbot (20), test_owner_staff (7), test_inventory (5).

---

## 1. Product Catalog — 🟡
**Evidence:** ERPNext Item + all cago_ display/advice fields; images via `image` + `cago_image_gallery`
(album) → `dto.image_list`; category icon/colour data-driven on Item Group.
**Gaps:** ❌ **barcode/QR** (no field, no refs); 🟡 multiple images are a flat album — no typed
front/back/**label**/safety roles.
**Recommendation:** add Item `cago_barcode` (or use ERPNext Item Barcode child) + scan; type the
gallery (a child table `image_type`) or at least a dedicated `cago_label_image`.
**Priority:** barcode **P2**, labeled images **P2**. **Milestone:** Phase 2. **Risk:** label image is
safety-relevant (read the real label) — medium.

## 2. Pricing — 🟡
**Evidence:** selling price = ERPNext Item Price "Standard Selling" (`dto.get_selling_price`,
`owner.update_price`); import/valuation stays in ERPNext Desk (owner-only); staff/kiosk DTOs exclude
cost/margin (audit-enforced). Owner price changes logged (Cago Owner Action Log).
**Gaps:** ❌ customer-specific price, ❌ wholesale price, ❌ minimum selling price, ❌ price history /
trend (only the latest rate + an action-log line).
**Recommendation:** use ERPNext Pricing Rules / multiple Price Lists for wholesale & customer price;
add `cago_min_price` guard in `update_price`/POS; surface price history from Item Price versions or a
dedicated log.
**Priority:** min-price guard **P1**, wholesale/customer price **P2**, history **P2**. **Milestone:** Phase 2.
**Risk:** selling below cost without a guard — medium (margin loss).

## 3. Stock — 🟡
**Evidence:** real on-hand via Bin (`dto.get_actual_qty`); **manual** display status
`cago_stock_status_manual`; low-stock report (`reports.low_stock`); expiry/batch (Phase 1,
`inventory.*`). Shelf location field present.
**Gaps:** stock status is **manual**, not driven by real qty; ❌ reserved/held stock, ❌ reorder
suggestion, ❌ seasonal suggestion; **credit/debt sale via Journal Entry does NOT reduce stock**
(docs/24 known limitation).
**Recommendation:** derive stock status from Bin qty + a per-item reorder level; **convert credit
sales to stock-reducing Sales Invoice (is_pos + credit)** — see §10/§11; reorder = low-stock→PO.
**Priority:** real-qty status **P1**, stock-reducing credit sale **P1**, reorder **P2**, seasonal **Later**.
**Risk:** inventory drift if credit sales bypass stock — **high** (data correctness).

## 4. Product Advice — ✅ (mostly)
**Evidence:** `cago_staff_advice`, `cago_call_owner_when`, alternatives (Cago Product Alternative:
cheaper/equivalent/better/**avoid**), `use_cases`, `crop_or_animal_targets`, `safety_notes`;
surfaced in staff DTO + chatbot context.
**Gaps:** 🟡 advice-by-(crop/animal/problem) is free text + targets, not a structured rules table;
🟡 safety checklist is free text.
**Recommendation:** optional structured "advice rule" DocType (problem→recommended/avoid) only if the
free-text proves insufficient. **Priority:** P2 / Later. **Risk:** low.

## 5. Chemical Safety — ✅
**Evidence:** `cago_is_chemical`; `safety.STANDARD_SAFETY_WARNING` + `safety_warning_for`;
`chatbot/safety.py` classifies dosage/mixing/stronger/near-harvest → **refusal** + escalate;
deterministic refusal never calls LLM; Cago Chatbot Log records `safety_flags`; audit checks every
chemical item has a warning.
**Gaps:** 🟡 no **label image** requirement (ties to §1); no periodic audit *report* of unsafe questions
(data is logged, not summarized).
**Recommendation:** require/show label image for chemicals; add an owner "unsafe questions" report from
Cago Chatbot Log. **Priority:** P2. **Risk:** label legibility is compliance-relevant — medium.

## 6. Customer Kiosk — 🟡
**Evidence (web/ kiosk):** category browse, search, large cards, detail (gallery+TTS+related), wanted
list (`kiosk.create_wanted_list`), call staff, **session idle-reset** (sessionStorage), public-safe DTOs,
optional phone entry. Now URL-addressable (reload-safe) + in-list search/sort/stock filter + PWA read-cache.
**Gaps:** ❌ customer **purchase history after verification**, ❌ **debt display after verification**,
❌ reorder previous purchase, ❌ out-of-stock notification subscription. All depend on §7 (verification),
which does not exist yet.
**Recommendation:** build the verified-session flow (§7) first; then gate history/debt/reorder behind it.
**Priority:** P1 (if owner wants self-service debt/history) else P2. **Milestone:** Phase 2.
**Risk:** **privacy** — must not show debt/history without verification.

## 7. Customer Identity & Privacy — ❌ (verification) / 🟡 (basics)
**Evidence:** phone normalize/validate (`observability.clean_phone`, VN regex), `debt.search_customers`,
`debt.add_customer`; kiosk wanted-list caps (anti-abuse).
**Gaps:** ❌ OTP/PIN/staff-assisted **verification**, ❌ verified session, ❌ duplicate-phone handling
policy, ❌ general **rate limiting**, ❌ owner setting "show debt on kiosk?", 🟡 shoulder-surfing
mitigation. No data is leaked today only because kiosk simply never exposes customer data.
**Recommendation:** new `Cago Customer Verification` flow (staff-assisted code or SMS OTP via the Zalo/SMS
helper), short verified-session token, owner toggle `cago_kiosk_debt_visible`, request rate limits.
**Priority:** **P1** (gates §6 privacy features). **Milestone:** Phase 2. **Risk:** highest privacy/security area.

## 8. Staff UI — ✅
**Evidence (web/ staff):** search, detail (image/price/stock/location/advice/alternatives/safety),
POS open button, wanted-list retrieval + status, chat (`ask_staff`); role guard; staff DTO excludes
import price/profit (audit-enforced).
**Gaps:** none material. **Priority:** — . **Risk:** low.

## 9. Owner UI — ✅
**Evidence (web/ owner):** tra giá, sửa giá/sửa sản phẩm (+image upload), tạo SP, ghi nợ, khách trả nợ,
sổ công nợ + huỷ bút toán, hàng sắp hết, **lô & HSD**, báo cáo (today/week/month + bán chạy), Zalo draft;
confirm dialogs on writes; CSV import (`sample_data`).
**Gaps:** 🟡 confirmations use native `confirm()`; 🟡 no in-UI bulk product import (CSV is a bench cmd).
**Recommendation:** owner CSV upload screen; shadcn modals. **Priority:** P2. **Risk:** low.

## 10. POS — 🟡
**Evidence:** native ERPNext POS is the mandatory fallback; POS Profile auto-created
(`setup.company._ensure_pos_profile`); `has_posawesome` capability flag in bootstrap; port strategy +
spike documented (docs/28, docs/29). `api/pos.py` intentionally empty.
**Gaps:** ❌ `cago_posawesome` not built (by design — spike pending); ❌ **wanted-list→POS handoff**;
❌ GL/Stock-Ledger comparison tests (planned in spike).
**Recommendation:** ship MVP on native POS; run the spike (docs/29); add a `cago.api.pos.*` "send wanted
list to POS / draft invoice" helper. **Priority:** handoff **P1**, fork **Later** (spike-gated).
**Risk:** money/stock correctness if a forked POS posts wrongly — **high** (mitigated by keeping it off the MVP path).

## 11. Debt — 🟡
**Evidence:** `debt.record_debt` (Journal Entry), `record_repayment` (Payment Entry, privileged),
`get_customer_ledger` (+ running balance + voucher_type), `cancel_entry`, `reports.debt_list`,
Zalo `debt_reminder` draft; every write logged (Cago Owner Action Log).
**Gaps:** **credit sale uses JE and does NOT move stock or record items** (docs/24); ❌ debt-on-kiosk
after verification (§7); ❌ debt **audit *report*** (data logged, not summarized).
**Recommendation:** replace JE-debt with a **credit Sales Invoice (is_pos, unpaid)** so stock + items +
GL are correct and repayment is a normal Payment Entry against the invoice. **Priority:** **P1**.
**Risk:** current JE approach diverges debt from inventory — **high**.

## 12. Purchasing / Suppliers — ❌
**Evidence:** ERPNext native Supplier/Purchase Receipt/Purchase Invoice exist but **no `cago` wrapper or
UI**; import price only via ERPNext Desk.
**Gaps:** ❌ supplier mgmt UI, ❌ simple purchase receipt (stock-in + cost), ❌ supplier price history,
❌ low-stock→purchase suggestion, ❌ supplier contact surfacing.
**Recommendation:** a simple owner "Nhập hàng" screen → Purchase Receipt (sets real stock + valuation),
ties into §3 reorder. **Priority:** **P1** (it's how real stock + import price enter the system).
**Milestone:** Phase 2. **Risk:** without it, stock status stays manual.

## 13. Reports — 🟡
**Evidence:** `reports.period_summary` (today/week/month revenue + invoice count), `best_sellers`,
`low_stock`, `debt_list`; expiry report (`inventory.expiring_soon`).
**Gaps:** ❌ cash/bank/credit split, 🟡 sales-by-product (best_sellers only) / ❌ sales-by-customer,
❌ profit estimate (owner-only; needs cost), ❌ seasonal report; no charts.
**Recommendation:** extend `reports.*`: payment-mode split, sales-by-customer, owner-only gross-margin
estimate; optional dashboard charts. **Priority:** payment split + sales-by-customer **P1**, profit **P2**,
seasonal **Later**. **Risk:** profit report must stay owner-only (margin exposure).

## 14. Chatbot — ✅ (strength)
**Evidence:** provider-agnostic (`providers/`: openai_compat/anthropic/gemini/fake) + primary/fallback +
deterministic offline mode (no lock-in); role-aware (ask_kiosk/staff/owner); retrieval via **DTOs only**
(LLM never touches DB), focus + **history** context; product cards in responses; safety refusal layer;
Cago Chatbot Log (session/phone/role/latency/flags). No hallucinated price/stock (grounded) / dosage (refused).
**Gaps:** 🟡 LLM key rotation is an ops task (docs/23). **Priority:** — . **Risk:** low.

## 15. Search — 🟡
**Evidence:** `dto.search_item_codes` over SEARCH_FIELDS (name, display_name, **local_names**, item_group,
use_cases, crop/animal targets, **package_color**) with accent-insensitive collation; chatbot retrieval
adds phrase-first + ≥2-keyword + curated STOPWORDS.
**Gaps:** ❌ barcode search (no barcode, §1); 🟡 fuzzy/typo tolerance is LIKE-only (no trigram/edit-distance).
**Recommendation:** add barcode search with §1; optional fuzzy (MariaDB ngram / Levenshtein) if needed.
**Priority:** barcode **P2**, fuzzy **Later**. **Risk:** low.

## 16. Notifications — 🟡
**Evidence:** Zalo/SMS **drafts** only (`owner.zalo_draft`: debt_reminder, restock) — copy/paste.
**Gaps:** ❌ actual send/integration, ❌ low-stock alert, ❌ back-in-stock notify, ❌ reorder reminder,
❌ owner alerts; **no `scheduler_events` in hooks.py** (nothing scheduled).
**Recommendation:** a Python **Zalo/SMS helper service** (docs/05) + Frappe scheduler jobs for low-stock /
expiry / debt reminders (opt-in). **Priority:** scheduled low-stock/expiry **P1**, send integration **P2**.
**Risk:** sending to customers needs consent/opt-out — medium.

## 17. Security — ✅ (mostly)
**Evidence:** roles (Cago Owner/Staff); **DTOs not raw DocTypes**; kiosk public-safe (allow_guest)
APIs; `run_audit` 11/11 (no sensitive keys, chemical warnings, signup off, phone login); daily backup
(compose `backup` profile); secrets via env/site_config (no keys in code — scanned clean); chat uses
sessionStorage (not localStorage) for non-sensitive data; CSRF on writes (Next + bootstrap).
**Gaps:** ❌ general **rate limiting** (only wanted-list caps), 🟡 field-exposure relies on DTO discipline
(good, but add a CI audit gate), 🟡 verified-session (§7).
**Recommendation:** add request rate limits on guest + auth APIs; run `run_audit` in CI. **Priority:** P1.
**Risk:** guest endpoints without rate limit — medium (abuse/DoS).

## 18. Operations — 🟡
**Evidence:** backup (compose profile), CSV import (`sample_data.import_sample_products`), deployment
(docs/19), owner/staff training (docs/22, docs/14), **offline** kiosk PWA read-cache, single docker compose.
**Gaps:** 🟡 documented **restore** procedure, ❌ data **export** UI, 🟡 **rollback** plan doc, 🟡
offline-**write** + sync (read-cache only today).
**Recommendation:** write a restore+rollback runbook; add export (bench backup is enough for now);
offline-write is a later phase. **Priority:** runbook **P1**, export **P2**, offline-write **Later**.
**Risk:** untested restore = data-loss risk — medium.

---

## A. Feature coverage matrix
| # | Area | Status |
|---|---|---|
| 1 | Product Catalog | 🟡 |
| 2 | Pricing | 🟡 |
| 3 | Stock | 🟡 |
| 4 | Product Advice | ✅ |
| 5 | Chemical Safety | ✅ |
| 6 | Customer Kiosk | 🟡 |
| 7 | Customer Identity/Privacy | ❌/🟡 |
| 8 | Staff UI | ✅ |
| 9 | Owner UI | ✅ |
| 10 | POS | 🟡 |
| 11 | Debt | 🟡 |
| 12 | Purchasing/Suppliers | ❌ |
| 13 | Reports | 🟡 |
| 14 | Chatbot | ✅ |
| 15 | Search | 🟡 |
| 16 | Notifications | 🟡 |
| 17 | Security | ✅ |
| 18 | Operations | 🟡 |

## B. Missing feature list (the real gaps)
1. **Credit sale that reduces stock** (replace JE-debt with credit Sales Invoice). *(correctness)*
2. **Purchasing/"Nhập hàng"** → real stock + import price (drives real stock status + reorder).
3. **Customer verification** (OTP/PIN/staff-assisted) + verified session → unlocks kiosk history/debt.
4. Barcode/QR (field + scan + search).
5. Reports: cash/bank/credit split, sales-by-customer, owner-only profit estimate.
6. Notifications: scheduled low-stock/expiry/debt reminders + actual Zalo/SMS send.
7. Pricing: min-selling-price guard, wholesale/customer price, price history.
8. Reorder level + low-stock→PO suggestion; reserved/held stock; seasonal.
9. Wanted-list→POS handoff; `cago_posawesome` (spike-gated).
10. General API rate limiting; labeled images (incl. chemical label); restore/rollback runbook; offline-write.

## C. Recommended new docs
- `docs/31_CREDIT_SALE_AND_STOCK.md` — JE→credit Sales Invoice migration (money+stock correctness).
- `docs/32_PURCHASING_AND_IMPORT.md` — supplier + Purchase Receipt + import price + reorder.
- `docs/33_CUSTOMER_VERIFICATION_AND_PRIVACY.md` — verification, verified session, kiosk debt toggle.
- `docs/34_NOTIFICATIONS_AND_SCHEDULER.md` — scheduled alerts + Zalo/SMS send.
- `docs/35_OPERATIONS_RESTORE_ROLLBACK.md` — backup/restore/rollback runbook.

## D. Recommended custom fields / DocTypes
- **Item:** `cago_barcode` (or ERPNext Item Barcode), `cago_min_price`, `cago_reorder_level`,
  `cago_label_image` (or typed gallery child).
- **Customer:** `cago_verified` (+ verified-at), owner setting elsewhere.
- **Settings (new Single `Cago Settings`):** `kiosk_debt_visible`, `expiry_warn_days`,
  `low_stock_threshold`, notification toggles, Zalo/SMS creds ref.
- **New DocTypes:** `Cago Customer Verification` (audit of verification attempts),
  optional `Cago Advice Rule` (problem→recommend/avoid), optional `Cago Notification Log`.

## E. Recommended APIs to add
- `cago.api.sales.credit_invoice(customer, items)` — credit Sales Invoice (replaces JE-debt).
- `cago.api.purchasing.{suppliers, receive_stock, supplier_price_history, reorder_suggestions}`.
- `cago.api.verify.{request_code, confirm_code}` + verified-session guard; gate
  `kiosk.purchase_history`, `kiosk.customer_debt` behind it.
- `cago.api.reports.{payment_split, sales_by_customer, profit_estimate(owner-only)}`.
- `cago.api.pos.send_wanted_list(code)` — handoff to native POS / draft invoice.
- `cago.api.catalog.scan_barcode(code)`.

## F. Recommended tests to add
- Credit Sales Invoice: GL + **Stock Ledger** correct; repayment closes it (compare vs native POS).
- Purchase receipt raises Bin qty + sets valuation; reorder suggestion logic.
- Verification: unverified kiosk session **cannot** read debt/history (privacy regression test) + rate-limit.
- Reports: payment split sums to revenue; profit estimate **owner-only** (audit).
- Notifications scheduler: low-stock/expiry jobs select the right rows (no send in test).
- Extend `run_audit` (CI gate) + barcode search test.

## G. Updated roadmap
- **Now / MVP (done or in flight):** catalog+advice+safety, kiosk (URL-routed, search/filter, PWA),
  owner/staff/login (Next.js), debt (JE) + ledger, reports (period+best+low-stock), chatbot, batch/expiry,
  native POS, audit 11/11, single docker compose. *(In flight: kiosk path-routing refactor — paused.)*
- **Phase 2 (P1):** credit Sales Invoice (stock+money), purchasing/import + real stock status,
  customer verification + privacy gating, payment-split & sales-by-customer reports, scheduled low-stock/
  expiry/debt alerts, min-price guard, API rate limiting, restore/rollback runbook, wanted-list→POS.
- **Phase 3 (P2/Later):** barcode/QR + search, wholesale/customer pricing + history, profit estimate,
  reorder/seasonal, labeled images, fuzzy search, POS Awesome fork (spike-gated), offline-write+sync,
  dashboard charts.

## H. Top 10 risks
1. **Credit sale via JE doesn't move stock** → inventory/accounting divergence. *(P1)*
2. **No purchasing flow** → stock status stays manual/inaccurate. *(P1)*
3. **No customer verification** → privacy risk the moment kiosk shows debt/history. *(P1, gate it)*
4. Forked POS could mis-post money/stock → keep OFF the MVP path; test GL/SLE. *(spike-gated)*
5. No general rate limiting on guest APIs → abuse/DoS. *(P1)*
6. No tested **restore/rollback** → data-loss risk. *(P1)*
7. Selling below cost (no min-price guard). *(P1/P2)*
8. Notifications are draft-only → missed low-stock/expiry/debt follow-ups. *(P1)*
9. Manual stock status drifts from reality. *(P1)*
10. LLM key handling / rotation is an ops responsibility (docs/23). *(P2)*

## I. Top 10 quick wins
1. `cago.api.reports.payment_split` (cash/bank/credit) — uses existing invoices.
2. Owner **CSV upload** screen (importer already exists as a function).
3. Scheduled **expiry** + **low-stock** alert jobs (data + reports already exist).
4. `cago_min_price` field + guard in `update_price`.
5. Item **barcode** field + barcode search (small `dto`/search addition).
6. "Unsafe questions" owner report from Cago Chatbot Log (data already logged).
7. Replace owner native `confirm()` with shadcn modals (UX polish).
8. Run `run_audit` as a **CI gate**.
9. `cago.api.pos.send_wanted_list` handoff (draft Sales Invoice from a wanted list).
10. Restore/rollback **runbook** doc (docs/35) — no code.

---
*Awaiting approval. No code until approved. Note: the kiosk path-based routing refactor is paused mid-way (helpers added, not wired); the deployed kiosk uses the working query-param routing and is reload-safe.*
