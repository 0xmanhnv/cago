# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Chốt ca / sổ quỹ — end-of-day cash reconciliation (owner-only).

Compares the cash that SHOULD be in the drawer (opening + today's cash sales − payouts)
against what the owner counted, and logs the result. Reuses reports.payment_split for
today's cash (POS cash payments), so there is no new accounting — just a reconciliation
helper + an audit log entry. Bank/credit are shown for context but aren't drawer cash.
"""

import frappe
from frappe.utils import flt

from cago.api import debt, reports
from cago.cago.doctype.cago_owner_action_log.cago_owner_action_log import record_action
from cago.utils import dto
from cago.utils.permissions import ensure_owner


@frappe.whitelist()
def today_summary():
	"""Today's money split (cash drawer vs bank vs credit) for the chốt-ca screen."""
	ensure_owner()
	ps = reports.payment_split("today")
	return {
		"cash": flt(ps["cash"]),
		"cash_text": ps["cash_text"],
		"bank_text": ps["bank_text"],
		"credit_text": ps["credit_text"],
	}


@frappe.whitelist()
def day_close(counted_cash, opening_cash=0, payouts=0):
	"""Reconcile the drawer: expected = opening + today cash sales − payouts vs counted."""
	ensure_owner()
	cash_sales = flt(reports.payment_split("today")["cash"])
	opening, payouts, counted = flt(opening_cash), flt(payouts), flt(counted_cash)
	expected = opening + cash_sales - payouts
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
