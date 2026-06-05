# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Zalo customer login → Customer linking + the lead trust tier: a self-registered customer can
browse/order/pay cash but must NOT get goods on credit until the owner verifies them. See
cago.api.zalo + cago.api.debt.ensure_not_unverified."""

import frappe
from frappe.tests.utils import FrappeTestCase

from cago.api import debt, zalo


# Distinctive, test-only phones/ids so a persistent dev site's other data can't collide.
_PHONES = ("0988770001", "0988770002", "0988770003")
_ZIDS = ("cagoztest-aaa", "cagoztest-bbb", "cagoztest-ccc")
_EXISTING_NAME = "_CagoZaloTest Khách Cũ"


class TestZaloCustomerLink(FrappeTestCase):
	def setUp(self):
		self._purge()

	def tearDown(self):
		self._purge()

	def _purge(self):
		"""Remove any test customers by phone OR zalo id (the dev site is persistent — don't let a
		leftover from a prior run collide)."""
		names = set()
		for f in ("mobile_no", "cago_zalo_phone"):
			for p in _PHONES:
				names |= set(frappe.get_all("Customer", filters={f: p}, pluck="name"))
		for z in _ZIDS:
			names |= set(frappe.get_all("Customer", filters={"cago_zalo_id": z}, pluck="name"))
		names |= set(frappe.get_all("Customer", filters={"customer_name": ["like", _EXISTING_NAME + "%"]}, pluck="name"))
		for name in names:
			frappe.delete_doc("Customer", name, force=1, ignore_permissions=True)

	def test_link_creates_unverified_lead(self):
		name = zalo.link_customer(_PHONES[0], zalo_id=_ZIDS[0], name="Cô Test Zalo")
		self.assertTrue(frappe.db.get_value("Customer", name, "cago_unverified"))
		self.assertEqual(frappe.db.get_value("Customer", name, "cago_zalo_id"), _ZIDS[0])

	def test_link_existing_by_phone_attaches_zalo_not_new_lead(self):
		# a real (owner-created) customer already exists, not a lead
		existing = frappe.get_doc({"doctype": "Customer", "customer_name": _EXISTING_NAME, "customer_type": "Individual", "mobile_no": _PHONES[1]})
		g = frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
		t = frappe.db.get_value("Territory", {"is_group": 0}, "name")
		if g:
			existing.customer_group = g
		if t:
			existing.territory = t
		existing.insert(ignore_permissions=True)
		linked = zalo.link_customer(_PHONES[1], zalo_id=_ZIDS[1])
		self.assertEqual(linked, existing.name)  # reused, not a new lead
		self.assertEqual(frappe.db.get_value("Customer", existing.name, "cago_zalo_id"), _ZIDS[1])
		self.assertFalse(frappe.db.get_value("Customer", existing.name, "cago_unverified"))

	def test_lead_blocked_from_credit_then_allowed_after_verify(self):
		name = zalo.link_customer(_PHONES[2], zalo_id=_ZIDS[2], name="Lead Test")
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.ValidationError):
			debt.record_debt(name, 10000)  # lead → blocked
		debt.verify_customer(name)  # owner verifies
		self.assertFalse(frappe.db.get_value("Customer", name, "cago_unverified"))
		debt.record_debt(name, 10000)  # now allowed
		self.assertGreater(flt_outstanding(name), 0)


def flt_outstanding(customer):
	from frappe.utils import flt

	return flt(debt.get_customer_debt(customer)["outstanding"])
