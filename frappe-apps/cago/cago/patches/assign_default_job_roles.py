# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Transition: move existing staff (who hold capability roles directly) onto a chức danh when
their exact capability set matches a seeded one. Conservative — non-matching users keep their
direct roles (the owner assigns a chức danh later via /pos/staff). Idempotent. See docs/27.
"""

import frappe

from cago.utils.permissions import ALL_CAP_ROLES, OWNER_ROLES, caps_for_user_roles


def execute():
	# Patches run before the after_migrate hook that creates custom fields, so ensure the
	# User.cago_job_roles field (+ limits) exists before we touch it.
	from cago.setup.custom_fields import ensure_user_fields

	ensure_user_fields()
	from cago.job_role import seed_defaults

	seed_defaults()

	# Map each chức danh's exact capability-set → its name.
	by_caps = {}
	for jr in frappe.get_all("Cago Job Role", pluck="name"):
		caps = frozenset(frappe.get_all("Cago Job Role Cap", filters={"parent": jr, "parenttype": "Cago Job Role"}, pluck="capability"))
		by_caps.setdefault(caps, jr)

	users = {r.parent for r in frappe.get_all("Has Role", filters={"role": ["in", list(ALL_CAP_ROLES)]}, fields=["parent"])}
	for user in users - {"Administrator", "Guest"}:
		if not frappe.db.exists("User", user):
			continue
		roles = set(frappe.get_roles(user))
		if roles & OWNER_ROLES:
			continue
		if frappe.get_all("Cago User Job Role", filters={"parent": user, "parenttype": "User"}, limit=1):
			continue  # already on a chức danh
		match = by_caps.get(frozenset(caps_for_user_roles(roles)))
		if match:
			doc = frappe.get_doc("User", user)
			doc.append("cago_job_roles", {"job_role": match})
			doc.save(ignore_permissions=True)
	frappe.db.commit()
