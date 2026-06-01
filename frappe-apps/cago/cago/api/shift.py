# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Ca bán hàng tại quầy — per-cashier till shift (mở ca / đóng ca / đếm két).

Wires the cash-drawer idea (cago.api.cashbook is the owner's whole-day close) into the staff
sell flow so each cashier can open a shift, sell, then count their drawer and see the expected
vs counted difference. Cash is attributed via Sales Invoice.cago_cashier (set in quick_sale),
because the invoice is submitted under Administrator and `owner` is therefore not the cashier.
"""

import frappe
from frappe import _
from frappe.utils import flt, format_datetime, now_datetime

from cago.utils import dto
from cago.utils.permissions import ensure_staff


def _open_shift_name(user):
	return frappe.db.get_value("Cago Till Shift", {"cashier": user, "status": "Open"}, "name")


def _cashier_cash_sales(user, since):
	"""Net cash that should be in THIS cashier's drawer since `since`.

	= Cash-type payment rows on their submitted invoices (a return's negative cash subtracts,
	  now that return_sale stamps cago_cashier)
	− change_amount handed back (overpaid cash: the payment row keeps the full tendered amount
	  while change goes back to the customer, so it must be netted out of the drawer).
	The change subtraction is computed per-invoice (not in the payment join) so an invoice with
	several payment rows doesn't subtract its change more than once.
	"""
	cash_in = frappe.db.sql(
		"""
		select coalesce(sum(sip.amount), 0)
		from `tabSales Invoice Payment` sip
		join `tabSales Invoice` si on si.name = sip.parent
		join `tabMode of Payment` mop on mop.name = sip.mode_of_payment
		where si.docstatus = 1 and si.cago_cashier = %s and si.creation >= %s and mop.type = 'Cash'
		""",
		(user, since),
	)
	change_out = frappe.db.sql(
		"""
		select coalesce(sum(change_amount), 0)
		from `tabSales Invoice`
		where docstatus = 1 and cago_cashier = %s and creation >= %s
		""",
		(user, since),
	)
	return (flt(cash_in[0][0]) if cash_in else 0.0) - (flt(change_out[0][0]) if change_out else 0.0)


def _shift_dto(doc):
	cash_sales = flt(doc.cash_sales)
	# For an open shift, compute the live running figure; for a closed shift, use what was stored.
	if doc.status == "Open":
		cash_sales = _cashier_cash_sales(doc.cashier, doc.opened_at)
	expected = flt(doc.opening_cash) + cash_sales - flt(doc.payouts)
	return {
		"name": doc.name,
		"status": doc.status,
		"opened_at": format_datetime(doc.opened_at, "dd/MM HH:mm") if doc.opened_at else None,
		"closed_at": format_datetime(doc.closed_at, "dd/MM HH:mm") if doc.closed_at else None,
		"opening_cash": flt(doc.opening_cash),
		"opening_text": dto.format_price(doc.opening_cash),
		"cash_sales": cash_sales,
		"cash_sales_text": dto.format_price(cash_sales),
		"payouts_text": dto.format_price(doc.payouts),
		"expected": expected,
		"expected_text": dto.format_price(expected),
		"counted_text": dto.format_price(doc.counted_cash) if doc.status == "Closed" else None,
		"diff": flt(doc.difference),
		"diff_text": dto.format_price(abs(flt(doc.difference))),
		"match": abs(flt(doc.difference)) < 1 if doc.status == "Closed" else None,
		"over": flt(doc.difference) > 0,
	}


@frappe.whitelist()
def current_shift():
	"""The current cashier's open shift with live running totals, or {open: False}."""
	ensure_staff()
	name = _open_shift_name(frappe.session.user)
	if not name:
		return {"open": False}
	return {"open": True, **_shift_dto(frappe.get_doc("Cago Till Shift", name))}


@frappe.whitelist()
def open_shift(opening_cash=0):
	"""Open a till shift for the current cashier (only one open at a time)."""
	ensure_staff()
	user = frappe.session.user
	if _open_shift_name(user):
		frappe.throw(_("Bạn đang có một ca mở. Hãy đóng ca cũ trước."))
	doc = frappe.get_doc(
		{
			"doctype": "Cago Till Shift",
			"cashier": user,
			"status": "Open",
			"opening_cash": flt(opening_cash),
			"opened_at": now_datetime(),
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"open": True, **_shift_dto(doc)}


@frappe.whitelist()
def close_shift(counted_cash, payouts=0, note=None):
	"""Close the current cashier's shift: store cash sales + reconciliation (expected vs counted)."""
	ensure_staff()
	name = _open_shift_name(frappe.session.user)
	if not name:
		frappe.throw(_("Không có ca nào đang mở."))
	doc = frappe.get_doc("Cago Till Shift", name)
	cash_sales = _cashier_cash_sales(doc.cashier, doc.opened_at)
	expected = flt(doc.opening_cash) + cash_sales - flt(payouts)
	counted = flt(counted_cash)
	doc.cash_sales = cash_sales
	doc.payouts = flt(payouts)
	doc.expected_cash = expected
	doc.counted_cash = counted
	doc.difference = counted - expected
	doc.note = note
	doc.status = "Closed"
	doc.closed_at = now_datetime()
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"open": False, **_shift_dto(doc)}
