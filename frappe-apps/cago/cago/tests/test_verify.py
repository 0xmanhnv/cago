# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Customer kiosk debt verification — flow + privacy guarantees."""

import frappe
from frappe.tests.utils import FrappeTestCase


class TestVerify(FrappeTestCase):
	def setUp(self):
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None
		from cago.api import debt, verify

		frappe.cache().delete_value(verify.STORE)  # isolate cache state per test
		self.company = debt._company()
		self._flag = frappe.db.get_value("Company", self.company, "cago_kiosk_debt_visible")
		frappe.db.set_value("Company", self.company, "cago_kiosk_debt_visible", 1)

	def tearDown(self):
		frappe.db.set_value("Company", self.company, "cago_kiosk_debt_visible", self._flag or 0)
		frappe.db.commit = self._commit

	def test_full_flow_and_no_debt_before_approval(self):
		from cago.api import debt, verify

		cust = debt.add_customer("KH Verify", phone="0987000111")["customer"]
		debt.record_debt(cust, 50000)

		r = verify.request("0987000111")
		self.assertTrue(r["enabled"])
		rid = r["request_id"]

		# before approval: not approved, no token, and my_debt is impossible
		self.assertFalse(verify.status(rid)["approved"])
		with self.assertRaises(frappe.ValidationError):
			verify.my_debt("bogus-token")

		# staff approves → token issued → debt visible (only this customer)
		verify.approve(rid)
		tok = verify.status(rid)["token"]
		self.assertTrue(tok)
		d = verify.my_debt(tok)
		self.assertEqual(d["customer_name"], "KH Verify")
		self.assertGreater(d["outstanding"], 0)

	def test_disabled_by_owner(self):
		from cago.api import verify

		frappe.db.set_value("Company", self.company, "cago_kiosk_debt_visible", 0)
		self.assertFalse(verify.request("0987000111")["enabled"])

	def test_cannot_approve_unknown_phone(self):
		from cago.api import verify

		r = verify.request("0900000000")  # no such customer
		with self.assertRaises(frappe.ValidationError):
			verify.approve(r["request_id"])
