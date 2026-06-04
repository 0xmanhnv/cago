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

from cago.utils import dto

WALKIN_NAME = dto.WALKIN_NAME  # single source — must match the customer the sale creates


def _is_walkin(customer):
	return frappe.db.get_value("Customer", customer, "customer_name") == WALKIN_NAME


def _company_rate(field):
	"""Owner-set loyalty rate from the Company (Settings screen), or 0 if unset."""
	try:
		from cago.api import debt

		return flt(frappe.db.get_value("Company", debt._company(), field))
	except Exception:
		return 0


def _per_point():
	"""Đồng spent per 1 point EARNED. Owner setting (Company) wins; else env/site_config; else 10.000đ."""
	owner = _company_rate("cago_loyalty_earn_vnd")
	if owner > 0:
		return owner
	from cago.chatbot.config import _get

	return flt(_get("CAGO_LOYALTY_VND_PER_POINT", "cago_loyalty_vnd_per_point", 10000)) or 10000


def redeem_value():
	"""Đồng per point when a customer SPENDS points at the till (default 1.000đ/điểm) — separate
	from the accrual rate so redeeming isn't 100% cashback. Owner setting (Company) wins, then
	env/site_config, then the default."""
	owner = _company_rate("cago_loyalty_redeem_vnd")
	if owner > 0:
		return owner
	from cago.chatbot.config import _get

	return flt(_get("CAGO_LOYALTY_REDEEM_VND_PER_POINT", "cago_loyalty_redeem_vnd_per_point", 1000)) or 1000


def _add_points(customer, delta):
	# Atomic in-place delta (floored at 0) so two concurrent sales for the same customer can't
	# clobber each other via a read-then-write race. GREATEST keeps the balance non-negative.
	frappe.db.sql(
		"UPDATE `tabCustomer` SET cago_points = GREATEST(0, COALESCE(cago_points, 0) + %s) WHERE name = %s",
		(int(delta), customer),
	)


def accrue(doc, method=None):
	"""On submit: award points for the spend AND deduct any points the customer redeemed on this
	sale (cago_points_redeemed, set by quick_sale before submit). Both are recorded on the invoice
	so cancel reverses the exact amounts."""
	customer = getattr(doc, "customer", None)
	if not customer or _is_walkin(customer):
		return
	redeemed = int(flt(getattr(doc, "cago_points_redeemed", 0) or 0))
	# Earn on the PRE-redemption total: a customer who spends points must not also earn less for
	# doing so (their points are cashed-in value, not a shop discount). grand_total is already net
	# of the redemption (folded into the bill discount), so add that value back. Coupons / manual
	# bargaining still reduce the earn basis — you earn on what you actually paid.
	basis = flt(getattr(doc, "grand_total", 0)) + redeemed * redeem_value()
	pts = int(basis / _per_point())
	if pts > 0:
		_add_points(customer, +pts)
		# Persist what we actually gave (read back on cancel). Field may be absent on older sites.
		try:
			frappe.db.set_value("Sales Invoice", doc.name, "cago_points_awarded", pts, update_modified=False)
		except Exception:
			pass
	if redeemed > 0:
		_add_points(customer, -redeemed)  # customer spent these points as a discount


def reverse(doc, method=None):
	"""On cancel: undo both — subtract the points awarded, give back the points redeemed."""
	customer = getattr(doc, "customer", None)
	if not customer or _is_walkin(customer):
		return
	redeemed = int(flt(getattr(doc, "cago_points_redeemed", 0) or 0))
	awarded = getattr(doc, "cago_points_awarded", None)
	# Prefer the persisted award; fall back to the same pre-redemption basis used in accrue().
	basis = flt(getattr(doc, "grand_total", 0)) + redeemed * redeem_value()
	pts = int(flt(awarded)) if awarded else int(basis / _per_point())
	if pts > 0:
		_add_points(customer, -pts)
	if redeemed > 0:
		_add_points(customer, +redeemed)
