# 04 — POS Strategy

> 🗄 **Lỗi thời một phần.** Quyết định cuối: POS = **Cago-native `/pos/sell`** (xem [36](36_STAFF_MOBILE_POS_PLAN.md)); POS Awesome đã **gỡ hẳn**. Phần đánh giá POS Awesome bên dưới chỉ là lịch sử.

## 1. Decision

Use a two-layer POS strategy:

```text
POS Awesome V15/V16 port is an OPTIONAL, parallel spike (a separate fork: cago_posawesome).
MVP/production must ship on ERPNext native POS unless the fork passes FULL compatibility
plus accounting (GL) and stock-ledger correctness tests vs native POS.
Mandatory fallback (always): ERPNext native POS.
```

> Updated 2026-05-31: POS Awesome is **not** on the MVP critical path. It is evaluated as a
> time-boxed spike on a throwaway v16 site. See docs/28 (porting strategy) and docs/29 (spike
> Milestone 1). Decision: *port in parallel, ship MVP on native POS*.

## 2. Why not depend fully on POS Awesome?

Even if POS Awesome V15 is active, it is still an external app/fork. The project should not fail if:

- installation breaks
- compatibility changes
- repo maintenance slows
- upgrade causes UI issues
- a required feature is missing

## 3. POS Awesome evaluation criteria

Pass only if:

- installs cleanly on target ERPNext/Frappe version
- works with POS Profile
- supports product image/card view acceptably
- search is fast enough
- stock updates correctly
- invoices/payments are correct
- staff can use it on tablet/counter
- it does not require core ERPNext modifications
- native POS remains working

## 4. Integration rule

`cago` owns product knowledge.

POS Awesome can consume/display product data, but should not be the only place where:

- local names
- advice script
- safety notes
- alternatives
- shelf location

are stored.

## 5. MVP approach

Milestone POS flow:

1. Configure ERPNext native POS.
2. Evaluate POS Awesome V15.
3. If POS Awesome passes, use it for staff sale.
4. If not, use native POS.
5. Keep owner/staff/kiosk screens independent.

## 6. Fallback flow

If POS Awesome fails:

```text
Staff searches product in cago
→ clicks/open native POS
→ completes sale
```

## 7. Future enhancement

If POS Awesome is stable:

- add link from staff product page to POS Awesome item/cart
- display agri fields in POS item detail if maintainable
- convert wanted list to POS cart if possible without fragile hacks

## 8. Cago-native checkout (selling path for staff)

The raw ERPNext Desk POS (`/app/point-of-sale`) is **not** the staff selling path: Cago
Staff have no Desk/POS permission, so a "Mở POS gốc" link pushed them to a screen that
404s/redirects to `/desk/point-of-sale` and is, by design, the ERP-dense UI we avoid.

Staff now sell through a Cago-native checkout (`/staff/sell`, owner reuses the same button):

```text
Staff opens "🛒 Bán hàng"
→ searches products, adjusts qty (cart)
→ picks 💵 Tiền mặt or 💳 Chuyển khoản
→ cago.api.sales.quick_sale → submitted is_pos Sales Invoice (update_stock, fully paid)
→ stock drops, payment + GL recorded, loyalty points accrue (doc_events)
→ bank sales show a VietQR for the exact amount
```

ERPNext stays the engine (Sales Invoice / Mode of Payment / Stock Ledger / GL); the cart
is just a clean Cago surface. `setup.company.ensure_payment_modes` wires up Cash **and** a
`Chuyển khoản` Mode of Payment (with a leaf bank account) into the POS Profile so both
payment types submit. Native Desk POS remains a working fallback for the **owner** (who has
Desk access) via "⚙️ Quản lý ERPNext". `cago` does not depend on POS Awesome.

## 9. POS Awesome V15 → v16 evaluation outcome (2026-06-01)

Evaluated `defendicon/POS-Awesome-V15` @ `c7e2b93` on a disposable Frappe/ERPNext v16
bench (live site untouched). Result: **CONDITIONAL-GO** — usable directly as an *optional,
owner-scoped* enhanced POS; native POS + Cago `/staff/sell` stay the primary paths; no fork
needed for that scope. Accounting/stock post through native ERPNext (the POS Invoice override
only handles shift validation). One issue: the item API exposes `valuation_rate` with no role
gate → gate POS Awesome to the owner, or fork-patch if staff must use it. POS hiện tại: **docs/36_STAFF_MOBILE_POS_PLAN.md**; vận hành & triển khai: **docs/38_GO_LIVE_RUNBOOK.md**.
