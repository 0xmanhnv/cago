# Copyright (c) 2026, 0xManhnv
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
from cago.utils.permissions import ensure_cap


def _open_shift_name(user):
	return frappe.db.get_value("Cago Till Shift", {"cashier": user, "status": "Open"}, "name")


def ensure_open_shift(user=None):
	"""Block a live counter sale unless the cashier has an open till shift — so every sale's cash is
	accounted to a shift (drawer reconciliation). NOT called for offline-queued sales (those carry a
	client_uuid and are attributed by their posted_at window), so syncing after close still works."""
	user = user or frappe.session.user
	if not _open_shift_name(user):
		frappe.throw(_("Bạn chưa mở ca bán hàng. Hãy mở ca trước khi bán."), title=_("Chưa mở ca"))


def _cashier_cash_sales(user, since, until=None):
	"""Net cash that should be in THIS cashier's drawer for the window [`since`, `until`].

	= Cash-type payment rows on their submitted invoices (a return's negative cash subtracts,
	  now that return_sale stamps cago_cashier)
	− change_amount handed back (overpaid cash: the payment row keeps the full tendered amount
	  while change goes back to the customer, so it must be netted out of the drawer).
	The change subtraction is computed per-invoice (not in the payment join) so an invoice with
	several payment rows doesn't subtract its change more than once.

	Sales are attributed by their POSTING datetime (when the sale was rung up), NOT `creation`
	(the DB-insert/sync time). An offline sale rung up during this shift but synced minutes later
	carries posting_date/posting_time inside the window via quick_sale(posted_at=...), so it lands
	in the shift it belongs to; using `creation` would push it past the close into the next shift.
	`until` (a closed shift's closed_at) bounds the window so a late sync can't leak across shifts.
	"""
	# Build the posting-datetime window predicate + params shared by the two SI queries.
	si_when = "timestamp(si.posting_date, si.posting_time) >= %s"
	si_args = [user, since]
	if until:
		si_when += " and timestamp(si.posting_date, si.posting_time) <= %s"
		si_args.append(until)
	cash_in = frappe.db.sql(
		f"""
		select coalesce(sum(sip.amount), 0)
		from `tabSales Invoice Payment` sip
		join `tabSales Invoice` si on si.name = sip.parent
		join `tabMode of Payment` mop on mop.name = sip.mode_of_payment
		where si.docstatus = 1 and si.cago_cashier = %s and {si_when} and mop.type = 'Cash'
		""",
		tuple(si_args),
	)
	change_out = frappe.db.sql(
		f"""
		select coalesce(sum(change_amount), 0)
		from `tabSales Invoice` si
		where si.docstatus = 1 and si.cago_cashier = %s and {si_when}
		""",
		tuple(si_args),
	)
	# Cash debt collections (Khách trả nợ) made by this cashier also land in the drawer. These are
	# always real-time counter actions, so creation == posting; bound by the same window.
	pe_when = "pe.creation >= %s"
	pe_args = [user, since]
	if until:
		pe_when += " and pe.creation <= %s"
		pe_args.append(until)
	repaid = frappe.db.sql(
		f"""
		select coalesce(sum(pe.paid_amount), 0)
		from `tabPayment Entry` pe
		join `tabAccount` acc on acc.name = pe.paid_to
		where pe.docstatus = 1 and pe.payment_type = 'Receive'
		  and pe.cago_cashier = %s and {pe_when} and acc.account_type = 'Cash'
		""",
		tuple(pe_args),
	)
	return (
		(flt(cash_in[0][0]) if cash_in else 0.0)
		- (flt(change_out[0][0]) if change_out else 0.0)
		+ (flt(repaid[0][0]) if repaid else 0.0)
	)


def _shift_dto(doc):
	from cago.utils.permissions import is_owner

	cash_sales = flt(doc.cash_sales)
	# For an open shift, compute the live running figure; for a closed shift, use what was stored.
	if doc.status == "Open":
		cash_sales = _cashier_cash_sales(doc.cashier, doc.opened_at)
	expected = flt(doc.opening_cash) + cash_sales - flt(doc.payouts)
	# Blind close: this cashier must count the drawer without seeing what it SHOULD be (anti-fraud).
	# The variance is still computed + stored on the doc; only the owner sees it (Sổ quỹ).
	blind = (
		frappe.session.user == doc.cashier
		and not is_owner()
		and frappe.db.get_value("User", doc.cashier, "cago_blind_shift_close")
	)
	out = {
		"name": doc.name,
		"status": doc.status,
		"blind": bool(blind),
		"opened_at": format_datetime(doc.opened_at, "dd/MM HH:mm") if doc.opened_at else None,
		"closed_at": format_datetime(doc.closed_at, "dd/MM HH:mm") if doc.closed_at else None,
		"opening_cash": flt(doc.opening_cash),
		"opening_text": dto.format_price(doc.opening_cash),
		"payouts_text": dto.format_price(doc.payouts),
		"counted_text": dto.format_price(doc.counted_cash) if doc.status == "Closed" else None,
	}
	if blind:
		return out  # hide cash_sales / expected / variance entirely
	out.update(
		{
			"cash_sales": cash_sales,
			"cash_sales_text": dto.format_price(cash_sales),
			"expected": expected,
			"expected_text": dto.format_price(expected),
			"diff": flt(doc.difference),
			"diff_text": dto.format_price(abs(flt(doc.difference))),
			"match": abs(flt(doc.difference)) < 1 if doc.status == "Closed" else None,
			"over": flt(doc.difference) > 0,
		}
	)
	return out


@frappe.whitelist()
def current_shift():
	"""The current cashier's open shift with live running totals, or {open: False}."""
	ensure_cap("sell")
	name = _open_shift_name(frappe.session.user)
	if not name:
		return {"open": False}
	return {"open": True, **_shift_dto(frappe.get_doc("Cago Till Shift", name))}


@frappe.whitelist()
def open_shift(opening_cash=0):
	"""Open a till shift for the current cashier (only one open at a time)."""
	ensure_cap("sell")
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
	ensure_cap("sell")
	name = _open_shift_name(frappe.session.user)
	if not name:
		frappe.throw(_("Không có ca nào đang mở."))
	doc = frappe.get_doc("Cago Till Shift", name)
	# Stamp the close time first, then reconcile over exactly [opened_at, closed_at] so a sale that
	# syncs after this moment can't be (double-)counted in this now-closed shift.
	doc.closed_at = now_datetime()
	cash_sales = _cashier_cash_sales(doc.cashier, doc.opened_at, doc.closed_at)
	expected = flt(doc.opening_cash) + cash_sales - flt(payouts)
	counted = flt(counted_cash)
	doc.cash_sales = cash_sales
	doc.payouts = flt(payouts)
	doc.expected_cash = expected
	doc.counted_cash = counted
	doc.difference = counted - expected
	doc.note = note
	doc.status = "Closed"
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"open": False, **_shift_dto(doc)}
