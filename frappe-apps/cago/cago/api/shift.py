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


def _cashier_movements(user, since, until=None):
	"""Net cash from mid-shift movements: Nộp quỹ (+) / Rút quỹ (−) / Chi vặt (−). Returns (net, list)."""
	filters = {"cashier": user, "posted": [">=", since]}
	rows = frappe.get_all(
		"Cago Cash Movement",
		filters=filters,
		fields=["kind", "amount", "reason", "posted"],
		order_by="posted asc",
	)
	net = 0.0
	out = []
	for r in rows:
		if until and str(r.posted) > str(until):
			continue
		amt = flt(r.amount)
		sign = 1 if r.kind == "Nộp quỹ" else -1
		net += sign * amt
		out.append({"kind": r.kind, "amount": amt, "amount_text": dto.format_price(amt), "reason": r.reason or "", "sign": sign})
	return net, out


def _shift_dto(doc):
	from cago.utils.permissions import is_owner

	cash_sales = flt(doc.cash_sales)
	# For an open shift, compute the live running figure; for a closed shift, use what was stored.
	if doc.status == "Open":
		cash_sales = _cashier_cash_sales(doc.cashier, doc.opened_at)
	mv_net, mv_list = _cashier_movements(doc.cashier, doc.opened_at, None if doc.status == "Open" else doc.closed_at)
	expected = flt(doc.opening_cash) + cash_sales - flt(doc.payouts) + mv_net
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
			"movements": mv_list,
			"movements_net": mv_net,
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
def add_cash_movement(kind, amount, reason=None):
	"""Record cash in/out/petty-expense during the open shift (nộp quỹ / rút quỹ / chi vặt). Folds into
	the shift's expected drawer so the close reconciles correctly. Requires an open shift."""
	ensure_cap("sell")
	user = frappe.session.user
	name = _open_shift_name(user)
	if not name:
		frappe.throw(_("Bạn chưa mở ca. Hãy mở ca trước."))
	if kind not in ("Nộp quỹ", "Rút quỹ", "Chi vặt"):
		frappe.throw(_("Loại giao dịch quỹ không hợp lệ."))
	amt = flt(amount)
	if amt <= 0:
		frappe.throw(_("Số tiền phải lớn hơn 0."))
	frappe.get_doc(
		{
			"doctype": "Cago Cash Movement",
			"cashier": user,
			"shift": name,
			"kind": kind,
			"amount": amt,
			"reason": reason,
			"posted": now_datetime(),
		}
	).insert(ignore_permissions=True)
	frappe.db.commit()
	return {"open": True, **_shift_dto(frappe.get_doc("Cago Till Shift", name))}


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
	mv_net, _ = _cashier_movements(doc.cashier, doc.opened_at, doc.closed_at)
	expected = flt(doc.opening_cash) + cash_sales - flt(payouts) + mv_net
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
	_notify_shift_close(doc)
	return {"open": False, **_shift_dto(doc)}


def _notify_shift_close(doc):
	"""Push a private shift-close digest to the owner's Telegram (cash sales + drawer reconciliation).
	Owner-only channel — the staff group never sees the cash figures. Best-effort, never blocks the close."""
	try:
		from cago.api.notify import notify_owner_telegram
		from cago.utils import dto

		who = frappe.utils.get_fullname(doc.cashier) or doc.cashier
		diff = flt(doc.difference)
		recon = "✅ Khớp két" if abs(diff) < 1 else (f"⚠️ Thừa {dto.format_price(diff)}" if diff > 0 else f"⚠️ Thiếu {dto.format_price(-diff)}")
		notify_owner_telegram(
			f"🌙 <b>Đóng ca</b> — {who}\n"
			f"💵 Tiền mặt bán: {dto.format_price(flt(doc.cash_sales))}\n"
			f"🧮 Dự kiến két: {dto.format_price(flt(doc.expected_cash))} · Đếm: {dto.format_price(flt(doc.counted_cash))}\n"
			f"{recon}"
		)
	except Exception:  # noqa: BLE001
		pass
