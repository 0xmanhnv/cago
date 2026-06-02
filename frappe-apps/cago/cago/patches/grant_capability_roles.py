# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""One-time migration: move the old blanket `Cago Staff` role to granular capability roles.

Before: one `Cago Staff` role = full staff menu. After: each user holds a subset of capability
roles (Cago Sell / Returns / Debt / ...). This grants every existing staff the operational set
(Sell + Returns, plus Debt if the store had staff debt-collection enabled), so nobody loses
access on upgrade. Idempotent — only adds missing roles. See docs/27 and the /pos plan.
"""

import frappe

from cago.utils.permissions import CAP_ROLES


def execute():
	# Ensure the capability roles exist (fixtures usually create them, but don't depend on order).
	for role in CAP_ROLES.values():
		if not frappe.db.exists("Role", role):
			frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 1}).insert(ignore_permissions=True)

	company = frappe.defaults.get_global_default("company") or (frappe.get_all("Company", pluck="name") or [None])[0]
	could_collect = bool(company and frappe.db.get_value("Company", company, "cago_staff_can_collect_debt"))
	grant = ["Cago Sell", "Cago Returns"] + (["Cago Debt"] if could_collect else [])

	staff_users = {r.parent for r in frappe.get_all("Has Role", filters={"role": "Cago Staff"}, fields=["parent"])}
	for user in staff_users:
		if user in ("Administrator", "Guest") or not frappe.db.exists("User", user):
			continue
		doc = frappe.get_doc("User", user)
		# Owners already have everything — don't touch them.
		if "Cago Owner" in {r.role for r in doc.roles}:
			continue
		have = {r.role for r in doc.roles}
		added = False
		for role in grant:
			if role not in have:
				doc.append("roles", {"role": role})
				added = True
		if added:
			doc.save(ignore_permissions=True)
	frappe.db.commit()
