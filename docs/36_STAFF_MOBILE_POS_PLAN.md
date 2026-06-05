# 36 — POS (Cago-native `/pos/sell`) — Source of Truth

**Decision (final):** the POS is the **Cago-native `/pos/sell`** (Next.js). It is the ONLY POS, used
by both owner and staff, counter and phone. **POS Awesome was evaluated and fully removed** — do not
reintroduce it. ERPNext's native POS / Sales Invoice stays only as a back-end data fallback.

> Note: the path was `/staff/sell` during early development; it is now `/pos/sell` in the unified
> `/pos` app. Older "S1–S10" logs below use the old path.

## Why Cago-native (evaluation conclusion)
- **Device reality:** rural staff use **phones**. POS Awesome (Vuetify, tablet/desktop) overflowed in
  portrait with off-screen controls — confirmed on-device. Fitting it to a phone needed a fork (against our rules).
- **Simplicity for low-tech users:** we own the UI — big buttons, one column, only what a till needs.
- **Safe & clean:** MIT, no fork, no extra migrate patches, consistent with the rest of Cago,
  **cost/valuation hidden from staff by default** (Cago DTO), Vietnamese throughout.
- Accounting/stock still post through ERPNext (`quick_sale` = a submitted `is_pos` Sales Invoice).

## What `/pos/sell` does
`web/src/components/staff/Checkout.tsx` + `cago.api.sales.quick_sale`:
- Product search (catalog loaded up front) + category chips, tap to add, **per-line UOM picker**
  (Bao/Kg/Lạng) + **decimal qty**, live stock, list/card view, big-screen 2-pane (cart docked right).
- **Cash / Bank / Credit (ghi nợ) / Split** — submitted `is_pos` Sales Invoice (stock, GL, loyalty);
  **VietQR** for bank; credit respects `cago_debt_limit`.
- Customer pick (walk-in default) + add-at-till + "currently owes" hint; loyalty earn/redeem; coupons; delivery fee.
- **Barcode** quick-add; **hold/resume** parked sales; **discount** (owner-gated, floor-checked).
- **Till shift** (open/close, per-cashier cash count) wired into the sell flow.
- **58 mm receipt** print + reprint (58/80mm, A5) + optional auto-print.
- **Offline**: cache catalog/customers, queue orders, auto-sync (cash + credit only); idempotent.
- **Returns / exchange** (`/pos/returns` → `return_sale` / `exchange_sale`).

## History (S1–S10 — all done, summarized)
Built incrementally and verified live; regression tests added (the suite is now **134 Cago tests**).
- **S1** ghi nợ at the till (credit mode + staff-safe customer pick + debt-limit). **S2** barcode add.
  **S3** hold/resume. **S4** owner-gated discount + auto-print. **S5** mobile polish + tests.
- **S6** split/partial payment. **S7** cashier shift at the till (`Cago Till Shift` + `cago.api.shift`,
  per-cashier via `Sales Invoice.cago_cashier`). **S8** reprint + paper size. **S9** owner-gated per-line
  price edit (floor-checked server-side). **S10** number keypad + tablet grid.

### Bug audit (during S6–S10, all fixed + regression-tested)
- Refund didn't credit the drawer (`cago_cashier` `no_copy` → null on the credit note) → assign cashier on `return_sale`.
- Split overpay inflated the drawer → subtract `change_amount` per invoice.
- Per-line override bypassed the price floor → enforce `min_price × conversion`.
- Receipt print blocked by the pop-up blocker (`window.open` after `await`) → open the window synchronously in the click.
- Numeric keypad rebuilt a deleted line (missing `uom`) → guard. `parseFloat("1.000")=1` on debt amounts → strip to digits.
- Stale shift bar after a sale → bump a `refreshKey` to reload.

## Non-goals / safety
- No POS Awesome dependency; native POS/Sales Invoice kept as a back-end fallback; no ERPNext/Frappe core changes.
- Cost/valuation never shown to staff (Cago DTO). Credit sales honour `cago_debt_limit`.
- Skipped for this shop: gift cards, m-pesa, multi-currency, quotations, internal SO/PO, in-POS
  analytics, multi-warehouse, bulk label print.
