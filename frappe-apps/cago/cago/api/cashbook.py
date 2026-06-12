# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Chốt ca / sổ quỹ — end-of-day cash reconciliation (owner-only).

Compares the cash that SHOULD be in the drawer (opening + today's cash sales − payouts)
against what the owner counted, and logs the result. Reuses reports.payment_split for
today's cash (POS cash payments), so there is no new accounting — just a reconciliation
helper + an audit log entry. Bank/credit are shown for context but aren't drawer cash.
"""

import frappe
from frappe.utils import flt, nowdate

from cago.api import debt, reports
from cago.cago.doctype.cago_owner_action_log.cago_owner_action_log import record_action
from cago.utils import dto
from cago.utils.permissions import ensure_cap


@frappe.whitelist()
def today_summary():
	"""Today's money split (cash drawer vs bank vs credit) for the chốt-ca screen."""
	ensure_cap("cash")
	ps = reports.payment_split("today")
	return {
		"cash": flt(ps["cash"]),
		"cash_text": ps["cash_text"],
		"bank_text": ps["bank_text"],
		"credit_text": ps["credit_text"],
	}


@frappe.whitelist()
def day_close(counted_cash, opening_cash=0, payouts=0):
	"""Reconcile the drawer: expected = opening + today's cash IN (POS cash sales + cash debt collected
	+ net cash movements) − payouts, vs counted. Must mirror the per-shift formula (shift.py), else the
	whole-day expectation omits cash debt collections + petty-cash movements and the drawer reads off."""
	ensure_cap("cash")
	cash_sales = flt(reports.payment_split("today")["cash"])
	today = nowdate()
	# Cash collected on customer debt today (Khách trả nợ via a Cash account) — real money in the drawer.
	repaid = frappe.db.sql(
		"""select coalesce(sum(pe.paid_amount), 0)
		from `tabPayment Entry` pe join `tabAccount` acc on acc.name = pe.paid_to
		where pe.docstatus = 1 and pe.payment_type = 'Receive' and pe.posting_date = %s and acc.account_type = 'Cash'""",
		today,
	)
	repaid = flt(repaid[0][0]) if repaid else 0.0
	# Net cash movements today across all shifts: Nộp quỹ (+) / Rút quỹ (−) / Chi vặt (−).
	mvs = frappe.get_all(
		"Cago Cash Movement",
		filters={"posted": ["between", [f"{today} 00:00:00", f"{today} 23:59:59"]]},
		fields=["kind", "amount"],
	)
	mv_net = sum((flt(m.amount) if m.kind == "Nộp quỹ" else -flt(m.amount)) for m in mvs)
	opening, payouts, counted = flt(opening_cash), flt(payouts), flt(counted_cash)
	expected = opening + cash_sales + repaid + mv_net - payouts
	diff = counted - expected
	record_action(
		"Other",
		ref_doctype="Company",
		ref_name=debt._company(),
		old_value=expected,
		new_value=f"Chốt ca: đếm {counted:.0f}, dự kiến {expected:.0f}, lệch {diff:.0f}",
	)
	frappe.db.commit()
	return {
		"cash_sales_text": dto.format_price(cash_sales),
		"opening_text": dto.format_price(opening),
		"payouts_text": dto.format_price(payouts),
		"expected_text": dto.format_price(expected),
		"counted_text": dto.format_price(counted),
		"diff": diff,
		"diff_text": dto.format_price(abs(diff)),
		"match": abs(diff) < 1,
		"over": diff > 0,
	}
