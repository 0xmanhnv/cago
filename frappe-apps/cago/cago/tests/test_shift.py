# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Till shift (mở/đóng ca + đếm két): per-cashier cash reconciliation.

Run: bench --site <site> run-tests --app cago --module cago.tests.test_shift
"""

import json

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt

ITEM = "CAM-GA-CON-25KG"


class TestTillShift(FrappeTestCase):
	def setUp(self):
		if not frappe.db.exists("Item", ITEM):
			self.skipTest("sample item missing")
		from cago.setup.company import ensure_payment_modes

		ensure_payment_modes()
		# Start from no open shift for the test user so open_shift doesn't trip the one-at-a-time guard.
		for n in frappe.get_all("Cago Till Shift", filters={"cashier": frappe.session.user, "status": "Open"}, pluck="name"):
			d = frappe.get_doc("Cago Till Shift", n)
			d.status = "Closed"
			d.save(ignore_permissions=True)
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None

	def tearDown(self):
		frappe.db.commit = self._commit

	def test_cash_sale_attributed_to_cashier_and_reconciles(self):
		from cago.api import purchasing, sales, shift

		purchasing.receive_stock(ITEM, 10)

		opened = shift.open_shift(opening_cash=500000)
		self.assertTrue(opened["open"])

		r = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), "cash")
		# the real cashier is stamped even though the invoice posts under Administrator
		self.assertEqual(frappe.db.get_value("Sales Invoice", r["invoice"], "cago_cashier"), frappe.session.user)

		cur = shift.current_shift()
		self.assertAlmostEqual(cur["cash_sales"], flt(r["total"]), places=2)
		self.assertAlmostEqual(cur["expected"], 500000 + flt(r["total"]), places=2)

		# count exactly the expected -> drawer matches, zero difference
		closed = shift.close_shift(counted_cash=cur["expected"], payouts=0)
		self.assertFalse(closed["open"])
		self.assertTrue(closed["match"])
		self.assertAlmostEqual(closed["diff"], 0, places=2)

	def test_return_and_change_net_out_of_drawer_cash(self):
		"""A refund must subtract from the cashier's drawer (return_sale stamps cago_cashier), and
		overpaid cash must net out the change handed back — otherwise reconciliation drifts."""
		from cago.api import purchasing, sales, shift

		purchasing.receive_stock(ITEM, 10)
		opened = shift.open_shift(opening_cash=0)
		since = frappe.db.get_value("Cago Till Shift", opened["name"], "opened_at")

		# cash sale then full return -> net cash 0
		r = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), "cash")
		ret = sales.return_sale(r["invoice"])
		self.assertEqual(frappe.db.get_value("Sales Invoice", ret["return_invoice"], "cago_cashier"), frappe.session.user)
		self.assertAlmostEqual(shift._cashier_cash_sales(frappe.session.user, since), 0, places=2)

		# split overpay (tender 20000 over) -> drawer holds grand_total, not the tendered amount
		total = flt(r["total"])
		sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), payments=json.dumps([{"mode": "cash", "amount": total + 20000}]))
		self.assertAlmostEqual(shift._cashier_cash_sales(frappe.session.user, since), total, places=2)

	def test_shortfall_shows_negative_difference(self):
		from cago.api import purchasing, sales, shift

		purchasing.receive_stock(ITEM, 10)
		shift.open_shift(opening_cash=0)
		r = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), "cash")
		# count 1000 short -> difference is negative (thiếu)
		closed = shift.close_shift(counted_cash=flt(r["total"]) - 1000, payouts=0)
		self.assertFalse(closed["match"])
		self.assertFalse(closed["over"])
		self.assertAlmostEqual(closed["diff"], -1000, places=2)
