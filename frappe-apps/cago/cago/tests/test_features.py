# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Tests for the added owner/staff features: exchange, reorder suggestions, debt statement,
unsafe-questions report, daily digest, and the opt-in notify sender (no-op when unconfigured)."""

import json

import frappe
from frappe.tests.utils import FrappeTestCase

ITEM = "CAM-GA-CON-25KG"


class TestFeatures(FrappeTestCase):
	def setUp(self):
		if not frappe.db.exists("Item", ITEM):
			self.skipTest("sample item missing")
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None

	def tearDown(self):
		frappe.db.commit = self._commit

	def test_exchange_nets_return_and_new_sale(self):
		from cago.api import purchasing, sales

		purchasing.receive_stock(ITEM, 20)
		orig = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 2}]), "cash")
		res = sales.exchange_sale(orig["invoice"], json.dumps([{"item_code": ITEM, "qty": 1}]), json.dumps([{"item_code": ITEM, "qty": 1}]), "cash")
		self.assertTrue(res["return_invoice"])
		self.assertTrue(res["sale_invoice"])
		# Returned 1 + bought 1 of the same item at the same price → net ~0 (even).
		self.assertEqual(res["net_direction"], "even")

	def test_reorder_suggestions_runs(self):
		from cago.api import purchasing

		res = purchasing.reorder_suggestions()
		self.assertIsInstance(res, list)  # shape only — depends on reorder levels in the sample data

	def test_customer_statement_text(self):
		from cago.api import debt, purchasing, sales

		purchasing.receive_stock(ITEM, 10)
		cust = debt.add_customer("KH Sao Ke")["customer"]
		sales.credit_sale(cust, json.dumps([{"item_code": ITEM, "qty": 2}]))
		st = debt.customer_statement(cust)
		self.assertIn("SAO KÊ CÔNG NỢ", st["statement_text"])
		self.assertIn("HIỆN CÒN NỢ", st["statement_text"])

	def test_notify_is_noop_when_unconfigured(self):
		from cago.api import notify

		# No webhook configured in the test site → send must report not-sent, never raise.
		self.assertFalse(notify.is_configured())
		self.assertFalse(notify.send_message("0987654321", "test")["sent"])

	def test_unsafe_questions_shape(self):
		from cago.api import reports

		self.assertIsInstance(reports.unsafe_questions(days=7), list)

	def test_daily_digest_text_is_safe(self):
		from cago.api import alerts

		# Should return a string (possibly empty) and never raise even with no owner phone.
		self.assertIsInstance(alerts.digest_text(), str)
