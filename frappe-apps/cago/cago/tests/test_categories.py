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
		# Clear child links first so the parent isn't blocked by a cago_parent reference, then delete
		# children before parents.
		for n in ("_Cat B", "_Cat A"):
			if frappe.db.exists("Item Group", n):
				frappe.db.set_value("Item Group", n, "cago_parent", None, update_modified=False)
		for n in ("_Cat B", "_Cat A"):
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

	def test_set_parent_flat_model(self):
		"""Flat WordPress-style model: every category is a leaf (is_group=0) that can have a loại cha
		via cago_parent; a top-level category can itself hold products AND be a parent."""
		from cago.api import owner

		owner.save_category("_Cat A", icon="📦")  # top-level
		owner.save_category("_Cat B", icon="📦", parent="_Cat A")  # child of A
		self.assertEqual(int(frappe.db.get_value("Item Group", "_Cat A", "is_group") or 0), 0)
		self.assertEqual(int(frappe.db.get_value("Item Group", "_Cat B", "is_group") or 0), 0)
		self.assertEqual(frappe.db.get_value("Item Group", "_Cat B", "cago_parent"), "_Cat A")
		# A parent's subtree (for product aggregation) = itself + its children.
		from cago.setup.category_tree import subtree_of

		self.assertEqual(set(subtree_of("_Cat A")), {"_Cat A", "_Cat B"})

	def test_rename_parent_keeps_children_linked(self):
		"""Renaming a parent must carry its children's cago_parent (links are by docname)."""
		from cago.api import owner

		owner.save_category("_Cat A", icon="📦")
		owner.save_category("_Cat B", icon="📦", parent="_Cat A")
		owner.save_category("_Cat A2", old_name="_Cat A")  # rename the parent
		self.assertTrue(frappe.db.exists("Item Group", "_Cat A2"))
		self.assertEqual(frappe.db.get_value("Item Group", "_Cat B", "cago_parent"), "_Cat A2")
		# cleanup alias
		frappe.db.set_value("Item Group", "_Cat B", "cago_parent", None, update_modified=False)
		frappe.delete_doc("Item Group", "_Cat B", ignore_permissions=True, force=True)
		frappe.delete_doc("Item Group", "_Cat A2", ignore_permissions=True, force=True)

	def test_two_level_only(self):
		"""Reject 3-level nesting: a category that is already a parent can't be given a parent, and a
		child can't be chosen as someone's parent."""
		from cago.api import owner

		owner.save_category("_Cat A", icon="📦")
		owner.save_category("_Cat B", icon="📦", parent="_Cat A")  # B is a child of A
		# A is a parent (has child B) → can't become a child itself.
		with self.assertRaises(frappe.ValidationError):
			owner.save_category("_Cat A", old_name="_Cat A", parent="_Cat B")

	def test_delete_parent_frees_children_and_moves_own_products(self):
		"""WordPress-style delete: children become top-level; the deleted category's products move to
		its parent (child) or to 'Chưa phân loại' (top-level). Nothing is orphaned."""
		from cago.api import owner

		owner.save_category("_Cat A", icon="📦")  # top-level parent
		owner.save_category("_Cat B", icon="📦", parent="_Cat A")  # child
		owner.delete_category("_Cat A")
		# Child B is now top-level (parent cleared), and A is gone.
		self.assertFalse(frappe.db.exists("Item Group", "_Cat A"))
		self.assertIsNone(frappe.db.get_value("Item Group", "_Cat B", "cago_parent"))

	def test_delete_child_folds_products_into_parent(self):
		from cago.api import owner

		owner.save_category("_Cat A", icon="📦")
		owner.save_category("_Cat B", icon="📦", parent="_Cat A")
		# Park a real item under the child, then delete the child → item should fold up into _Cat A.
		item = frappe.db.get_value("Item", {"disabled": 0}, "name")
		if not item:
			self.skipTest("no item to reassign")
		orig = frappe.db.get_value("Item", item, "item_group")
		frappe.db.set_value("Item", item, "item_group", "_Cat B")
		owner.delete_category("_Cat B")
		self.assertEqual(frappe.db.get_value("Item", item, "item_group"), "_Cat A")
		frappe.db.set_value("Item", item, "item_group", orig)  # restore

	def test_uncategorized_cannot_be_deleted(self):
		from cago.api import owner

		owner._ensure_uncategorized()
		with self.assertRaises(frappe.ValidationError):
			owner.delete_category(owner.UNCATEGORIZED)
