# 24 — Known Limitations & Decisions (post-review)

Recorded after the PM/techlead/BA + security + UX + DB review. None are blocking for
the MVP pilot; each has a clear future path.

## Accounting: "Ghi nợ" books revenue without stock movement

`record_debt` posts a **Journal Entry** (Dr Debtors / Cr Income) to increase a
customer's balance quickly. This is intentionally simple for the rural shop, but it
means:

- **Inventory is NOT reduced** and there is no item-level line when goods leave on credit.
- No tax/COGS breakdown.

This is acceptable for a shop that tracks stock loosely, but if accurate inventory is
required, the correct flow is a **credit Sales Invoice** (unpaid) via native POS — which
deducts stock and records items — then `record_repayment` settles it. Recommended upgrade
once the owner is comfortable with POS. `record_repayment` (Payment Entry, on-account) is
already standard and correct.

## Privilege elevation for accounting writes

Owner debt actions run the Journal/Payment Entry **as Administrator internally**
(`_submit_privileged`) because ERPNext's `get_account_details` enforces `Account` read
permission that a least-privilege `Cago Owner` lacks. The business audit (Cago Owner
Action Log) still records the real owner. Alternative: grant `Cago Owner` the ERPNext
accounting roles — rejected to keep the role minimal.

## Other

- **POS Awesome**: deferred until an ERPNext v16 build exists (docs/21). Native POS is the
  fallback and requires a POS Profile (auto-created) + ERPNext POS/sales roles on the cashier.
- **Search/list pagination**: list endpoints cap results (owner/staff 24, kiosk 60). Fine
  for a single rural store; add pagination if the catalogue grows large.
- **Debt list / customer search**: compute balances per-customer (one GL lookup each).
  Fine for a small customer base; batch via a single GL aggregate if it grows.
- **Wanted list lifecycle**: created `New`, expires in 2 days; there is no automatic
  expiry sweep or "convert to POS cart" yet (manual fulfilment by staff via the code).
- **Chatbot**: deterministic retrieval (no external LLM) by design — safe and offline.
