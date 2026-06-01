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
