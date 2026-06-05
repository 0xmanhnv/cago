# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Tests for the role tiers: Admin ⊇ Owner ⊇ Staff (cago.utils.permissions)."""

from frappe.tests.utils import FrappeTestCase

from cago.utils import permissions as p


class TestRoleTiers(FrappeTestCase):
	def test_admin_roles(self):
		self.assertTrue(p.is_admin_roles({"Cago Admin"}))
		self.assertTrue(p.is_admin_roles({"System Manager"}))
		self.assertFalse(p.is_admin_roles({"Cago Owner"}))  # owner is NOT admin
		self.assertFalse(p.is_admin_roles({"Cago Sell"}))

	def test_admin_is_also_owner(self):
		# Admin ⊇ Owner: an admin (or System Manager) passes the owner check too.
		self.assertTrue(p.is_owner_roles({"Cago Admin"}))
		self.assertTrue(p.is_owner_roles({"System Manager"}))
		self.assertTrue(p.is_owner_roles({"Cago Owner"}))
		self.assertFalse(p.is_owner_roles({"Cago Sell"}))

	def test_caps_owner_and_admin_get_all(self):
		allcaps = set(p.CAP_ROLES.keys())
		self.assertEqual(p.caps_for_user_roles({"Cago Owner"}), allcaps)
		self.assertEqual(p.caps_for_user_roles({"Cago Admin"}), allcaps)

	def test_caps_staff_scoped(self):
		self.assertEqual(p.caps_for_user_roles({"Cago Sell"}), {"sell"})
		# write debt implies read debt_view
		self.assertEqual(p.caps_for_user_roles({"Cago Debt"}), {"debt", "debt_view"})
