# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Coupon redemption (mã giảm giá): the usage cap must hold.

Run: bench --site <site> run-tests --app cago --module cago.tests.test_coupon
"""

import frappe
from frappe.tests.utils import FrappeTestCase

CODE = "TEST-CAP-1"


class TestCouponCap(FrappeTestCase):
	def setUp(self):
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None
		if frappe.db.exists("Cago Coupon", CODE):
			frappe.delete_doc("Cago Coupon", CODE, ignore_permissions=True, force=True)
		frappe.get_doc(
			{
				"doctype": "Cago Coupon",
				"coupon_code": CODE,
				"discount_type": "Amount",
				"discount_value": 1000,
				"max_uses": 1,
				"used_count": 0,
				"is_active": 1,
			}
		).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.db.commit = self._commit
		if frappe.db.exists("Cago Coupon", CODE):
			frappe.delete_doc("Cago Coupon", CODE, ignore_permissions=True, force=True)

	def test_redeem_respects_max_uses(self):
		"""A 1-use code redeems once; the guarded atomic increment rejects the second redemption
		(so two sales can't both consume the last use)."""
		from cago.api import coupon

		code, disc = coupon.redeem(CODE, 50000)
		self.assertEqual(disc, 1000)
		self.assertEqual(frappe.db.get_value("Cago Coupon", CODE, "used_count"), 1)
		with self.assertRaises(frappe.ValidationError):
			coupon.redeem(CODE, 50000)
		# The cap held — count did not go past max_uses.
		self.assertEqual(frappe.db.get_value("Cago Coupon", CODE, "used_count"), 1)
