# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""One-time accounting/company setup for a bare ERPNext site.

A site created with `new-site --install-app erpnext` has no Company, Fiscal Year or
chart of accounts (those are normally built by the setup wizard). Debt operations
and native POS need them, so this runs the official setup wizard once, idempotently.

    bench --site <site> execute cago.setup.company.ensure_company
"""

import frappe

COMPANY_NAME = "AgriMate Store"
COMPANY_ABBR = "AS"


def ensure_company():
	"""Create the company + accounting defaults if none exists. Idempotent."""
	if frappe.get_all("Company", limit=1):
		print(f"Company already exists: {frappe.get_all('Company', pluck='name')}")
		_ensure_pos_profile()
		return

	# In a `bench execute`/console context frappe.local.lang is None, which trips a
	# framework bug (get_locale_value leaves `value` unbound) while the setup wizard
	# validates email/jinja templates. Setting a concrete language avoids it.
	frappe.local.lang = "en"

	# Skip notification/email side effects that misbehave on a bare site.
	frappe.flags.in_setup_wizard = True
	frappe.flags.mute_emails = True

	from erpnext.setup.setup_wizard.setup_wizard import setup_complete

	# setup_complete accesses args via attributes (args.fy_start_date), so pass a _dict.
	setup_complete(
		frappe._dict(
			{
				"currency": "VND",
				"country": "Vietnam",
				"timezone": "Asia/Ho_Chi_Minh",
				"language": "english",
				"company_name": COMPANY_NAME,
				"company_abbr": COMPANY_ABBR,
				"chart_of_accounts": "Standard",
				"fy_start_date": "2026-01-01",
				"fy_end_date": "2026-12-31",
			}
		)
	)
	frappe.db.commit()
	_ensure_pos_profile()
	_apply_store_settings()

	co = frappe.get_doc("Company", COMPANY_NAME)
	print("Company created:", co.name)
	print("  receivable:", co.default_receivable_account)
	print("  cash:", co.default_cash_account)
	print("  income:", co.default_income_account)


def _apply_store_settings():
	"""Store-friendly defaults: login by phone (rural users have phones, not email),
	no public signup, AgriMate brand on the login page."""
	frappe.db.set_single_value("System Settings", "allow_login_using_mobile_number", 1)
	try:
		frappe.db.set_single_value("Website Settings", "app_name", "AgriMate")
		frappe.db.set_single_value("Website Settings", "disable_signup", 1)
	except Exception:
		pass
	frappe.db.commit()


def _ensure_pos_profile():
	"""Create a minimal POS Profile so native POS is usable out of the box."""
	company = frappe.get_all("Company", pluck="name")[0]
	if frappe.get_all("POS Profile", filters={"company": company}, limit=1):
		return
	# Prefer a real stock warehouse (Stores / Finished Goods) over transit/WIP.
	warehouse = None
	for wh_name in ("Stores", "Finished Goods"):
		warehouse = frappe.db.get_value(
			"Warehouse", {"company": company, "is_group": 0, "warehouse_name": wh_name}, "name"
		)
		if warehouse:
			break
	if not warehouse:
		warehouse = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")
	co = frappe.get_doc("Company", company)
	write_off_account = co.write_off_account or frappe.db.get_value(
		"Account", {"company": company, "account_name": "Write Off"}, "name"
	)
	cost_center = co.cost_center or frappe.db.get_value(
		"Cost Center", {"company": company, "is_group": 0}, "name"
	)
	profile = frappe.get_doc(
		{
			"doctype": "POS Profile",
			"name": "AgriMate POS",
			"company": company,
			"warehouse": warehouse,
			"currency": "VND",
			"selling_price_list": "Standard Selling",
			"write_off_account": write_off_account,
			"write_off_cost_center": cost_center,
		}
	)
	# A POS Profile needs at least one payment mode.
	cash_mode = frappe.db.get_value("Mode of Payment", {"type": "Cash"}, "name") or "Cash"
	if frappe.db.exists("Mode of Payment", cash_mode):
		profile.append("payments", {"mode_of_payment": cash_mode, "default": 1})
	profile.insert(ignore_permissions=True)
	frappe.db.commit()
	print("POS Profile created:", profile.name)
