# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Demo/test accounts for AgriMate — one per role of the hybrid POS model.

    bench --site <site> execute cago.setup.test_accounts.ensure_test_accounts

Idempotent. Password for all (except Administrator) = Test@12345. Counter users (owner +
counter staff) also get the POS Awesome counter setup (Sales User role + POS Profile
enrollment) via pos_profile_minimal.enroll_users; the shipper is mobile-only (/staff/sell).
"""

import frappe

PASSWORD = "Test@12345"
ADMIN_PASSWORD = "Admin@12345"

ACCOUNTS = [
	{"email": "owner@cago.test", "name": "Chủ cửa hàng", "mobile": "0900000001", "roles": ["Cago Owner"]},
	{"email": "staff@cago.test", "name": "Nhân viên quầy", "mobile": "0900000002", "roles": ["Cago Staff"]},
	{"email": "ship@cago.test", "name": "Nhân viên giao hàng", "mobile": "0900000004", "roles": ["Cago Staff"]},
]
COUNTER_USERS = ["owner@cago.test", "staff@cago.test"]  # use POS Awesome at the counter


def ensure_test_accounts():
	for a in ACCOUNTS:
		doc = frappe.get_doc("User", a["email"]) if frappe.db.exists("User", a["email"]) else frappe.new_doc("User")
		doc.update(
			{
				"doctype": "User",
				"email": a["email"],
				"first_name": a["name"],
				"mobile_no": a["mobile"],
				"send_welcome_email": 0,
				"language": "vi",
				"enabled": 1,
			}
		)
		doc.new_password = PASSWORD
		doc.flags.ignore_permissions = True
		doc.save(ignore_permissions=True)
		existing = set(frappe.get_roles(a["email"]))
		add = [r for r in a["roles"] if r not in existing]
		if add:
			doc.add_roles(*add)
		print(f"  {a['email']}: roles={a['roles']} mobile={a['mobile']} lang=vi pwd={PASSWORD}")

	# Counter users get the POS Awesome setup (Sales User + POS Profile enrollment); shipper stays mobile-only.
	try:
		from cago.setup.pos_profile_minimal import enroll_users

		enroll_users(users=[u for u in COUNTER_USERS if frappe.db.exists("User", u)])
	except Exception as e:
		print("  (POS enroll skipped:", e, ")")

	try:
		from frappe.utils.password import update_password

		update_password("Administrator", ADMIN_PASSWORD)
		print(f"  Administrator: pwd={ADMIN_PASSWORD}")
	except Exception as e:
		print("  (admin password skipped:", e, ")")

	frappe.db.commit()
	print("Test accounts ensured.")
