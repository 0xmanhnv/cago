# 04 — POS Strategy

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
