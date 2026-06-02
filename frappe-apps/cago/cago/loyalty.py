# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Loyalty points (tích điểm) — accrued automatically on Sales Invoice submit.

Hooked via doc_events (hooks.py) so BOTH native POS sales and credit sales (and any
submitted Sales Invoice) earn points, without touching each sale flow. Rate is
configurable: CAGO_LOYALTY_VND_PER_POINT / site_config cago_loyalty_vnd_per_point
(default 10.000đ = 1 point). Points are reversed if the invoice is cancelled.
"""

import frappe
from frappe.utils import flt

WALKIN_NAME = "Khách lẻ"  # generic cash customer — no loyalty (would inflate one shared record)


def _is_walkin(customer):
	return frappe.db.get_value("Customer", customer, "customer_name") == WALKIN_NAME


def _per_point():
	from cago.chatbot.config import _get

	return flt(_get("CAGO_LOYALTY_VND_PER_POINT", "cago_loyalty_vnd_per_point", 10000)) or 10000


def _add_points(customer, delta):
	current = flt(frappe.db.get_value("Customer", customer, "cago_points"))
	frappe.db.set_value("Customer", customer, "cago_points", max(0, int(current + delta)))


def accrue(doc, method=None):
	"""On submit: award points and RECORD the awarded count on the invoice, so cancel can
	reverse the exact amount regardless of any later rate change."""
	customer = getattr(doc, "customer", None)
	if not customer or _is_walkin(customer):
		return
	pts = int(flt(getattr(doc, "grand_total", 0)) / _per_point())
	if pts <= 0:
		return
	_add_points(customer, +pts)
	# Persist what we actually gave (read back on cancel). Field may be absent on older sites.
	try:
		frappe.db.set_value("Sales Invoice", doc.name, "cago_points_awarded", pts, update_modified=False)
	except Exception:
		pass


def reverse(doc, method=None):
	"""On cancel: subtract exactly the points awarded at submit (not a recomputed value)."""
	customer = getattr(doc, "customer", None)
	if not customer or _is_walkin(customer):
		return
	awarded = getattr(doc, "cago_points_awarded", None)
	pts = int(flt(awarded)) if awarded else int(flt(getattr(doc, "grand_total", 0)) / _per_point())
	if pts > 0:
		_add_points(customer, -pts)
