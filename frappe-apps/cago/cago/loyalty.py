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


def loyalty_on_credit():
	"""Whether a credit (mua nợ) sale also earns points. Default OFF — points reward paid sales; the
	unpaid (debt) portion earns nothing until/unless the owner turns this on."""
	return bool(_company_rate("cago_loyalty_on_credit"))


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
	so cancel reverses the exact amounts. A RETURN (is_return) instead claws points back pro-rata."""
	customer = getattr(doc, "customer", None)
	if not customer or _is_walkin(customer):
		return
	if getattr(doc, "is_return", 0):
		_accrue_return(doc, customer)
		return
	redeemed = int(flt(getattr(doc, "cago_points_redeemed", 0) or 0))
	# Earn on the PRE-redemption total: a customer who spends points must not also earn less for
	# doing so (their points are cashed-in value, not a shop discount). grand_total is already net
	# of the redemption (folded into the bill discount), so add that value back. Coupons / manual
	# bargaining still reduce the earn basis — you earn on what you actually paid.
	basis = flt(getattr(doc, "grand_total", 0)) + redeemed * redeem_value()
	# Mua nợ: by default the unpaid (debt) portion earns no points — subtract the outstanding so only
	# the PAID part earns (a fully-credit sale → 0). Owner can turn this off (earn on the full bill).
	if not loyalty_on_credit():
		basis = max(0.0, basis - flt(getattr(doc, "outstanding_amount", 0)))
	pts = int(basis / _per_point())
	if pts > 0:
		_add_points(customer, +pts)
	# ALWAYS persist what we awarded (even 0) so reverse() never has to guess — this distinguishes a
	# genuinely-zero earn (e.g. a fully-credit sale) from an old invoice that predates the field.
	try:
		frappe.db.set_value("Sales Invoice", doc.name, "cago_points_awarded", pts, update_modified=False)
	except Exception:
		pass
	if redeemed > 0:
		_add_points(customer, -redeemed)  # customer spent these points as a discount


def _return_share(doc):
	"""Fraction of the original bill (by value) this return covers, clamped to [0, 1]; + the original."""
	orig = getattr(doc, "return_against", None)
	if not orig:
		return 0.0, None
	orig_total = abs(flt(frappe.db.get_value("Sales Invoice", orig, "grand_total")))
	if orig_total <= 0:
		return 0.0, orig
	return min(1.0, abs(flt(getattr(doc, "grand_total", 0))) / orig_total), orig


def _accrue_return(doc, customer):
	"""A return reverses points proportionally to the value returned: claw back the points the original
	sale AWARDED (else a buy-then-return-everything loop farms points for free), and give back the
	points it REDEEMED (returning the goods returns the spent points). Persist both on the return SI so
	cancelling the return re-applies them exactly."""
	share, orig = _return_share(doc)
	if not orig or share <= 0:
		return
	awarded_orig = int(flt(frappe.db.get_value("Sales Invoice", orig, "cago_points_awarded") or 0))
	redeemed_orig = int(flt(frappe.db.get_value("Sales Invoice", orig, "cago_points_redeemed") or 0))
	clawback = int(round(awarded_orig * share))
	giveback = int(round(redeemed_orig * share))
	if clawback or giveback:
		_add_points(customer, giveback - clawback)
	try:
		frappe.db.set_value(
			"Sales Invoice", doc.name,
			{"cago_points_awarded": clawback, "cago_points_redeemed": giveback},
			update_modified=False,
		)
	except Exception:
		pass


def reverse(doc, method=None):
	"""On cancel: undo exactly what this invoice did to the balance. A normal sale awarded points and
	spent redeemed ones → give the redeemed back and remove the awarded. A return did the opposite
	(clawback / giveback, stored in the same two fields) → invert it."""
	customer = getattr(doc, "customer", None)
	if not customer or _is_walkin(customer):
		return
	redeemed = int(flt(getattr(doc, "cago_points_redeemed", 0) or 0))
	awarded = getattr(doc, "cago_points_awarded", None)
	if getattr(doc, "is_return", 0):
		# On a return: awarded = points clawed back, redeemed = points given back. Cancelling inverts:
		# add the clawback back to the customer, remove the giveback.
		clawback = int(flt(awarded)) if awarded is not None else 0
		if clawback or redeemed:
			_add_points(customer, clawback - redeemed)
		return
	# Normal sale cancel: prefer the persisted award — 0 is a VALID value, don't recompute (the old
	# fallback recomputed a non-credit-adjusted basis and deducted points a fully-credit sale never
	# earned). Only estimate for pre-field invoices, mirroring accrue's credit handling.
	if awarded is not None:
		pts = int(flt(awarded))
	else:
		basis = flt(getattr(doc, "grand_total", 0)) + redeemed * redeem_value()
		if not loyalty_on_credit():
			basis = max(0.0, basis - flt(getattr(doc, "outstanding_amount", 0)))
		pts = int(basis / _per_point())
	if pts > 0:
		_add_points(customer, -pts)
	if redeemed > 0:
		_add_points(customer, +redeemed)
