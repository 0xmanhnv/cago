# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Chức danh (Cago Job Role) → capability compilation.

Run: bench --site <site> run-tests --app cago --module cago.tests.test_staff_admin
"""

import json

import frappe
from frappe.tests.utils import FrappeTestCase

from cago.utils import permissions

USER = "_test_cago_jr@example.com"


class TestJobRoles(FrappeTestCase):
	def setUp(self):
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None  # keep test in one transaction
		if not frappe.db.exists("User", USER):
			frappe.get_doc({"doctype": "User", "email": USER, "first_name": "JR Test", "send_welcome_email": 0}).insert(ignore_permissions=True)
		# Clean slate so each test is independent: drop the user's assignments, then any _Test roles.
		u = frappe.get_doc("User", USER)
		u.set("cago_job_roles", [])
		u.save(ignore_permissions=True)
		for jr in frappe.get_all("Cago Job Role", filters={"name": ["like", "_Test%"]}, pluck="name"):
			frappe.delete_doc("Cago Job Role", jr, ignore_permissions=True, force=True)

	def tearDown(self):
		frappe.db.commit = self._commit

	def _caps(self):
		return set(permissions.caps_for_user_roles(frappe.get_roles(USER)))

	def test_assign_compiles_union(self):
		from cago.api import staff_admin

		staff_admin.save_job_role(title="_Test Thu ngân", caps=json.dumps(["sell", "returns"]))
		staff_admin.save_staff(USER, json.dumps(["_Test Thu ngân"]))
		self.assertEqual(self._caps(), {"sell", "returns"})

	def test_two_roles_union(self):
		from cago.api import staff_admin

		staff_admin.save_job_role(title="_Test A", caps=json.dumps(["sell"]))
		staff_admin.save_job_role(title="_Test B", caps=json.dumps(["debt"]))
		staff_admin.save_staff(USER, json.dumps(["_Test A", "_Test B"]))
		self.assertEqual(self._caps(), {"sell", "debt", "debt_view"})  # debt implies debt_view

	def test_edit_role_propagates_to_member(self):
		from cago.api import staff_admin

		staff_admin.save_job_role(title="_Test Thu ngân", caps=json.dumps(["sell", "returns"]))
		staff_admin.save_staff(USER, json.dumps(["_Test Thu ngân"]))
		# Add a capability to the role → the member gains it automatically.
		staff_admin.save_job_role(name="_Test Thu ngân", title="_Test Thu ngân", caps=json.dumps(["sell", "returns", "reports"]))
		self.assertIn("reports", self._caps())

	def test_delete_in_use_blocked(self):
		from cago.api import staff_admin

		staff_admin.save_job_role(title="_Test C", caps=json.dumps(["sell"]))
		staff_admin.save_staff(USER, json.dumps(["_Test C"]))
		with self.assertRaises(frappe.ValidationError):
			staff_admin.delete_job_role("_Test C")

	def test_debt_view_is_read_only(self):
		"""debt_view can read the debt list but not collect; debt (write) implies debt_view."""
		from cago.api import debt as debt_api
		from cago.api import staff_admin

		staff_admin.save_job_role(title="_Test Xem nợ", caps=json.dumps(["debt_view"]))
		staff_admin.save_staff(USER, json.dumps(["_Test Xem nợ"]))
		self.assertEqual(self._caps(), {"debt_view"})
		frappe.set_user(USER)
		try:
			debt_api.search_customers()  # read → allowed, no raise
			with self.assertRaises(frappe.PermissionError):
				debt_api.record_repayment("whoever", 1000)  # write → blocked
		finally:
			frappe.set_user("Administrator")

	def test_debt_write_implies_view(self):
		from cago.api import staff_admin

		staff_admin.save_job_role(title="_Test Thu nợ", caps=json.dumps(["debt"]))
		staff_admin.save_staff(USER, json.dumps(["_Test Thu nợ"]))
		self.assertEqual(self._caps(), {"debt", "debt_view"})  # write implies read
