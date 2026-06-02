# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt

import frappe

from cago.utils.permissions import is_staff


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login"
		raise frappe.Redirect

	if not is_staff():
		frappe.throw("Trang này chỉ dành cho nhân viên bán hàng.", frappe.PermissionError)

	# POS Awesome is not installed in MVP (see docs/21); the button is hidden unless
	# the app is present. Native POS is always available.
	context.has_posawesome = "posawesome" in frappe.get_installed_apps()
	context.no_cache = 1
	return context
