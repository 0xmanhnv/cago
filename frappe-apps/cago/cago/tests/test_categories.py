# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Owner category (nhóm hàng) management: create / rename / restyle / delete + delete guard.

Run: bench --site <site> run-tests --app cago --module cago.tests.test_categories
"""

import frappe
from frappe.tests.utils import FrappeTestCase


class TestCategoryCrud(FrappeTestCase):
	def setUp(self):
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None

	def tearDown(self):
		frappe.db.commit = self._commit
		for n in ("_Cat A", "_Cat B"):
			if frappe.db.exists("Item Group", n):
				frappe.delete_doc("Item Group", n, ignore_permissions=True, force=True)

	def test_create_rename_restyle_delete(self):
		from cago.api import owner

		owner.save_category("_Cat A", icon="🧴", color="#e0f2fe")
		self.assertTrue(frappe.db.exists("Item Group", "_Cat A"))
		self.assertEqual(frappe.db.get_value("Item Group", "_Cat A", "cago_icon"), "🧴")
		# restyle in place
		owner.save_category("_Cat A", icon="💧", color="#e0f2fe")
		self.assertEqual(frappe.db.get_value("Item Group", "_Cat A", "cago_icon"), "💧")
		# rename
		owner.save_category("_Cat B", old_name="_Cat A")
		self.assertFalse(frappe.db.exists("Item Group", "_Cat A"))
		self.assertTrue(frappe.db.exists("Item Group", "_Cat B"))
		# delete (empty → allowed)
		owner.delete_category("_Cat B")
		self.assertFalse(frappe.db.exists("Item Group", "_Cat B"))

	def test_delete_refused_when_products_exist(self):
		from cago.api import owner

		grp = frappe.db.get_value("Item", {"disabled": 0}, "item_group")
		if not grp:
			self.skipTest("no items to occupy a category")
		with self.assertRaises(frappe.ValidationError):
			owner.delete_category(grp)
