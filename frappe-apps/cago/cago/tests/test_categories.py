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

	def test_convert_leaf_to_parent_and_back(self):
		"""WordPress-style: a leaf with no products can become a nhóm cha, and a childless parent can
		go back to a leaf."""
		from cago.api import owner

		owner.save_category("_Cat A", icon="📦")
		self.assertEqual(int(frappe.db.get_value("Item Group", "_Cat A", "is_group") or 0), 0)
		owner.save_category("_Cat A", old_name="_Cat A", is_group=1)  # leaf → nhóm cha
		self.assertEqual(int(frappe.db.get_value("Item Group", "_Cat A", "is_group") or 0), 1)
		owner.save_category("_Cat A", old_name="_Cat A", is_group=0)  # back to leaf (no children)
		self.assertEqual(int(frappe.db.get_value("Item Group", "_Cat A", "is_group") or 0), 0)

	def test_convert_to_parent_refused_when_products_exist(self):
		from cago.api import owner

		# A leaf category that actually holds products (items hang off leaves, is_group=0).
		rows = frappe.get_all("Item", filters={"disabled": 0}, fields=["item_group"], limit=200)
		grp = next((r.item_group for r in rows if not int(frappe.db.get_value("Item Group", r.item_group, "is_group") or 0)), None)
		if not grp:
			self.skipTest("no leaf category with products")
		with self.assertRaises(frappe.ValidationError):
			owner.save_category(grp, old_name=grp, is_group=1)

	def test_delete_refused_when_products_exist(self):
		from cago.api import owner

		grp = frappe.db.get_value("Item", {"disabled": 0}, "item_group")
		if not grp:
			self.skipTest("no items to occupy a category")
		with self.assertRaises(frappe.ValidationError):
			owner.delete_category(grp)
