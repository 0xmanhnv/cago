# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt

import frappe

from cago.utils.permissions import is_owner


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login"
		raise frappe.Redirect

	if not is_owner():
		frappe.throw(
			"Trang này chỉ dành cho chủ cửa hàng.", frappe.PermissionError
		)

	context.no_cache = 1
	return context
