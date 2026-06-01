# 36 — Staff Mobile POS (Cago-native `/staff/sell`) — Evaluation & Plan

**Date:** 2026-06-01 · **Decision:** staff (rural, phone-first) sell via the **Cago-native `/staff/sell`** POS, upgraded to a complete mobile POS. **POS Awesome is not on the staff path** — it's a tablet/desktop POS (overflows on a phone, off-screen menu, too many features); kept only as an *optional* POS for the owner on a tablet. See docs/34/35 + memory.

## Why Cago-native for staff (evaluation conclusion)
- **Device reality:** rural staff use **phones**. POS Awesome (Vuetify, tablet/desktop) overflows on a phone in portrait and its menu/controls fall off-screen — confirmed on-device. Forcing it to fit a phone would require a CSS/responsive **fork** (against our rules).
- **Simplicity for low-tech users:** we control the UI — big buttons, one column, only what a till needs.
- **Safe + clean:** MIT (no GPL), no fork, no 11 migrate patches, consistent with the rest of Cago, **cost/valuation hidden from staff by default** (Cago DTO), Vietnamese already.
- **Native ERPNext POS** remains the mandatory fallback; accounting/stock still post through ERPNext (`quick_sale` = submitted is_pos Sales Invoice).

## What `/staff/sell` ALREADY has (don't rebuild)
`web/src/components/staff/Checkout.tsx` + `cago.api.sales.quick_sale`:
- Product list with search (loads catalog up front), tap to add, **per-line UOM picker** (Bao/Kg/Lạng) + **decimal qty**, live stock shown.
- **Tiền mặt / Chuyển khoản** → paid is_pos Sales Invoice (stock down, GL, loyalty); **VietQR** for bank.
- **Friendly stock check** (Vietnamese), retail-price resolution, refresh after sale.
- **58mm receipt print** (`sales.get_receipt`).
- Sibling staff screens: **Trả hàng** (`/staff/returns` → `return_sale`), barcode lookup (`catalog.find_by_barcode`) on the search screen.

## Gaps to close for a "complete" till (the plan)

| # | Gap | Backend | Frontend | Effort |
|---|---|---|---|---|
| G1 | **Ghi nợ at the till** (sell on credit to a known customer) | `quick_sale(payment_mode="credit", customer=...)` → submitted UNPAID is_pos invoice (respects `cago_debt_limit`); staff-allowed | 3rd payment button **Ghi nợ** (requires picking a customer) | M |
| G2 | **Customer pick (optional)** + walk-in default + show current debt | staff-safe `sales.search_customers_lite` (name/phone + outstanding text; **no cost**) | a "Khách" chip at top: walk-in by default, tap to search/pick; shows "đang nợ X" | M |
| G3 | **Barcode add** in the sell screen | reuse `catalog.find_by_barcode` | scan/enter field → add to cart | S |
| G4 | **Giữ đơn / Mở lại** (park a sale, serve next customer) | none (client only) | "Giữ đơn" → store cart in sessionStorage; a "Đơn đang giữ (n)" list to resume | S–M |
| G5 | **Product cards with images** (more visual for low-tech) | none (DTO has image) | grid of image cards instead of a text list (toggle list/grid) | S |
| G6 | **Discount (owner-gated)** | `quick_sale` accept a line/total discount; gate by a POS setting so staff can't discount unless allowed | optional discount field shown only if enabled | S–M |
| G7 | **In phiếu tự động** sau khi bán (tuỳ chọn) | have `get_receipt` | auto-open print after submit if enabled | S |

Keep everything mobile-first: one column, ≥56px tap targets, big totals, Vietnamese, no ERP jargon (design system docs/16).

## Status (2026-06-01): S1–S10 ALL DONE ✅
- **S7 Mở/đóng ca tại quầy (đếm két, theo từng người bán):** DocType `Cago Till Shift` + `cago.api.shift` (`open_shift`/`current_shift`/`close_shift`). Mở ca nhập tiền đầu ca; mỗi hoá đơn quầy gắn `Sales Invoice.cago_cashier` (người bán thật, vì hoá đơn submit dưới Administrator nên `owner` không phải thu ngân); đóng ca cộng tiền mặt **của riêng thu ngân** từ lúc mở ca → dự kiến = đầu ca + tiền mặt bán − chi ra, so với đếm thực tế (khớp/thừa/thiếu). UI: thanh ca trên `/staff/sell` + dialog mở/đóng + màn đối soát. Tests `test_shift.py` (gán đúng thu ngân, khớp két, thiếu tiền). Bổ sung tới **81 Cago tests**.

## Status (2026-06-01): S1–S6, S8, S9, S10 DONE (lịch sử)
- **S6 Split / trả một phần:** `quick_sale(payments=[{mode,amount}])` — tiền mặt + chuyển khoản; thiếu → ghi nợ (cần khách thật, kiểm hạn mức); UI "➗ Tách / trả một phần".
- **S8 In lại + khổ giấy:** nút "🖨 In lại" mở danh sách hoá đơn gần đây (`list_recent_sales`) → tìm → in lại; chọn khổ **58mm / 80mm / A5** (nhớ trong localStorage); áp cho cả màn kết quả + tự in.
- **S9 Sửa giá từng dòng (owner cho phép):** cờ Company `cago_allow_price_edit` (OwnerSettings bật/tắt) → khi bật, mỗi dòng có ô "Đơn giá" sửa được (mặc cả); **server `quick_sale` tự kiểm cờ**, tắt thì bỏ qua giá client gửi. Có test `test_price_override_only_when_owner_enables_it`.
- **S10 Bàn phím số + layout tablet:** lưới sản phẩm `sm:2 / lg:3` cột cho tablet; bấm số lượng mở bàn phím số cảm ứng (nút to); thanh tổng rộng tới 960px.
- **Còn lại — S7 (mở/đóng ca tại quầy):** chưa làm; cần model trách nhiệm theo người bán/thiết bị (xem mục dưới).
- Verified live: 79 Cago tests pass; sửa luôn lỗi tồn CAM-GA-CON-25KG bị định giá âm (chặn bán) bằng Stock Reconciliation. Web image build (next build) sạch lint+type.

## Status (2026-06-01): S1–S4 DONE, deployed + verified live
- **S1 Ghi nợ tại quầy:** `quick_sale(payment_mode="credit", customer)` → unpaid stock-reducing invoice, respects `cago_debt_limit`; staff-safe `search_customers_lite` + `add_customer_lite` (no cost shown); customer bar + **Ghi nợ** button; customer attached to cash/bank too (loyalty).
- **S2 Mã vạch:** barcode quick-add (`catalog.find_by_barcode`) in the sell screen.
- **S3 Giữ đơn / mở lại:** park sales to sessionStorage, resume/drop.
- **S4 Giảm giá + tự in:** optional total discount (recorded on the invoice, owner sees it) + auto-print toggle.
- Verified live (proxy): credit + discount (310k = 320k−10k), session stays staff; **78 Cago tests pass**; native POS + kiosk untouched. Product list already shows image thumbnails (mobile-friendly); a full image-grid toggle was deemed unnecessary for now.

## Finalized gap list (2026-06-01) — to make /staff/sell the complete primary POS

Already in /staff/sell (S1–S5): search+barcode, image thumbnails, retail UOM (Bao/Kg/Lạng) +
decimal qty, live stock + oversell block, customer pick + add + ghi nợ (debt-limit),
Tiền mặt/Chuyển khoản/Ghi nợ, total discount, hold/resume, VietQR, 58mm receipt + auto-print,
loyalty, returns (/staff/returns).

**A — WILL ADD (necessary; S6–S10):**
| # | Feature | Why (rural agri shop) |
|---|---|---|
| S6 | **Split / partial payment** | one sale = tiền mặt + chuyển khoản, or pay part now + rest as ghi nợ |
| S7 | **Cashier shift at the till** (mở/đóng ca + đếm két) | per-device accountability; wire the existing cashbook into the sell flow |
| S8 | **Reprint past invoice + printer size** (58/80mm, A5) | find a recent sale → reprint; shops use different printers |
| S9 | **Owner-gated per-line price/discount edit** | bargaining ("bớt giá") is normal; allow only if owner enables it |
| S10 | **Number keypad + bigger product grid (tablet)** | faster entry; a wide layout so the counter can use a tablet too |

**B — LATER (nice-to-have):**
- Simple promotions (mua N giảm / theo nhóm khách) — a light version, not the full pricing-rule engine.
- Named/parked multi-orders (current hold/resume already covers the basics).
- Find-sale + reprint surfaced inside the sell screen.

**C — SKIP for this shop (use POS Awesome on a tablet only if ever truly needed):**
gift cards, m-pesa, multi-currency, quotations, internal sales/purchase orders, secondary
customer display, in-POS analytics dashboard, multi-warehouse, offline-write, bulk label print.

**Verdict:** build A (S6–S10) so `/staff/sell` is the complete primary POS for owner + staff,
counter + phone — 100% Vietnamese, modern UI we control, zero-config, resilient. POS Awesome
stays installed as an optional owner/tablet power-tool (already working) but isn't the daily driver.

## Milestones
- **S1 — Ghi nợ tại quầy (G1+G2):** highest value for a rural shop. quick_sale credit mode + staff-safe customer pick + debt-limit guard + "đang nợ" hint. Test: credit sale reduces stock, raises receivable, respects limit; cash/bank unchanged.
- **S2 — Quét mã vạch + thẻ hàng có ảnh (G3+G5):** faster, more visual.
- **S3 — Giữ đơn / mở lại (G4):** counter multitasking.
- **S4 — Giảm giá có kiểm soát + auto-print (G6+G7):** finishing touches.
- **S5 — Polish + test:** mobile layout pass (no overflow, big buttons), full flow (cash/bank/credit/return/print), Cago 76+ tests stay green, native POS intact.

## Non-goals / safety
- No POS Awesome dependency; native POS fallback preserved; no ERPNext/Frappe core changes.
- Cost/valuation never shown to staff (Cago DTO). Credit sale honors `cago_debt_limit`.
- Each feature: backend + UI + test, deployed/verified, committed (no co-author trailers).

## POS Awesome disposition
Keep the docs/34 evaluation + the Vietnamese pack (cago/setup/pos_i18n.py) for the **owner/tablet optional** use. Tear down the disposable eval bench when done:
`docker rm -f paw-bench paw-db paw-redis && docker network rm paw-eval`.
