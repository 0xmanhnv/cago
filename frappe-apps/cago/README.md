# cago

Custom Frappe app — the **core business customization layer** for **Cago**, a sales
support system for a rural Vietnamese agricultural supplies store.

This app sits on top of ERPNext/Frappe (the source of truth for Item, Item Price, Stock,
Customer, Sales/POS Invoice, Payment, Purchase) and adds the store-specific knowledge and
simplified Vietnamese UI that ERPNext does not provide out of the box.

> See the repository `docs/` folder for the full architecture and rules.

## What this app provides (Milestone 1 scope)

- Custom fields on **Item** (15) and **Customer** (5) for agricultural product knowledge.
- Custom DocTypes: **Cago Product Alternative**, **Cago Wanted List**
  (+ child **Cago Wanted List Item**), **Cago Owner Action Log**.
- Roles: **Cago Owner**, **Cago Staff**.
- Fixtures so the whole setup installs reproducibly.
- A sample-data importer that loads `data/sample_products.csv`.

Not yet implemented (later milestones): owner/staff/kiosk UI pages, whitelisted DTO APIs,
and later milestones. The `api/` modules expose whitelisted DTO endpoints.

## Principles enforced

- Do **not** modify ERPNext or Frappe core.
- All store-specific logic lives here, never only inside POS-specific code.
- Native ERPNext POS must remain a working fallback.
- Public/kiosk responses must be role-filtered DTOs, never raw DocTypes (later milestones).

## Install

```bash
# from your frappe-bench directory
bench get-app cago /path/to/cago/frappe-apps/cago
bench --site <your-site> install-app cago
bench --site <your-site> migrate
```

## Import sample products

```bash
bench --site <your-site> execute cago.setup.sample_data.import_sample_products
```

## License

MIT
