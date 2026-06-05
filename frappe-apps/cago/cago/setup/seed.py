# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Database seed — the THREE setup layers, kept separate:

1. MIGRATION (schema/structural) — runs on `bench migrate` / install:
     - custom fields:  hooks.after_migrate → cago.setup.custom_fields.setup_all_fields
     - DocTypes + roles fixtures:  hooks.fixtures
     - data patches:  patches.txt (capability roles, default job-role assignment, …)
   These change the SHAPE of the database, not its business records.

2. MANDATORY SEED (this module → seed_baseline) — baseline records EVERY site must have to
   function, run at site creation for BOTH dev and production:
     - Company + accounting defaults + POS Profile + payment modes (ensure_company)
     - selling price lists (Standard Selling, Giá sỉ)
     - category tree + presets (icons/colours) for the kiosk/owner UI
     - default Cago Job Roles (capability presets)
   All idempotent — safe to re-run.

3. OPTIONAL / DEMO SEED — only for trying the system out, NEVER required:
     - cago.setup.sample_data.import_sample_products  (54 demo products + demo batches/stock)
   Gated by LOAD_SAMPLE_DATA in compose; production starts with an EMPTY catalog and imports the
   real one via CSV (cago.setup.sample_data.import_catalog).
"""

import frappe


def seed_baseline():
	"""Layer 2 — mandatory baseline records. Idempotent; run on every site setup (dev + prod)."""
	from cago.job_role import seed_defaults as seed_job_roles
	from cago.setup.company import ensure_company
	from cago.setup.sample_data import (
		DEFAULT_PRICE_LIST,
		_ensure_price_list,
		seed_category_presets,
		seed_category_tree,
	)

	ensure_company()  # company + accounts + POS Profile + payment modes + VND number format
	_ensure_price_list(DEFAULT_PRICE_LIST)  # selling price list the POS/owner UI attach prices to
	_ensure_price_list("Giá sỉ")  # wholesale (giá sỉ) selling list
	seed_category_tree()  # nhóm hàng (Item Group) hierarchy
	seed_category_presets()  # category icons/colours for the kiosk + owner home
	seed_job_roles()  # default Cago Job Roles (capability presets) for staff admin

	frappe.db.commit()
	print("Cago baseline seed ✓ (company, price lists, categories, job roles)")
	return {"ok": True}
