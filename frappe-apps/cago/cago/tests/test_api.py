# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Unit tests for the cago API/DTO/permission layer.

Run: bench --site <site> run-tests --app cago
Covers the security-critical invariants (field hiding, role guards), the chemical
safety rule, and the audience shape of list DTOs. Write paths that commit (debt,
wanted list) are exercised by the live diagnostics, not here, to keep tests
transaction-isolated.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from cago.utils import dto, permissions
from cago.utils.safety import STANDARD_SAFETY_WARNING, safety_warning_for

CHEM = "_TEST CAGO CHEM"
PLAIN = "_TEST CAGO PLAIN"
SENSITIVE = ("valuation", "buying", "last_purchase", "margin", "profit", "cost", "standard_rate")


def _ensure_item(code, chemical):
	if frappe.db.exists("Item", code):
		return
	group = frappe.db.get_value("Item Group", {"is_group": 0}, "name") or "All Item Groups"
	uom = frappe.db.get_value("UOM", {}, "name") or "Nos"
	frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": code,
			"item_name": code,
			"item_group": group,
			"stock_uom": uom,
			"is_stock_item": 1,
			"cago_display_name": code,
			"cago_is_chemical": 1 if chemical else 0,
			"cago_is_public_visible": 1,
			"cago_safety_notes": "ghi chú" if chemical else "",
			"cago_shelf_location": "Kệ A",
			"cago_staff_advice": "tư vấn",
		}
	).insert(ignore_permissions=True)


class TestCagoDTO(FrappeTestCase):
	def setUp(self):
		_ensure_item(CHEM, True)
		_ensure_item(PLAIN, False)

	def _no_sensitive(self, d):
		leaked = [k for k in d if any(s in k.lower() for s in SENSITIVE)]
		self.assertEqual(leaked, [], f"DTO leaks sensitive keys: {leaked}")

	def test_public_dto_hides_internal_and_sensitive(self):
		pub = dto.public_dto(frappe.get_doc("Item", PLAIN))
		self._no_sensitive(pub)
		for hidden in ("selling_price", "shelf_location", "staff_advice", "actual_stock_qty"):
			self.assertNotIn(hidden, pub)

	def test_staff_dto_has_selling_price_but_no_buying(self):
		sd = dto.staff_dto(frappe.get_doc("Item", CHEM))
		self._no_sensitive(sd)
		self.assertIn("selling_price", sd)
		self.assertEqual(sd["shelf_location"], "Kệ A")

	def test_chemical_always_shows_warning(self):
		warn = safety_warning_for(frappe.get_doc("Item", CHEM))
		self.assertIn(STANDARD_SAFETY_WARNING, warn)

	def test_non_chemical_has_no_warning(self):
		self.assertEqual(safety_warning_for(frappe.get_doc("Item", PLAIN)), "")

	def test_list_dto_audience_shape(self):
		pub = dto.list_dtos("", audience="public", public_only=True)
		staff = dto.list_dtos("", audience="staff")
		self.assertTrue(pub and staff)
		for d in pub:
			self.assertNotIn("shelf_location", d)
			self.assertNotIn("selling_price", d)
			self._no_sensitive(d)
		for d in staff:
			self.assertIn("shelf_location", d)


class TestCagoCapabilities(FrappeTestCase):
	"""Granular capability roles: a user only gets what they're granted; owner gets everything."""

	def setUp(self):
		self.sell_email = "_test_cago_sell@example.com"
		if not frappe.db.exists("User", self.sell_email):
			frappe.get_doc(
				{"doctype": "User", "email": self.sell_email, "first_name": "Sell Only", "send_welcome_email": 0}
			).insert(ignore_permissions=True)
		frappe.get_doc("User", self.sell_email).add_roles("Cago Sell")

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_sell_only_user_has_just_sell(self):
		frappe.set_user(self.sell_email)
		self.assertFalse(permissions.is_owner())
		self.assertTrue(permissions.is_internal())  # holds a capability → back-of-house
		self.assertTrue(permissions.has_cap("sell"))
		permissions.ensure_cap("sell")  # no raise
		for cap in ("reports", "products", "stock", "settings", "supplier", "cash", "debt", "returns"):
			self.assertFalse(permissions.has_cap(cap), cap)
			with self.assertRaises(frappe.PermissionError):
				permissions.ensure_cap(cap)
		with self.assertRaises(frappe.PermissionError):
			permissions.ensure_owner()

	def test_owner_has_every_capability(self):
		# Administrator (System Manager) is treated as owner → all caps.
		self.assertTrue(permissions.is_owner())
		for cap in permissions.CAP_ROLES:
			self.assertTrue(permissions.has_cap(cap), cap)
		self.assertEqual(set(permissions.caps_for_user()), set(permissions.CAP_ROLES))

	def test_sell_only_blocked_from_other_capability_endpoints(self):
		from cago.api import owner, purchasing, reports

		frappe.set_user(self.sell_email)
		with self.assertRaises(frappe.PermissionError):
			owner.update_price("_whatever", 1000)  # needs 'products'
		with self.assertRaises(frappe.PermissionError):
			reports.period_summary()  # needs 'reports'
		with self.assertRaises(frappe.PermissionError):
			purchasing.receive_stock("_whatever", 1)  # needs 'stock'
