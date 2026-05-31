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


class TestLoyalty(FrappeTestCase):
	def setUp(self):
		if not frappe.db.exists("Item", ITEM):
			self.skipTest("sample item missing")
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None

	def tearDown(self):
		frappe.db.commit = self._commit

	def test_points_accrue_on_credit_sale(self):
		from cago.api import debt, purchasing, sales
		from frappe.utils import flt

		purchasing.receive_stock(ITEM, 10)
		cust = debt.add_customer("KH Diem Test")["customer"]
		sales.credit_sale(cust, json.dumps([{"item_code": ITEM, "qty": 3}]))
		self.assertGreater(flt(frappe.db.get_value("Customer", cust, "cago_points")), 0)


class TestQuickSale(FrappeTestCase):
	"""Cago-native checkout (sales.quick_sale): a paid POS invoice that reduces stock."""

	def setUp(self):
		if not frappe.db.exists("Item", ITEM):
			self.skipTest("sample item missing")
		from cago.setup.company import ensure_payment_modes

		ensure_payment_modes()  # make cash + bank modes available for is_pos
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None

	def tearDown(self):
		frappe.db.commit = self._commit

	def test_cash_sale_is_paid_and_reduces_stock(self):
		from cago.api import purchasing, sales

		purchasing.receive_stock(ITEM, 10)
		before = flt_qty(ITEM)
		r = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 2}]), "cash")

		self.assertTrue(r["invoice"])
		si = frappe.get_doc("Sales Invoice", r["invoice"])
		self.assertEqual(si.docstatus, 1)  # submitted
		self.assertEqual(si.is_pos, 1)
		self.assertAlmostEqual(si.outstanding_amount, 0, places=2)  # fully paid
		self.assertAlmostEqual(flt_qty(ITEM), before - 2, places=2)  # stock down

	def test_bank_sale_records_bank_mode(self):
		from cago.api import purchasing, sales

		purchasing.receive_stock(ITEM, 10)
		r = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), "bank")
		si = frappe.get_doc("Sales Invoice", r["invoice"])
		self.assertEqual(si.docstatus, 1)
		mode = si.payments[0].mode_of_payment
		self.assertEqual(frappe.db.get_value("Mode of Payment", mode, "type"), "Bank")

	def test_bad_payment_mode_rejected(self):
		from cago.api import sales

		with self.assertRaises(frappe.ValidationError):
			sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), "bitcoin")


class TestPosHandoff(FrappeTestCase):
	def setUp(self):
		if not frappe.db.exists("Item", ITEM):
			self.skipTest("sample item missing")
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None

	def tearDown(self):
		frappe.db.commit = self._commit

	def test_draft_invoice_from_wanted(self):
		from cago.api import kiosk, pos

		wl = kiosk.create_wanted_list(json.dumps([{"item_code": ITEM, "qty": 2}]))
		r = pos.create_invoice_from_wanted(wl["code"])
		self.assertTrue(r["invoice"])
		si = frappe.get_doc("Sales Invoice", r["invoice"])
		self.assertEqual(si.docstatus, 0)  # DRAFT — staff must confirm/submit
		self.assertEqual(len(si.items), 1)
		self.assertEqual(frappe.db.get_value("Cago Wanted List", {"code": wl["code"]}, "status"), "Processing")
