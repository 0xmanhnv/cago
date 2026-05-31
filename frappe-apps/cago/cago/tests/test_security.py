# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Security assurance: rate limiting, role enforcement, search robustness.

Run: bench --site <site> run-tests --app cago --module cago.tests.test_security
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from cago.api import kiosk

NONBATCH_ITEM = "CAM-GA-CON-25KG"


class TestRateLimit(FrappeTestCase):
	def test_blocks_over_limit(self):
		from cago.utils.ratelimit import rate_guard

		bucket = "test_" + frappe.generate_hash()[:8]
		rate_guard(bucket, 2, 60)
		rate_guard(bucket, 2, 60)
		with self.assertRaises(frappe.ValidationError):
			rate_guard(bucket, 2, 60)


class TestPermissions(FrappeTestCase):
	def test_guest_blocked_on_owner_staff_apis(self):
		from cago.api import debt, owner, purchasing, reports, units

		frappe.set_user("Guest")
		try:
			checks = [
				(owner.search_products, {"query": "x"}),
				(reports.debt_list, {}),
				(reports.gross_profit, {}),
				(debt.search_customers, {"query": "x"}),
				(units.get_units, {"item_code": NONBATCH_ITEM}),
				(purchasing.get_stock, {"item_code": NONBATCH_ITEM}),
			]
			for fn, kw in checks:
				with self.assertRaises(frappe.PermissionError):
					fn(**kw)
		finally:
			frappe.set_user("Administrator")


class TestSearchFuzz(FrappeTestCase):
	BAD = [
		"",
		"a" * 500,
		"'; DROP TABLE `tabItem`; --",
		"<script>alert(1)</script>",
		"🐔🌾",
		"%_%",
		"x' OR '1'='1",
	]

	def test_no_crash_returns_list(self):
		for q in self.BAD:
			res = kiosk.list_products(query=q)
			self.assertIsInstance(res, list)  # parameterized → never errors/injects

	def test_table_not_dropped_by_injection(self):
		self.assertTrue(frappe.db.exists("Item", NONBATCH_ITEM))
