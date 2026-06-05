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


class TestCouponValidation(FrappeTestCase):
	"""Every _validate gate: inactive / expired / not-yet-valid / min-order / percent / unknown."""

	def setUp(self):
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None
		self._codes = []

	def tearDown(self):
		frappe.db.commit = self._commit
		for c in self._codes:
			if frappe.db.exists("Cago Coupon", c):
				frappe.delete_doc("Cago Coupon", c, ignore_permissions=True, force=True)

	def _make(self, code, **kw):
		if frappe.db.exists("Cago Coupon", code):
			frappe.delete_doc("Cago Coupon", code, ignore_permissions=True, force=True)
		doc = {
			"doctype": "Cago Coupon",
			"coupon_code": code,
			"discount_type": kw.get("discount_type", "Amount"),
			"discount_value": kw.get("discount_value", 1000),
			"max_uses": kw.get("max_uses", 0),
			"used_count": 0,
			"is_active": kw.get("is_active", 1),
		}
		for f in ("valid_from", "valid_to", "min_order_amount"):
			if f in kw:
				doc[f] = kw[f]
		frappe.get_doc(doc).insert(ignore_permissions=True)
		self._codes.append(code)
		return code

	def test_unknown_code_rejected(self):
		from cago.api import coupon

		with self.assertRaises(frappe.ValidationError):
			coupon._validate("T-NOPE-XYZ", 50000)

	def test_inactive_rejected(self):
		from cago.api import coupon

		self._make("T-INACT", is_active=0)
		with self.assertRaises(frappe.ValidationError):
			coupon._validate("T-INACT", 50000)

	def test_expired_rejected(self):
		from cago.api import coupon
		from frappe.utils import add_days, nowdate

		self._make("T-EXP", valid_to=add_days(nowdate(), -1))
		with self.assertRaises(frappe.ValidationError):
			coupon._validate("T-EXP", 50000)

	def test_not_yet_valid_rejected(self):
		from cago.api import coupon
		from frappe.utils import add_days, nowdate

		self._make("T-FUT", valid_from=add_days(nowdate(), 1))
		with self.assertRaises(frappe.ValidationError):
			coupon._validate("T-FUT", 50000)

	def test_min_order_enforced(self):
		from cago.api import coupon

		self._make("T-MIN", min_order_amount=100000)
		with self.assertRaises(frappe.ValidationError):
			coupon._validate("T-MIN", 50000)  # below minimum
		_, disc = coupon._validate("T-MIN", 100000)  # at minimum → ok
		self.assertEqual(disc, 1000)

	def test_percent_discount_computed(self):
		from cago.api import coupon

		self._make("T-PCT", discount_type="Percent", discount_value=10)
		_, disc = coupon._validate("T-PCT", 50000)
		self.assertEqual(disc, 5000)  # 10% of 50.000

	def test_amount_coupon_rounded_to_vnd(self):
		from cago.api import coupon

		self._make("T-AMT", discount_type="Amount", discount_value=1500.7)
		_, disc = coupon._validate("T-AMT", 50000)
		self.assertEqual(disc, 1501)  # VND has no sub-unit → rounded whole
