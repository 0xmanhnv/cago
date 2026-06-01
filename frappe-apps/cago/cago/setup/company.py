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
		_apply_store_settings()  # idempotent — also (re)applies the VND number format
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
	no public signup, AgriMate brand on the login page, and VND number formatting
	(no decimals, dot thousands → 1.234.567đ — đồng has no sub-unit)."""
	frappe.db.set_single_value("System Settings", "allow_login_using_mobile_number", 1)
	# VND has no fractional unit. fmt_money(currency=) reads the GLOBAL DEFAULTS, so set both
	# the Single and the default (POS Awesome + ERPNext desk then show "320.000" not "320.000,00";
	# Cago's own /staff/sell already formats VND manually).
	frappe.db.set_single_value("System Settings", "number_format", "#.###")
	frappe.db.set_single_value("System Settings", "currency_precision", 0)
	frappe.db.set_default("number_format", "#.###")
	frappe.db.set_default("currency_precision", "0")
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
		ensure_payment_modes()  # keep payment modes in sync even if the profile predates this
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
	ensure_payment_modes()


def ensure_payment_modes():
	"""Make both cash and bank-transfer payments usable for Cago checkout (sales.quick_sale).

	A native ERPNext POS payment only submits if its Mode of Payment has an account for the
	company AND is listed in the POS Profile. The Standard chart ships a 'Bank Accounts' group
	but no leaf bank account and no bank-type mode wired to the company, so 'Chuyển khoản' sales
	would fail. This creates a leaf bank account, a 'Chuyển khoản' mode pointing at it, and adds
	both Cash + Chuyển khoản to the POS Profile. Idempotent.
	"""
	company = frappe.get_all("Company", pluck="name")[0]
	bank_mode = "Chuyển khoản"

	# 1) A leaf bank account under the Bank Accounts group.
	bank_acc = frappe.db.get_value("Account", {"company": company, "account_type": "Bank", "is_group": 0}, "name")
	if not bank_acc:
		parent = frappe.db.get_value("Account", {"company": company, "account_type": "Bank", "is_group": 1}, "name")
		if parent:
			acc = frappe.get_doc(
				{
					"doctype": "Account",
					"account_name": "Tài khoản ngân hàng",
					"parent_account": parent,
					"company": company,
					"account_type": "Bank",
					"is_group": 0,
				}
			)
			acc.insert(ignore_permissions=True)
			bank_acc = acc.name

	# 2) A bank-transfer Mode of Payment wired to that account for this company.
	if not frappe.db.exists("Mode of Payment", bank_mode):
		frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": bank_mode, "type": "Bank", "enabled": 1}).insert(
			ignore_permissions=True
		)
	if bank_acc:
		mop = frappe.get_doc("Mode of Payment", bank_mode)
		if not any(a.company == company for a in mop.accounts):
			mop.append("accounts", {"company": company, "default_account": bank_acc})
			mop.save(ignore_permissions=True)

	# 3) Both modes present in the POS Profile.
	profile_name = frappe.db.get_value("POS Profile", {"company": company}, "name")
	if profile_name:
		prof = frappe.get_doc("POS Profile", profile_name)
		existing = {p.mode_of_payment for p in prof.payments}
		changed = False
		for m in ("Cash", bank_mode):
			if frappe.db.exists("Mode of Payment", m) and m not in existing:
				prof.append("payments", {"mode_of_payment": m, "default": 1 if m == "Cash" else 0})
				changed = True
		if changed:
			prof.save(ignore_permissions=True)
	frappe.db.commit()
