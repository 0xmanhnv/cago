# Milestone 0 + 1 — Setup & Runbook

Covers environment prep (M0) and the data foundation (M1) for AgriMate on
**ERPNext v16 / Frappe v16**. Everything store-specific lives in the custom app
`cago`; ERPNext/Frappe core is never modified.

## Milestone 0 — Environment (one-time)

Install a Frappe bench with ERPNext v16 and create a site. (On an existing bench,
skip to "Get the app".)

```bash
# Frappe bench targeting v16
bench init --frappe-branch version-16 frappe-bench
cd frappe-bench

# ERPNext v16
bench get-app --branch version-16 erpnext
bench new-site agrimate.local
bench --site agrimate.local install-app erpnext
```

Native POS (mandatory fallback) is part of ERPNext — configure a **POS Profile**
in the Desk once products exist. POS Awesome is NOT installed in M0/M1
(see `docs/20_POS_AWESOME_EVALUATION_NOTES.md`).

## Milestone 1 — Install the app & load data

### Get the app

```bash
# from the frappe-bench directory; point at this repo's app path
bench get-app cago /path/to/cago/frappe-apps/cago
bench --site agrimate.local install-app cago
bench --site agrimate.local migrate
```

`install-app` loads fixtures (roles + custom fields); `migrate` syncs the custom
DocTypes. What you get:

- 25 Custom Fields: 18 on **Item**, 7 on **Customer** — i.e. the 15 + 5 data fields
  from the spec, plus 5 layout section/column breaks.
- DocTypes: **Cago Product Alternative**, **Cago Wanted List**
  (+ child **Cago Wanted List Item**), **Cago Owner Action Log**.
- Roles: **Cago Owner**, **Cago Staff**.

### Import sample products

```bash
bench --site agrimate.local execute \
  cago.setup.sample_data.import_sample_products
# or, from this repo:
python scripts/import_products.py --site agrimate.local
```

Loads `data/sample_products.csv` → 4 Items with AgriMate fields + Standard Selling
prices. Re-running updates in place (idempotent).

The importer is self-sufficient on a freshly created site (one that has not been
through the setup wizard): it creates the `Standard Selling` price list and the
Item Group tree root if they are missing. The price list currency follows the
site's default currency (falling back to `VND`). For a real deployment, complete
the ERPNext setup wizard with **company currency VND** first so prices and later
sales transactions all use VND.

## Re-exporting fixtures after Desk edits

```bash
python scripts/export_fixtures.py --site agrimate.local
```

## Backup / restore

```bash
./scripts/backup.sh agrimate.local
./scripts/restore.sh agrimate.local /path/to/database.sql.gz
```

## Troubleshooting

- **"Role ... does not exist" during install/migrate:** run
  `bench --site agrimate.local migrate` once more — roles load from fixtures and the
  DocType permission rows resolve on the second pass.
- **Custom fields not visible on Item/Customer:** `bench --site <site> clear-cache`
  and reload; confirm with the verification snippet in `docs/MILESTONE_0_1_TEST.md`.
