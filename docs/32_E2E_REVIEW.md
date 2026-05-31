# 32 — End‑to‑End Review (senior eng / QA / security / UX / ops)

> **Review only — no code changes.** State reviewed at commit `cbae8aa`
> (Frappe 16.19 · ERPNext 16.20 · cago 0.1.0 · Next.js 16 in `web/`).
> Live evidence this review: **52 unit tests pass · audit 11/11 · every owner/staff/owner‑report
> endpoint returns 403 to guests · SQL‑injection‑style search input → 0 rows, no crash · public DTO
> leaks NONE of {valuation,buying,margin,profit,cost,standard_rate,supplier,last_purchase}.**

## 1. Executive summary
Cago is a well‑architected, API‑first ERPNext v16 customization with a decoupled Next.js 16 UI
(kiosk/owner/staff/login), all path‑routed and reload‑safe. Core retail is **complete and hardened**:
catalog + role‑scoped DTOs, multi‑UOM retail pricing, real stock‑in + auto stock status + reorder,
batch/expiry + FEFO mark, customer debt + ledger + cancel + credit‑limit + Zalo draft, reports
(revenue/payment‑split/gross‑profit/best‑sellers/low‑stock), min‑price floor, barcode + scan, VietQR
display, provider‑agnostic safety‑first chatbot, native POS fallback. Security posture is strong
(server‑side guards, DTO whitelisting, audit, parameterized search, no secret/leak). The main gaps are
**features not yet built** (customer verification for kiosk self‑service, supplier payables UI,
credit‑sale that reduces stock, e‑invoice, QR auto‑reconcile, POS Awesome) and **hardening** (general
rate‑limiting, restore/rollback runbook, POS GL/stock automated tests).

## 2. Overall readiness score: **82 / 100**
GO for a **pilot on native ERPNext POS**. Not ready for: kiosk self‑service debt/history (not built),
forked POS (not built), e‑invoice compliance (not built).

## 3. Module readiness matrix
| Module | Readiness | Note |
|---|---|---|
| Architecture (API‑first, no core mods) | 95 | clean; cago independent of POS Awesome |
| Catalog + DTOs | 90 | multi‑UOM, images, category data‑driven |
| Pricing (selling, per‑UOM, min floor) | 88 | no customer/wholesale price; no price history |
| Stock (real qty, auto status, reorder, batch/expiry/FEFO) | 85 | credit sale doesn't reduce stock (limitation) |
| Debt — customer | 85 | JE‑based (no stock link); limit + cancel scoped |
| Debt — supplier (payables) | 0 | **not implemented** |
| Reports | 85 | + payment‑split + gross‑profit; no sales‑by‑customer |
| Kiosk | 88 | browse/search/cart/assistant; **no verified self‑service** |
| Owner UI | 90 | path‑routed; all flows + settings |
| Staff UI | 90 | search/detail/orders/chat + barcode |
| Chatbot | 90 | provider‑agnostic, safety refusal, logging |
| Search | 80 | parameterized; barcode; no fuzzy; no automated fuzz test |
| POS (native fallback) | 80 | works; **no wanted‑list→POS handoff** |
| POS Awesome fork | 0 | deferred (docs/28,29) |
| Customer verification/privacy | 10 | model absent; safe by omission |
| Payments (VietQR display) | 70 | display‑only; no reconcile |
| Security/permissions | 88 | guards + audit; **no general rate‑limit** |
| Operations (deploy/backup/docs) | 80 | restore/rollback runbook thin |
| Test coverage | 70 | 52 unit + audit; no POS/UI/perm e2e |

## 4. Critical blockers
**None for a native‑POS pilot.** (No CRITICAL open defects: the previous CRITICAL — `cancel_entry`
cancelling any voucher — was fixed at `db5a44a`.) Items below are High/Medium.

## 5. High‑priority bugs / risks
- **H1 — Credit "ghi nợ" does not reduce stock or record items.** *debt.py:record_debt* posts a
  Journal Entry (Dr receivable / Cr income, no items). Impact: on‑hand stays unchanged after a credit
  sale → with `cago_stock_auto` ON, status **overstates availability**; best‑sellers & gross‑profit
  miss credit sales. Fix: add an **itemized credit Sales Invoice** flow (is_pos, unpaid, update_stock)
  alongside the amount‑only JE. Test: credit sale reduces Bin qty + posts GL == native POS.
- **H2 — No general rate limiting** on guest/auth endpoints (`ask_kiosk`, `create_wanted_list`,
  future phone lookup). Only wanted‑list size caps exist. Impact: abuse/DoS, brute‑force of any future
  phone lookup. Fix: `frappe.rate_limit` (or cache‑based IP limiter) on guest writes/chat + any verify
  endpoint. Test: N+1 rapid calls → 429.
- **H3 — Restore/rollback unverified.** Backup exists (compose `backup` profile); no documented/tested
  restore or rollback. Impact: data‑loss risk. Fix: runbook + a restore drill on a scratch site.

## 6. Security / privacy risks
- **S1 (Low, by‑omission)** Kiosk never exposes customer/debt/phone data — because verified
  self‑service is **not built**. If/when added, debt/history MUST be gated behind verification + owner
  toggle + audit (see §9). Evidence: kiosk DTOs are `public_dto` only; `ask_kiosk` returns public data.
- **S2 (Resolved)** `cancel_entry` now restricted to vouchers posting to a Customer party (debt.py).
- **S3 (Low)** Guest kiosk chat persists a customer‑entered phone in `Cago Chatbot Log`
  (observability.py). Intentional (opt‑in) but PII; consider masking middle digits.
- **S4 (Low)** No CSP headers / external `img.vietqr.io` + `/files` images loaded; acceptable, but set
  `Secure`/`SameSite` cookies + HTTPS in production (docs/23).
- **Verified clean:** server‑side role guards on every owner/staff API (403 live), DTO whitelists (no
  cost/margin/valuation/supplier leak), parameterized search (no SQLi), React/`mdLight` escaping (no
  XSS), no secrets committed, sessionStorage (not localStorage) for non‑sensitive kiosk chat, CSRF on
  writes via `frappeCall`, audit 11/11.

## 7. UI/UX issues
- **U1 (Med)** Owner "Quản lý ERPNext"/POS links open ERPNext Desk (now `target=_blank`, fixed) — Desk
  itself is ERP‑dense; a non‑tech owner who lands there has no Cago way back (mitigated by new tab).
- **U2 (Low)** Owner destructive confirms use native `confirm()` (cancel voucher, delete image) — works
  but unstyled; consider shadcn modal.
- **U3 (Low)** Kiosk idle reset = 3 min sessionStorage; good. No visible countdown — acceptable.
- **Verified good:** large tap targets (≥56px), simple Vietnamese, clear Back/Home everywhere,
  reload/Back‑safe routes, loading/empty/error states present, chemical safety warning prominent
  (amber block), product images with category‑icon placeholder, draggable fabs, TTS, kiosk idle‑reset +
  "Xong" clear‑session.

## 8. API issues
- **A1 (Med)** Several reports/aggregates were all‑company; **fixed** to filter `_company()`
  (period_summary/payment_split/best_sellers/gross_profit). Confirm `low_stock`/debt paths similarly
  single‑company‑safe (they are, single company).
- **A2 (Low)** `debt_list`/`search_customers` compute balance per‑row (N+1 `get_balance_on`).
  Fine at rural scale (dozens of customers); optimize with one grouped GL query if it grows.
- **A3 (Low)** `pos.py` intentionally empty (no wanted‑list→POS handoff yet).
- **Verified good:** every `@frappe.whitelist` has the correct guard; kiosk `allow_guest` returns only
  public DTOs; `cint`/`flt` guards on guest int params; per‑UOM price isolation fixed in
  `get_selling_price`/`_price_map`/`owner._upsert_selling_price`.

## 9. Permission issues
- **P1 (Gap)** No **verified customer session** model → kiosk cannot (and does not) show debt/history.
  This is the single biggest missing permission surface; build it before any kiosk self‑service.
- Verified: owner‑only writes (`update_price`/`update_product`/`record_debt`/`units`/`purchasing`/
  `payment.save_bank`) enforce `ensure_owner`; staff reads `ensure_staff`; live guests get 403. Roles:
  Cago Owner / Cago Staff (System Manager included for setup).

## 10. Data model issues
- **D1 (Med)** Customer debt uses **Journal Entry**, not Sales Invoice → no item/stock linkage (ties to
  H1). Documented limitation (docs/24).
- **D2 (Low)** New custom fields (`cago_show_retail_on_kiosk`, `cago_stock_auto`, `cago_reorder_level`,
  `cago_min_price`, `cago_debt_limit`, Item Group `cago_icon/color`, Company `cago_bank_*`) are created
  by `setup/custom_fields.ensure_*` (run at create‑site via `import_sample_products`) but the exported
  **`fixtures/custom_field.json` is stale** → a fresh `migrate` without the ensure_* path wouldn't have
  them. Fix: re‑export fixtures (`bench export-fixtures`) so installs are reproducible without the
  sample importer. Test: fresh site install → fields present.
- Verified good: consistent `cago_`/Cago naming; uses ERPNext Item Price (multi‑UOM), Batch, JE/PE,
  Bin; custom DocTypes (Wanted List, Product Alternative, Owner Action Log, Chatbot Log).

## 11. POS risks
- **POS1 (Med)** No **wanted‑list → POS** handoff; staff re‑enters items. Fix: `cago.api.pos.*` to
  pre‑fill a native POS cart / draft Sales Invoice from a wanted‑list code.
- **POS2 (Info)** POS Awesome not installed (`has_posawesome=false`); native POS is the only POS.
  No hidden dependency on POS Awesome (verified: cago never imports posawesome).
- **POS3 (Med, untested)** No automated **GL + Stock Ledger** correctness test for POS sales (manual
  only). Add before relying on POS for money/stock.

## 12. Kiosk risks
- **K1 (Med)** PWA service worker (now scoped to kiosk paths, `cbae8aa`) — re‑verify it does not serve
  stale owner/staff shells on a shared tablet (fix applied; add a test).
- **K2 (Low)** Browser back/refresh after idle reset: session restarts cleanly (sessionStorage + idle
  window). Verified by design.
- **K3 (Gap)** No verified self‑service (phone lookup/debt/history/reorder) — all listed kiosk privacy
  test cases are N/A until §9 is built.

## 13. Chatbot risks
- Verified strong: provider‑agnostic (openai_compat/anthropic/gemini/fake) + primary/fallback +
  deterministic offline; retrieval via **DTOs only** (LLM never touches DB); role‑aware; safety classify
  → refusal for dosage/mixing/stronger/near‑harvest; product cards; `Cago Chatbot Log`. 
- **C1 (Med)** No rate limit on `ask_kiosk` (ties to H2) — an LLM endpoint open to guests can burn
  tokens. **C2 (Low)** LLM key handling is ops (env/site_config; rotate the exposed dev key per docs/23).

## 14. Performance risks
- **PERF1 (Low)** List endpoints are 2‑query (prices + category meta batched; on‑hand batched for
  auto‑status) — good, no obvious N+1 in lists. Detail DTO does a few per‑item queries (fine for 1 item).
- **PERF2 (Med, unmeasured)** No load test at 2k–10k items; search is `LIKE %q%` (no index on the agri
  text fields) — could slow at scale. Recommend measuring + adding indexes / full‑text if needed.
- **PERF3 (Low)** Sample product images are unoptimized screenshots (test data); enforce reasonable
  image sizes for the kiosk.

## 15. Operations / deployment risks
- One `docker compose` builds + runs everything (web public entry → Frappe internal). Backup profile +
  daily bench backup. Docs 01–31 (setup/deploy/training/hardening/limitations/research). CI added
  (`web` + `backend`). Gaps: **restore/rollback runbook** (H3), production **HTTPS/secret store**
  (docs/23 checklist, owner infra), backend CI is standard‑but‑unverified on GitHub's runner.

## 16. Missing test coverage
- POS sale → GL + Stock Ledger equivalence (native; and any future fork). **(highest value)**
- Permission matrix as automated tests (currently live‑probed, not in suite).
- Search fuzz: SQLi/XSS/emoji/very‑long/empty as a unit test (manually probed only).
- Credit‑sale‑reduces‑stock (after H1).
- Verified‑session privacy regression (after §9).
- SW does‑not‑cache‑authed‑shell test.
- Fresh‑install fixtures test (D2).

## 17. Quick wins
1. `bench export-fixtures` → commit updated `custom_field.json` (D2) so fresh installs are reproducible.
2. Rate‑limit `ask_kiosk` + `create_wanted_list` (H2/C1) — `frappe.rate_limit`.
3. Add the search‑fuzz + permission‑matrix unit tests (cheap, high assurance).
4. Wanted‑list→POS handoff endpoint (POS1).
5. Restore/rollback runbook doc (H3) — no code.

## 18. Recommended P0 fixes (before pilot go‑live)
- **H2** rate limiting on guest endpoints. **H3** restore/rollback runbook + one restore drill.
- **D2** export fixtures (reproducible install). **POS3** one manual POS GL/Stock verification documented.

## 19. Recommended P1 fixes
- **H1/D1** itemized credit Sales Invoice (stock‑reducing credit sale) + tests.
- **§9/P1** customer verification + verified session (gates kiosk debt/history).
- **Supplier payables** (công nợ NCC) UI+API. **POS1** wanted‑list→POS handoff.
- Sales‑by‑customer report; SW‑cache test; permission‑matrix tests.

## 20. Recommended P2 improvements
- e‑invoice (Thuế) via VN provider; QR auto‑reconcile; loyalty; wholesale/customer pricing + history;
  fuzzy search; load testing + search indexes; POS Awesome spike (docs/29).

## 21. Suggested manual test checklist (owner/staff/kiosk)
- **Owner:** tra giá; sửa giá (≥ sàn / < sàn → chặn); thêm SP; nhập hàng (tồn tăng); thêm đơn vị lẻ
  (giá kg ≠ bao); thêm lô + HSD (lô "bán trước"); ghi nợ (vượt hạn mức → chặn) / trả nợ (+ QR); huỷ bút
  toán; báo cáo (doanh thu/tách tiền/lãi gộp theo kỳ); barcode set; cài QR; đăng xuất → /login.
- **Staff:** tìm SP (tên/biệt danh/màu); quét/nhập mã vạch → mở SP; xem tồn/vị trí/tư vấn/thay thế/an
  toàn; đơn khách chọn (đổi trạng thái); chat (giá/tồn/“còn gì”); KHÔNG thấy giá nhập/lãi.
- **Kiosk:** duyệt danh mục; tìm + lọc (còn hàng/giá); chi tiết (ảnh/HSD/an toàn/đơn vị lẻ); thêm số
  lượng (+5/+10/gõ); giỏ → mã đơn; gọi người bán; trợ lý (hỏi nối tiếp "2 bao"); để máy 3' → reset;
  reload ở /products/[code] → giữ màn; nút nổi kéo‑thả.

## 22. Suggested automated test plan
- Keep `bench run-tests --app cago` + `run_audit` green in CI (done). Add: POS GL/SLE equivalence;
  permission‑matrix (guest/staff/owner × each API → expected 200/403); search‑fuzz; credit‑sale stock;
  SW‑cache scope; fresh‑install fixtures. Target: every P0/P1 ships with its confirming test.

## 23. Exact files/functions/APIs to inspect or modify
- Credit sale: `cago/api/debt.py` (record_debt) → new `cago/api/sales.py` credit invoice.
- Rate limit: `cago/api/kiosk.py` (create_wanted_list), `cago/api/chatbot.py` (ask_kiosk).
- Fixtures: `cago/hooks.py` fixtures + `cago/fixtures/custom_field.json` (export) + `setup/custom_fields.py`.
- Supplier payables: new `cago/api/supplier.py` (mirror debt.py) + owner routes.
- POS handoff: `cago/api/pos.py` (currently empty).
- Verification: new `cago/api/verify.py` + `Cago Customer Verification` doctype + kiosk gating.
- Reports: `cago/api/reports.py` (sales_by_customer). DTO leak guard: `cago/utils/dto.py` + `setup/audit.py` (CI gate).

## 24. Final go / no‑go
**GO — pilot on native ERPNext POS**, conditional on the P0 set (§18): rate‑limiting, a tested
restore/rollback, exported fixtures, and one documented POS GL/stock verification. **NO‑GO** for kiosk
self‑service debt/history (build §9 first), forked POS, and e‑invoice compliance (build P1/P2 first).
Core retail + debt + reports + chatbot + kiosk‑browse are production‑grade for a single rural store on
native POS.

---
*Awaiting approval. No code changes were made for this review.*
