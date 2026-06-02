# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Supplier payables (công nợ NCC): credit purchase + payment correctness."""

import json

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt

from cago.utils import dto

ITEM = "CAM-GA-CON-25KG"


class TestSupplierDebt(FrappeTestCase):
	def setUp(self):
		if not frappe.db.exists("Item", ITEM):
			self.skipTest("sample item missing")
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None

	def tearDown(self):
		frappe.db.commit = self._commit

	def test_credit_purchase_increases_stock_and_payable(self):
		from cago.api import supplier

		sup = supplier.add_supplier("NCC Test A")["supplier"]
		before_qty = flt(dto.get_actual_qty(ITEM))
		before_owe = supplier.get_supplier_debt(sup)["outstanding"]
		r = supplier.credit_purchase(sup, json.dumps([{"item_code": ITEM, "qty": 5, "rate": 250000}]))
		self.assertTrue(r["invoice"])
		self.assertAlmostEqual(flt(dto.get_actual_qty(ITEM)), before_qty + 5, places=2)
		self.assertGreater(supplier.get_supplier_debt(sup)["outstanding"], before_owe)
		self.assertTrue(
			frappe.db.exists("Stock Ledger Entry", {"voucher_type": "Purchase Invoice", "voucher_no": r["invoice"]})
		)

	def test_pay_reduces_payable(self):
		from cago.api import supplier

		sup = supplier.add_supplier("NCC Test B")["supplier"]
		supplier.credit_purchase(sup, json.dumps([{"item_code": ITEM, "qty": 2, "rate": 100000}]))
		owe1 = supplier.get_supplier_debt(sup)["outstanding"]
		supplier.pay_supplier(sup, 100000)
		self.assertLess(supplier.get_supplier_debt(sup)["outstanding"], owe1)
