# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Credit sale (bán chịu trừ tồn): stock + accounting correctness.

Run: bench --site <site> run-tests --app cago --module cago.tests.test_sales
"""

import json

import frappe
from frappe.tests.utils import FrappeTestCase

from cago.utils import dto

ITEM = "CAM-GA-CON-25KG"


class TestCreditSale(FrappeTestCase):
	def setUp(self):
		if not frappe.db.exists("Item", ITEM):
			self.skipTest("sample item missing")
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None

	def tearDown(self):
		frappe.db.commit = self._commit

	def test_credit_sale_reduces_stock_and_raises_receivable(self):
		from cago.api import debt, purchasing, sales

		purchasing.receive_stock(ITEM, 10)  # ensure stock on hand
		before_qty = flt_qty(ITEM)
		cust = debt.add_customer("KH Ban Chiu Test")["customer"]
		before_debt = debt.get_customer_debt(cust)["outstanding"]

		r = sales.credit_sale(cust, json.dumps([{"item_code": ITEM, "qty": 2}]))

		self.assertTrue(r["invoice"])
		self.assertGreater(r["total"], 0)
		# stock decreased by 2 (stock unit)
		self.assertAlmostEqual(flt_qty(ITEM), before_qty - 2, places=2)
		# receivable increased (customer now owes)
		self.assertGreater(debt.get_customer_debt(cust)["outstanding"], before_debt)
		# a Stock Ledger Entry was posted for this invoice
		self.assertTrue(
			frappe.db.exists("Stock Ledger Entry", {"voucher_type": "Sales Invoice", "voucher_no": r["invoice"]})
		)


def flt_qty(item_code):
	from frappe.utils import flt

	return flt(dto.get_actual_qty(item_code))
