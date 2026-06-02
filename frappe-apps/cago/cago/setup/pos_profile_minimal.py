# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Make the (optional) POS Awesome counter screen simple for a rural shop.

POS Awesome exposes ~80 `posa_*` feature toggles on POS Profile. This turns OFF the advanced
ones (gift cards, cash movement, customer display, dashboard, multi-currency, internal
sales/purchase orders, partial/reconcile payments, rate/discount editing...) and keeps the
core till flow ON (cards+images, in-stock only, credit sale, return, customer balance, qty
input, print, block-oversell). Config only — guarded by has_field, imports nothing from
posawesome (no dependency; a no-op if posawesome/those fields aren't installed).

    bench --site <site> execute cago.setup.pos_profile_minimal.apply_minimal_pos
"""

import frappe

OFF = [
	"posa_use_gift_cards", "posa_allow_supervisor_manage_gift_cards", "posa_allow_multi_currency",
	"posa_use_delivery_charges", "posa_auto_set_delivery_charges", "posa_enable_cash_movement",
	"posa_allow_pos_expense", "posa_allow_cash_deposit", "posa_allow_source_account_override",
	"posa_allow_cancel_submitted_cash_movement", "posa_allow_delete_cancelled_cash_movement",
	"posa_require_cash_movement_remarks", "posa_enable_customer_display", "posa_auto_open_customer_display",
	"posa_enable_awesome_dashboard", "posa_allow_company_dashboard_scope", "posa_allow_sales_order",
	"posa_create_only_sales_order", "posa_default_sales_order", "posa_allow_customer_purchase_order",
	"posa_allow_purchase_order", "posa_allow_purchase_receipt", "posa_allow_create_purchase_items",
	"posa_allow_create_purchase_suppliers", "posa_allow_reconcile_payments", "posa_allow_make_new_payments",
	"posa_allow_partial_payment", "posa_display_authorization_code", "posa_display_additional_notes",
	"posa_allow_line_item_name_override", "posa_search_serial_no", "posa_search_batch_no",
	"posa_allow_zero_rated_items", "posa_allow_user_to_edit_rate", "posa_allow_price_list_rate_change",
	"posa_allow_user_to_edit_additional_discount", "posa_allow_user_to_edit_item_discount",
	"posa_allow_return_without_invoice", "posa_allow_free_batch_return", "posa_enable_return_validity",
	"posa_allow_change_posting_date", "posa_show_template_items",
]
ON = [
	"posa_input_qty", "posa_default_card_view", "posa_display_items_in_stock", "posa_allow_credit_sale",
	"posa_allow_return", "posa_show_customer_balance", "posa_allow_print_last_invoice",
	"posa_block_sale_beyond_available_qty", "posa_use_pos_awesome_payments", "posa_hide_variants_items",
]


def apply_minimal_pos(profile=None):
	"""Apply the simple-cashier toggle set to a POS Profile (default: the company's)."""
	if not profile:
		company = frappe.defaults.get_global_default("company") or (frappe.get_all("Company", pluck="name") or [None])[0]
		profile = frappe.db.get_value("POS Profile", {"company": company}, "name")
	if not profile or not frappe.db.exists("POS Profile", profile):
		print("No POS Profile to configure (posawesome not set up?).")
		return
	p = frappe.get_doc("POS Profile", profile)
	# Default walk-in customer so POS Awesome doesn't error "Value missing for Customer" on a
	# quick cash sale (cashier can still pick a named customer for credit).
	if not p.customer:
		walkin = frappe.db.get_value("Customer", {"customer_name": "Khách lẻ"}, "name")
		if not walkin:
			try:
				from cago.api.sales import walkin_customer

				walkin = walkin_customer()
			except Exception:
				walkin = None
		if walkin:
			p.customer = walkin
	noff = non = 0
	for f in OFF:
		if p.meta.has_field(f):
			p.set(f, 0)
			noff += 1
	for f in ON:
		if p.meta.has_field(f):
			p.set(f, 1)
			non += 1
	# VND has no decimals. Leave posa_decimal_precision EMPTY so POS Awesome falls back to the
	# system currency_precision (0 → money shows "320.000", no .00) while quantity still uses its
	# own default of 2 decimals (so selling 1.5 Kg/Lạng stays correct). Setting it to "0" would
	# wrongly strip quantity decimals too.
	if p.meta.has_field("posa_decimal_precision"):
		p.set("posa_decimal_precision", "")
	p.flags.ignore_permissions = True
	p.save(ignore_permissions=True)
	frappe.db.commit()
	print(f"Minimal POS applied to {profile}: {noff} off, {non} on.")


def enroll_users(profile=None, users=None):
	"""Enroll COUNTER users for POS Awesome: add them to POS Profile → Applicable for Users
	(required for the opening dialog to list the profile) AND grant the ERPNext "Sales User"
	role (the posapp desk Page requires Sales User/Sales Manager/...; Cago's own roles are
	deskless). Only enroll people who actually man the counter — mobile staff use /staff/sell.

	Default seed users: owner + staff if present. Pass `users` to target specific counter users."""
	if not profile:
		company = frappe.defaults.get_global_default("company") or (frappe.get_all("Company", pluck="name") or [None])[0]
		profile = frappe.db.get_value("POS Profile", {"company": company}, "name")
	if not profile:
		return
	users = users or [u for u in ["owner@cago.test", "staff@cago.test", "Administrator"] if frappe.db.exists("User", u)]
	p = frappe.get_doc("POS Profile", profile)
	have = {u.user for u in (p.applicable_for_users or [])}
	added = 0
	for u in users:
		if u not in have:
			p.append("applicable_for_users", {"user": u})
			added += 1
		# Grant the roles POS Awesome needs: "Sales User" opens the posapp page; "Accounts User"
		# grants Sales Invoice create/submit (the POS posts Sales Invoices). Idempotent.
		if u != "Administrator":
			need = [r for r in ("Sales User", "Accounts User") if r not in frappe.get_roles(u)]
			if need:
				frappe.get_doc("User", u).add_roles(*need)
	if added:
		p.flags.ignore_permissions = True
		p.save(ignore_permissions=True)
	frappe.db.commit()
	print(f"Enrolled {added} user(s) in {profile} (+ Sales User role): {users}")
