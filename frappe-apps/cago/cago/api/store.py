# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Store profile (Thông tin cửa hàng).

Owner-editable shop identity — name + contact — surfaced on the printed receipt header and the
public order-tracking page. The display NAME lives on Website Settings.app_name (the same value the
receipt already prints); the rest are Cago custom fields on the Company record.
"""

import frappe

from cago.utils.permissions import ensure_cap


def _company():
	return frappe.defaults.get_global_default("company") or (frappe.get_all("Company", pluck="name") or [None])[0]


def store_profile():
	"""Plain dict of the store profile (no permission check) for internal use (receipt, public track)."""
	c = _company()
	name = frappe.db.get_single_value("Website Settings", "app_name") or (frappe.db.get_value("Company", c, "company_name") if c else "") or ""

	def g(f):
		return (frappe.db.get_value("Company", c, f) if c else "") or ""

	return {
		"name": name,
		"phone": g("cago_store_phone"),
		"address": g("cago_store_address"),
		"hours": g("cago_store_hours"),
		"desc": g("cago_store_desc"),
	}


@frappe.whitelist()
def get_store_profile():
	"""Owner: store name + contact for the Thông tin cửa hàng screen."""
	ensure_cap("settings")
	return store_profile()


@frappe.whitelist()
def set_store_profile(name=None, phone=None, address=None, hours=None, desc=None):
	"""Owner: save the store profile (name → Website Settings.app_name; rest → Company)."""
	ensure_cap("settings")
	nm = (name or "").strip()
	if nm:
		frappe.db.set_value("Website Settings", "Website Settings", "app_name", nm)
	c = _company()
	if c:
		frappe.db.set_value(
			"Company",
			c,
			{
				"cago_store_phone": (phone or "").strip(),
				"cago_store_address": (address or "").strip(),
				"cago_store_hours": (hours or "").strip(),
				"cago_store_desc": (desc or "").strip(),
			},
		)
	frappe.db.commit()
	return store_profile()
