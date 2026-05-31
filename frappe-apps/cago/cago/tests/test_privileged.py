# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""The privileged-elevation helper must not corrupt the caller's web session.

Regression: frappe.set_user() overwrites session.sid + wipes session.data, so the old
set_user/restore pattern silently logged the browser out after any owner/staff submit
(record_debt, quick_sale, receive_stock...). as_user() must restore sid + data.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from cago.utils.privileged import as_user


class TestPrivileged(FrappeTestCase):
	def test_session_sid_and_data_preserved(self):
		frappe.local.session.sid = "real-sid-abc123"
		frappe.local.session.data = frappe._dict({"foo": "bar"})
		actor = frappe.session.user

		inside = {}
		with as_user("Administrator"):
			inside["user"] = frappe.session.user

		self.assertEqual(inside["user"], "Administrator")  # actually elevated
		self.assertEqual(frappe.session.user, actor)  # user restored
		self.assertEqual(frappe.local.session.sid, "real-sid-abc123")  # sid NOT clobbered
		self.assertEqual(frappe.local.session.data.get("foo"), "bar")  # data NOT wiped

	def test_restores_even_on_exception(self):
		frappe.local.session.sid = "sid-xyz"
		actor = frappe.session.user
		with self.assertRaises(ValueError):
			with as_user("Administrator"):
				raise ValueError("boom")
		self.assertEqual(frappe.session.user, actor)
		self.assertEqual(frappe.local.session.sid, "sid-xyz")
