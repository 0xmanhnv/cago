# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Credit sale (bán chịu trừ tồn): stock + accounting correctness.

Run: bench --site <site> run-tests --app cago --module cago.tests.test_sales
"""

import json

import frappe
from frappe.tests.utils import FrappeTestCase

from cago.utils import dto

ITEM = "CAM-GA-CON-25KG"


def _seller_user():
	"""A non-owner cashier with the 'sell' capability, for per-staff bargaining tests."""
	email = "_test_cago_seller@example.com"
	if not frappe.db.exists("User", email):
		frappe.get_doc({"doctype": "User", "email": email, "first_name": "Seller", "send_welcome_email": 0}).insert(ignore_permissions=True)
	frappe.get_doc("User", email).add_roles("Cago Sell")
	return email


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

	def test_points_redeemed_discounts_bill_and_deducts(self):
		"""Spending points at the till knocks redeem_value đồng off each, capped by the balance, is
		stamped on the invoice, and is given back on cancel."""
		from cago.api import debt, purchasing, sales
		from cago.loyalty import redeem_value
		from cago.setup.company import ensure_payment_modes
		from frappe.utils import flt

		ensure_payment_modes()
		purchasing.receive_stock(ITEM, 20)
		cust = debt.add_customer("KH Diem Redeem")["customer"]
		# Baseline: identical basket, no redemption — gives us the un-discounted grand total.
		base_si = frappe.get_doc("Sales Invoice", sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 5}]), "cash", customer=cust)["invoice"])
		# Grant points, then redeem MORE than the balance — must clamp to the balance (5).
		frappe.db.set_value("Customer", cust, "cago_points", 5)
		r = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 5}]), "cash", customer=cust, redeem_points=99)
		si = frappe.get_doc("Sales Invoice", r["invoice"])
		self.assertEqual(int(si.cago_points_redeemed or 0), 5)
		self.assertAlmostEqual(flt(si.grand_total), flt(base_si.grand_total) - 5 * redeem_value(), places=2)
		# Balance now = 5 - 5 redeemed + whatever this sale accrued.
		accrued = int(si.cago_points_awarded or 0)
		self.assertEqual(int(flt(frappe.db.get_value("Customer", cust, "cago_points"))), accrued)
		# Cancel restores the 5 redeemed and removes the accrued → back to 5.
		si.cancel()
		self.assertEqual(int(flt(frappe.db.get_value("Customer", cust, "cago_points"))), 5)


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

	def test_quick_sale_idempotent_by_client_uuid(self):
		"""Offline dedup: re-sending a queued sale with the same client_uuid must resolve to the
		SAME invoice (stock reduced once), not book a second one."""
		from cago.api import purchasing, sales

		purchasing.receive_stock(ITEM, 10)
		before = flt_qty(ITEM)
		uuid = frappe.generate_hash(length=20)  # fresh per run → never collides with a prior sale
		r1 = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 2}]), "cash", client_uuid=uuid)
		r2 = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 2}]), "cash", client_uuid=uuid)
		self.assertEqual(r1["invoice"], r2["invoice"])  # same invoice
		self.assertTrue(r2.get("duplicate"))  # second call was a replay, not a new booking
		self.assertAlmostEqual(flt_qty(ITEM), before - 2, places=2)  # stock down ONCE

	def test_quick_sale_posted_at_sets_posting_datetime(self):
		"""An offline sale carries its real ring-up time so it lands in the right till-shift window."""
		from cago.api import purchasing, sales
		from frappe.utils.data import get_time

		purchasing.receive_stock(ITEM, 10)
		r = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), "cash", posted_at="2026-05-30 08:15:00")
		si = frappe.get_doc("Sales Invoice", r["invoice"])
		self.assertEqual(str(si.posting_date), "2026-05-30")
		tt = get_time(str(si.posting_time))
		self.assertEqual((tt.hour, tt.minute), (8, 15))

	def test_quick_sale_posted_at_out_of_range_falls_back_to_today(self):
		"""A forged/stale posted_at (here: years ago) is ignored so it can't back-date the GL/reports."""
		from cago.api import purchasing, sales
		from frappe.utils import nowdate

		purchasing.receive_stock(ITEM, 10)
		r = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), "cash", posted_at="2020-01-01 08:00:00")
		self.assertEqual(str(frappe.get_doc("Sales Invoice", r["invoice"]).posting_date), nowdate())

	def test_live_sale_requires_open_shift(self):
		"""A non-owner cashier can't ring a LIVE sale with no open till shift; opening one unblocks it.
		(The guard is skipped under the test runner, so we exercise it with in_test temporarily off.)"""
		from cago.api import purchasing, sales, shift

		purchasing.receive_stock(ITEM, 10)
		seller = _seller_user()
		frappe.flags.in_test = False
		try:
			frappe.set_user(seller)
			with self.assertRaises(frappe.ValidationError):
				sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), "cash")
			shift.open_shift(0)
			self.assertTrue(sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), "cash")["invoice"])
			# Offline-queued sales (client_uuid) stay exempt even with the guard active.
			frappe.db.set_value("Cago Till Shift", {"cashier": seller, "status": "Open"}, "status", "Closed")
			self.assertTrue(
				sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), "cash", client_uuid=frappe.generate_hash(length=20))["invoice"]
			)
		finally:
			frappe.set_user("Administrator")
			frappe.flags.in_test = True

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

	def test_price_override_per_staff_allowance(self):
		"""Mặc cả: a per-line rate is honoured ONLY when THIS cashier's cago_allow_price_edit is on;
		otherwise the price-list rate stands (per-staff, not store-wide)."""
		from cago.api import purchasing, sales

		seller = _seller_user()
		purchasing.receive_stock(ITEM, 10)  # as owner (Administrator)
		base = sales._rate_for_uom(ITEM, frappe.db.get_value("Item", ITEM, "stock_uom"), frappe.db.get_value("Item", ITEM, "stock_uom"))
		try:
			# OFF for this staff → override ignored
			frappe.db.set_value("User", seller, "cago_allow_price_edit", 0)
			frappe.set_user(seller)
			r_off = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1, "rate": 1}]), "cash")
			self.assertAlmostEqual(frappe.get_doc("Sales Invoice", r_off["invoice"]).items[0].rate, base, places=2)
			frappe.set_user("Administrator")
			# ON for this staff → override honoured
			frappe.db.set_value("User", seller, "cago_allow_price_edit", 1)
			frappe.set_user(seller)
			r_on = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1, "rate": 1234}]), "cash")
			self.assertAlmostEqual(frappe.get_doc("Sales Invoice", r_on["invoice"]).items[0].rate, 1234, places=2)
		finally:
			frappe.set_user("Administrator")

	def test_price_override_cannot_go_below_floor(self):
		"""Even with price edit on, an override below the item's giá sàn (cago_min_price) is rejected
		so staff can't sell under cost while bargaining."""
		from cago.api import debt, purchasing, sales

		purchasing.receive_stock(ITEM, 10)
		company = debt._company()
		frappe.db.set_value("Company", company, "cago_allow_price_edit", 1)
		old_floor = frappe.db.get_value("Item", ITEM, "cago_min_price")
		frappe.db.set_value("Item", ITEM, "cago_min_price", 50000)
		try:
			with self.assertRaises(frappe.ValidationError):
				sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1, "rate": 1000}]), "cash")
			# at/above the floor is fine
			r = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1, "rate": 60000}]), "cash")
			self.assertAlmostEqual(frappe.get_doc("Sales Invoice", r["invoice"]).items[0].rate, 60000, places=2)
		finally:
			frappe.db.set_value("Item", ITEM, "cago_min_price", old_floor or 0)
			frappe.db.set_value("Company", company, "cago_allow_price_edit", 0)

	def test_manual_discount_requires_price_edit(self):
		"""A whole-bill discount is bargaining too: rejected unless THIS cashier may edit price."""
		from cago.api import purchasing, sales

		seller = _seller_user()
		purchasing.receive_stock(ITEM, 10)
		try:
			frappe.db.set_value("User", seller, "cago_allow_price_edit", 0)
			frappe.set_user(seller)
			with self.assertRaises(frappe.ValidationError):
				sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), "cash", discount_amount=5000)
		finally:
			frappe.set_user("Administrator")

	def test_discount_respects_per_staff_max_pct(self):
		"""A staff allowed to discount still cannot exceed their per-staff max %."""
		from cago.api import purchasing, sales

		seller = _seller_user()
		purchasing.receive_stock(ITEM, 10)
		base = sales._rate_for_uom(ITEM, frappe.db.get_value("Item", ITEM, "stock_uom"), frappe.db.get_value("Item", ITEM, "stock_uom"))
		old_floor = frappe.db.get_value("Item", ITEM, "cago_min_price")
		frappe.db.set_value("Item", ITEM, "cago_min_price", 0)  # isolate the % cap from the floor check
		try:
			frappe.db.set_value("User", seller, "cago_allow_price_edit", 1)
			frappe.db.set_value("User", seller, "cago_max_discount_pct", 10)
			frappe.set_user(seller)
			with self.assertRaises(frappe.ValidationError):  # 30% > 10% cap
				sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), "cash", discount_amount=round(base * 0.3))
			r = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), "cash", discount_amount=round(base * 0.08))
			self.assertTrue(r["invoice"])  # 8% within cap
		finally:
			frappe.set_user("Administrator")
			frappe.db.set_value("Item", ITEM, "cago_min_price", old_floor or 0)

	def test_whole_bill_discount_cannot_breach_floor(self):
		"""A Grand-Total discount that drives a line under its giá sàn is rejected (the discount is
		spread proportionally, so the per-line floor still binds)."""
		from cago.api import debt, purchasing, sales

		purchasing.receive_stock(ITEM, 10)
		company = debt._company()
		base = sales._rate_for_uom(ITEM, frappe.db.get_value("Item", ITEM, "stock_uom"), frappe.db.get_value("Item", ITEM, "stock_uom"))
		old_floor = frappe.db.get_value("Item", ITEM, "cago_min_price")
		frappe.db.set_value("Company", company, "cago_allow_price_edit", 1)
		frappe.db.set_value("Item", ITEM, "cago_min_price", round(base * 0.9))  # floor at 90% of base
		try:
			with self.assertRaises(frappe.ValidationError):
				sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), "cash", discount_amount=round(base * 0.3))
			r = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 1}]), "cash", discount_amount=round(base * 0.05))
			self.assertTrue(r["invoice"])
		finally:
			frappe.db.set_value("Item", ITEM, "cago_min_price", old_floor or 0)
			frappe.db.set_value("Company", company, "cago_allow_price_edit", 0)

	def test_oversell_is_allowed_with_negative_stock(self):
		"""Rural shops' system stock lags reality, so selling past on-hand is permitted
		(allow_negative_stock; the POS warns the staff up-front). The sale must go through
		and stock may go negative — it must NOT fail at payment time."""
		from cago.api import purchasing, sales

		purchasing.receive_stock(ITEM, 10)
		on_hand = flt_qty(ITEM)
		r = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": on_hand + 100}]), "cash")
		self.assertEqual(frappe.get_doc("Sales Invoice", r["invoice"]).docstatus, 1)
		self.assertAlmostEqual(flt_qty(ITEM), on_hand - (on_hand + 100), places=2)

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
		# A real sale always has a selling price (quick_sale now refuses a 0đ line). This test is
		# about zero VALUATION (no cost), so give it a price (on the list + stock uom quick_sale
		# reads) and leave the cost at zero.
		from cago.utils.dto import SELLING_PRICE_LIST

		if not frappe.db.exists("Item Price", {"item_code": code, "price_list": SELLING_PRICE_LIST, "selling": 1}):
			frappe.get_doc(
				{
					"doctype": "Item Price",
					"item_code": code,
					"price_list": SELLING_PRICE_LIST,
					"selling": 1,
					"uom": "Nos",
					"price_list_rate": 10000,
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

	def test_partial_return_prorates_discount(self):
		"""Returning 1 of 2 units on a 10%-discounted invoice refunds the NET price paid (~half the
		discounted total), not the gross line price."""
		from cago.api import purchasing, sales
		from frappe.utils import flt

		purchasing.receive_stock(ITEM, 10)
		su = frappe.db.get_value("Item", ITEM, "stock_uom")
		base = sales._rate_for_uom(ITEM, su, su)
		old_floor = frappe.db.get_value("Item", ITEM, "cago_min_price")
		frappe.db.set_value("Item", ITEM, "cago_min_price", 0)  # isolate from the floor check
		try:
			disc = round(base * 2 * 0.10)
			s = sales.quick_sale(json.dumps([{"item_code": ITEM, "qty": 2}]), "cash", discount_amount=disc)
			si = frappe.get_doc("Sales Invoice", s["invoice"])
			rr = sales.return_sale(si.name, json.dumps([{"item_code": ITEM, "qty": 1}]))
			ret = frappe.get_doc("Sales Invoice", rr["return_invoice"])
			# Refund of 1 of 2 units = half the discounted grand total (pro-rated), not half the gross.
			self.assertAlmostEqual(abs(flt(ret.grand_total)), flt(si.grand_total) / 2, delta=2)
		finally:
			frappe.db.set_value("Item", ITEM, "cago_min_price", old_floor or 0)


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
