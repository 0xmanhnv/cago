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

	def test_points_reverse_exactly_even_if_rate_changes(self):
		from cago.api import debt, purchasing, sales
		from frappe.utils import flt

		purchasing.receive_stock(ITEM, 10)
		cust = debt.add_customer("KH Diem Reverse")["customer"]
		before = flt(frappe.db.get_value("Customer", cust, "cago_points"))
		r = sales.credit_sale(cust, json.dumps([{"item_code": ITEM, "qty": 2}]))
		after_accrue = flt(frappe.db.get_value("Customer", cust, "cago_points"))
		self.assertGreater(after_accrue, before)
		# Change the loyalty rate, then cancel — reversal must use the awarded count, not recompute.
		frappe.conf["cago_loyalty_vnd_per_point"] = 1  # would massively inflate a recompute
		try:
			frappe.get_doc("Sales Invoice", r["invoice"]).cancel()
		finally:
			frappe.conf.pop("cago_loyalty_vnd_per_point", None)
		self.assertEqual(flt(frappe.db.get_value("Customer", cust, "cago_points")), before)


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

	def test_price_override_only_when_owner_enables_it(self):
		"""Mặc cả: a per-line rate is honoured ONLY when cago_allow_price_edit is on; otherwise
		the price-list rate stands (client cannot bargain a price the owner hasn't allowed)."""
		from cago.api import debt, purchasing, sales

		purchasing.receive_stock(ITEM, 10)
		company = debt._company()
		base = sales._rate_for_uom(ITEM, frappe.db.get_value("Item", ITEM, "stock_uom"), frappe.db.get_value("Item", ITEM, "stock_uom"))

		# OFF: override ignored
		frappe.db.set_value("Company", company, "cago_allow_price_edit", 0)
		r_off = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1, "rate": 1}]), "cash")
		self.assertAlmostEqual(frappe.get_doc("Sales Invoice", r_off["invoice"]).items[0].rate, base, places=2)

		# ON: override honoured
		frappe.db.set_value("Company", company, "cago_allow_price_edit", 1)
		r_on = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1, "rate": 1234}]), "cash")
		self.assertAlmostEqual(frappe.get_doc("Sales Invoice", r_on["invoice"]).items[0].rate, 1234, places=2)

		frappe.db.set_value("Company", company, "cago_allow_price_edit", 0)

	def test_oversell_is_blocked_with_friendly_message(self):
		from cago.api import purchasing, sales

		purchasing.receive_stock(ITEM, 10)
		on_hand = flt_qty(ITEM)
		with self.assertRaises(frappe.ValidationError):
			sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": on_hand + 100}]), "cash")

	def test_credit_at_till_reduces_stock_and_raises_debt(self):
		from cago.api import debt, purchasing, sales

		purchasing.receive_stock(ITEM, 10)
		before = flt_qty(ITEM)
		cust = debt.add_customer("KH Quay Credit")["customer"]
		r = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 2}]), "credit", cust)
		self.assertEqual(r["payment_mode"], "credit")
		si = frappe.get_doc("Sales Invoice", r["invoice"])
		self.assertEqual(si.docstatus, 1)
		self.assertEqual(si.is_pos, 0)  # credit = unpaid, non-pos
		self.assertGreater(si.outstanding_amount, 0)
		self.assertAlmostEqual(flt_qty(ITEM), before - 2, places=2)

	def test_credit_requires_real_customer(self):
		from cago.api import sales

		with self.assertRaises(frappe.ValidationError):
			sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), "credit", None)

	def test_sell_zero_valuation_item(self):
		"""An item received with no cost (zero valuation) must still be sellable
		(COGS=0), not blocked by 'Allow Zero Valuation Rate not enabled'."""
		from cago.api import purchasing, sales

		code = "CAGO-ZEROVAL-TEST"
		if not frappe.db.exists("Item", code):
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": code,
					"item_name": "Zero val test",
					"item_group": frappe.db.get_value("Item Group", {"is_group": 0}, "name"),
					"stock_uom": "Nos",
					"is_stock_item": 1,
				}
			).insert(ignore_permissions=True)
		purchasing.receive_stock(code, 5)  # no cost_rate -> zero valuation
		r = sales.quick_sale(json.dumps([{"item_code": code, "qty": 1}]), "cash")
		self.assertEqual(frappe.get_doc("Sales Invoice", r["invoice"]).docstatus, 1)


class TestReturnsAndAdjust(FrappeTestCase):
	def setUp(self):
		if not frappe.db.exists("Item", ITEM):
			self.skipTest("sample item missing")
		from cago.setup.company import ensure_payment_modes

		ensure_payment_modes()
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None

	def tearDown(self):
		frappe.db.commit = self._commit

	def test_return_sale_restores_stock(self):
		from cago.api import purchasing, sales

		purchasing.receive_stock(ITEM, 10)
		before = flt_qty(ITEM)
		s = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 2}]), "cash")
		self.assertAlmostEqual(flt_qty(ITEM), before - 2, places=2)
		r = sales.return_sale(s["invoice"])
		self.assertTrue(r["return_invoice"])
		self.assertAlmostEqual(flt_qty(ITEM), before, places=2)  # stock back
		# double return refused
		with self.assertRaises(frappe.ValidationError):
			sales.return_sale(s["invoice"])

	def test_adjust_stock_sets_counted_qty(self):
		from cago.api import purchasing

		purchasing.receive_stock(ITEM, 10)
		r = purchasing.adjust_stock(ITEM, 7)
		self.assertAlmostEqual(r["qty"], 7, places=2)
		self.assertAlmostEqual(flt_qty(ITEM), 7, places=2)


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

	def test_list_wanted_lists_shows_open_orders(self):
		from cago.api import kiosk, staff

		wl = kiosk.create_wanted_list(json.dumps([{"item_code": ITEM, "qty": 2}]))
		codes = [o["code"] for o in staff.list_wanted_lists()]
		self.assertIn(wl["code"], codes)  # a new (open) list is listed without typing a code
