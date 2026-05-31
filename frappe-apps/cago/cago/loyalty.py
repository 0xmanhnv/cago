# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Loyalty points (tích điểm) — accrued automatically on Sales Invoice submit.

Hooked via doc_events (hooks.py) so BOTH native POS sales and credit sales (and any
submitted Sales Invoice) earn points, without touching each sale flow. Rate is
configurable: CAGO_LOYALTY_VND_PER_POINT / site_config cago_loyalty_vnd_per_point
(default 10.000đ = 1 point). Points are reversed if the invoice is cancelled.
"""

import frappe
from frappe.utils import flt


def _per_point():
	from cago.chatbot.config import _get

	return flt(_get("CAGO_LOYALTY_VND_PER_POINT", "cago_loyalty_vnd_per_point", 10000)) or 10000


def _adjust(doc, sign):
	customer = getattr(doc, "customer", None)
	if not customer:
		return
	pts = int(flt(getattr(doc, "grand_total", 0)) / _per_point())
	if pts <= 0:
		return
	current = flt(frappe.db.get_value("Customer", customer, "cago_points"))
	frappe.db.set_value("Customer", customer, "cago_points", max(0, int(current + sign * pts)))


def accrue(doc, method=None):
	_adjust(doc, +1)


def reverse(doc, method=None):
	_adjust(doc, -1)
