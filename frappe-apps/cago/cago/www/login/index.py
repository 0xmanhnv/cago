# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt

import frappe

from cago.utils.permissions import is_owner, is_staff


def get_context(context):
	# Already logged in -> go straight to the right home.
	if frappe.session.user != "Guest":
		dest = "/owner" if is_owner() else ("/staff" if is_staff() else "/")
		frappe.local.flags.redirect_location = dest
		raise frappe.Redirect

	context.no_cache = 1
	# Brand is configurable (Website Settings > App Name), default Minh Tuyết.
	context.brand = frappe.db.get_single_value("Website Settings", "app_name") or "Minh Tuyết"
	return context
