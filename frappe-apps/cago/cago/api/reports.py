# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Reports API — báo cáo (owner-only).

Lightweight summaries for the owner home: today's sales, low stock, best sellers,
and the debt list. Read-only.
"""

import frappe
from frappe.query_builder import Case, Order
from frappe.query_builder.functions import Count, Sum
from frappe.utils import add_days, cint, flt, format_date, get_first_day, getdate, nowdate

from cago.api.debt import get_customer_debt
from cago.utils import dto
from cago.utils.permissions import ensure_cap, ensure_internal, ensure_owner

LOW_STOCK_STATUSES = ["Còn ít", "Hết hàng", "Sắp nhập"]
PERIOD_LABEL = {"today": "Hôm nay", "week": "7 ngày qua", "month": "Tháng này", "year": "Năm nay", "custom": "Khoảng ngày"}


def _company():
	return frappe.defaults.get_global_default("company") or (frappe.get_all("Company", pluck="name") or [None])[0]


def _period_range(period):
	today = nowdate()
	if period == "week":
		return add_days(today, -6), today
	if period == "month":
		return str(get_first_day(today)), today
	if period == "year":
		return f"{getdate(today).year}-01-01", today
	return today, today


def _resolve(period, from_date=None, to_date=None):
	"""(start, end, label) for any report. `custom` uses the from/to dates the owner picked."""
	if period == "custom" and from_date and to_date:
		a, b = str(getdate(from_date)), str(getdate(to_date))
		if a > b:
			a, b = b, a
		return a, b, f"{format_date(a, 'dd/MM/yyyy')} – {format_date(b, 'dd/MM/yyyy')}"
	if period not in PERIOD_LABEL or period == "custom":
		period = "today"
	start, end = _period_range(period)
	return start, end, PERIOD_LABEL[period]


@frappe.whitelist()
def period_summary(period="today", from_date=None, to_date=None):
	"""Sales summary for today / week / month / year / custom range."""
	ensure_cap("reports")
	start, end, label = _resolve(period, from_date, to_date)
	company = _company()
	si = frappe.qb.DocType("Sales Invoice")
	# Net sales total includes returns (negative invoices net off), but số hoá đơn counts only real
	# sales — a return is not an extra sale, so counting it would inflate the invoice count.
	res = (
		frappe.qb.from_(si)
		.select(Sum(si.grand_total), Count(Case().when(si.is_return == 0, si.name)))
		.where((si.docstatus == 1) & (si.company == company) & (si.posting_date >= start) & (si.posting_date <= end))
	).run()
	total = flt(res[0][0]) if res and res[0] else 0
	count = (res[0][1] if res and res[0] else 0) or 0
	return {
		"period": period,
		"period_label": label,
		"from": start,
		"to": end,
		"sales_total": total,
		"sales_total_text": dto.format_price(total) if total else "0đ",
		"invoice_count": count,
	}


@frappe.whitelist()
def today_summary():
	# Backward-compatible alias.
	r = period_summary("today")
	r["date"] = r["to"]
	return r


@frappe.whitelist()
def payment_split(period="today", from_date=None, to_date=None):
	"""Tiền mặt / chuyển khoản / khác (từ thanh toán POS) + ghi nợ (outstanding)."""
	ensure_cap("reports")
	start, end, label = _resolve(period, from_date, to_date)
	company = _company()
	si = frappe.qb.DocType("Sales Invoice")
	sip = frappe.qb.DocType("Sales Invoice Payment")
	mop = frappe.qb.DocType("Mode of Payment")
	rows = (
		frappe.qb.from_(sip)
		.join(si)
		.on(sip.parent == si.name)
		.left_join(mop)
		.on(sip.mode_of_payment == mop.name)
		.select(mop.type.as_("type"), Sum(sip.amount).as_("amt"))
		.where((si.docstatus == 1) & (si.company == company) & (si.posting_date >= start) & (si.posting_date <= end))
		.groupby(mop.type)
	).run(as_dict=True)
	cash = bank = other = 0
	for r in rows:
		t = (r.type or "").lower()
		amt = flt(r.amt)
		if t == "cash":
			cash += amt
		elif t == "bank":
			bank += amt
		else:
			other += amt
	res = (
		frappe.qb.from_(si)
		.select(Sum(si.outstanding_amount))
		.where((si.docstatus == 1) & (si.company == company) & (si.posting_date >= start) & (si.posting_date <= end))
	).run()
	credit = flt(res[0][0]) if res and res[0] else 0

	# A cash payment row records what the customer HANDED OVER; on an overpaid cash sale that
	# includes the change given back. The drawer only keeps tendered − change, so net it out of
	# the cash bucket (mirrors the per-cashier shift close, which already subtracts change_amount).
	chg = (
		frappe.qb.from_(si)
		.select(Sum(si.change_amount))
		.where((si.docstatus == 1) & (si.company == company) & (si.posting_date >= start) & (si.posting_date <= end))
	).run()
	cash = max(0.0, cash - (flt(chg[0][0]) if chg and chg[0] else 0))

	def _t(v):
		return dto.format_price(v) if v else "0đ"

	return {
		"period": period,
		"period_label": label,
		"cash": cash,
		"cash_text": _t(cash),
		"bank": bank,
		"bank_text": _t(bank),
		"other": other,
		"other_text": _t(other),
		"credit": credit,
		"credit_text": _t(credit),
	}


@frappe.whitelist()
def sales_by_customer(period="month", limit=10, from_date=None, to_date=None):
	"""Owner-only: top customers by sales total in the period."""
	ensure_cap("reports")
	start, end, _label = _resolve(period, from_date, to_date)
	company = _company()
	si = frappe.qb.DocType("Sales Invoice")
	rows = (
		frappe.qb.from_(si)
		.select(si.customer, Sum(si.grand_total).as_("total"), Count(si.name).as_("cnt"))
		.where((si.docstatus == 1) & (si.company == company) & (si.posting_date >= start) & (si.posting_date <= end))
		.groupby(si.customer)
		.orderby(Sum(si.grand_total), order=Order.desc)
		.limit(cint(limit) or 10)
	).run(as_dict=True)
	return [
		{
			"customer": r.customer,
			"customer_name": frappe.db.get_value("Customer", r.customer, "customer_name") or r.customer,
			"total": flt(r.total),
			"total_text": dto.format_price(flt(r.total)),
			"count": r.cnt,
		}
		for r in rows
	]


@frappe.whitelist()
def gross_profit(period="today", from_date=None, to_date=None):
	"""Owner-only gross profit = doanh thu (net) − giá vốn (COGS). COGS uses the Sales
	Invoice Item incoming_rate (set when stock is maintained). Never exposed to staff/kiosk —
	owner-only, NOT the delegable `reports` cap (a "Báo cáo" staffer must not see giá vốn/profit)."""
	ensure_owner()
	start, end, label = _resolve(period, from_date, to_date)
	company = _company()
	si = frappe.qb.DocType("Sales Invoice")
	sii = frappe.qb.DocType("Sales Invoice Item")
	res = (
		frappe.qb.from_(sii)
		.join(si)
		.on(sii.parent == si.name)
		.select(Sum(sii.base_net_amount).as_("rev"), Sum(sii.incoming_rate * sii.stock_qty).as_("cogs"))
		.where((si.docstatus == 1) & (si.company == company) & (si.posting_date >= start) & (si.posting_date <= end))
	).run(as_dict=True)
	rev = flt(res[0].rev) if res else 0
	cogs = flt(res[0].cogs) if res else 0
	profit = rev - cogs
	margin = round(profit / rev * 100) if rev else 0
	return {
		"period": period,
		"period_label": label,
		"revenue": rev,
		"revenue_text": dto.format_price(rev) if rev else "0đ",
		"cogs": cogs,
		"cogs_text": dto.format_price(cogs) if cogs else "0đ",
		"profit": profit,
		"profit_text": dto.format_price(profit) if profit else "0đ",
		"margin_pct": margin,
	}


@frappe.whitelist()
def low_stock():
	"""Items that need attention: manual low-stock statuses + auto items whose REAL
	on-hand is at/under the reorder level (→ gợi ý nhập hàng)."""
	ensure_cap("stock")
	out = {}
	# 1) manual statuses — still show the REAL on-hand (from Bin) so "Còn ít" has a concrete number.
	manual = frappe.get_all(
		"Item",
		filters={"disabled": 0, "is_stock_item": 1, "has_variants": 0, "cago_stock_auto": 0, "cago_stock_status_manual": ["in", LOW_STOCK_STATUSES]},
		fields=["name", "item_name", "cago_display_name", "cago_stock_status_manual", "cago_shelf_location", "stock_uom"],
		order_by="cago_stock_status_manual asc",
	)
	mqty = dto.bin_qty_map([r.name for r in manual])
	for r in manual:
		q = flt(mqty.get(r.name, 0))
		out[r.name] = {
			"item_code": r.name,
			"display_name": r.cago_display_name or r.item_name,
			"status": r.cago_stock_status_manual,
			"shelf_location": r.cago_shelf_location,
			"qty": f"{q:g} {r.stock_uom}",
		}
	# 2) auto items at/under reorder (or out of stock)
	auto = frappe.get_all(
		"Item",
		filters={"disabled": 0, "is_stock_item": 1, "has_variants": 0, "cago_stock_auto": 1},
		fields=["name", "item_name", "cago_display_name", "cago_reorder_level", "cago_shelf_location", "stock_uom"],
	)
	qty_map = dto.bin_qty_map([r.name for r in auto])
	for r in auto:
		qty = qty_map.get(r.name, 0)
		reorder = flt(r.cago_reorder_level)
		if qty <= 0 or (reorder and qty <= reorder):
			out[r.name] = {
				"item_code": r.name,
				"display_name": r.cago_display_name or r.item_name,
				"status": "Hết hàng" if qty <= 0 else "Còn ít",
				"shelf_location": r.cago_shelf_location,
				"qty": f"{flt(qty):g} {r.stock_uom}",
			}
	return sorted(out.values(), key=lambda x: x["status"])


@frappe.whitelist()
def best_sellers(limit=10, period="all", from_date=None, to_date=None):
	"""Top items by quantity sold. Period-scoped when asked (today/week/month/year/custom); defaults
	to all-time. Returns are excluded so a heavily-returned item isn't ranked as a best seller."""
	ensure_cap("reports")
	company = _company()
	si = frappe.qb.DocType("Sales Invoice")
	sii = frappe.qb.DocType("Sales Invoice Item")
	where = (si.docstatus == 1) & (si.company == company) & (si.is_return == 0)
	if period and period != "all":
		start, end, _ = _resolve(period, from_date, to_date)
		where = where & (si.posting_date >= start) & (si.posting_date <= end)
	rows = (
		frappe.qb.from_(sii)
		.join(si)
		.on(sii.parent == si.name)
		.select(sii.item_code, Sum(sii.stock_qty).as_("qty"))
		.where(where)
		.groupby(sii.item_code)
		.orderby(Sum(sii.stock_qty), order=Order.desc)
		.limit(int(limit))
	).run(as_dict=True)
	return [
		{
			"item_code": r.item_code,
			"display_name": frappe.db.get_value("Item", r.item_code, "cago_display_name")
			or frappe.db.get_value("Item", r.item_code, "item_name"),
			"qty": flt(r.qty),
		}
		for r in rows
	]


@frappe.whitelist()
def debt_list():
	ensure_cap("debt_view")
	customers = frappe.get_all("Customer", fields=["name", "customer_name", "cago_village", "cago_slug"])
	out = []
	for c in customers:
		bal = get_customer_debt(c.name)["outstanding"]
		if bal and bal > 0:
			out.append(
				{
					"customer": c.name,
					"slug": c.cago_slug or c.name,
					"customer_name": c.customer_name,
					"village": c.cago_village,
					"outstanding": bal,
					"outstanding_text": dto.format_price(bal),
				}
			)
	out.sort(key=lambda x: x["outstanding"], reverse=True)
	return out


@frappe.whitelist()
def unsafe_questions(days=14, limit=50):
	"""Chemical-safety questions the chatbot REFUSED (dosage/mixing/stronger/cách ly), recently.

	Every refused turn is logged with safety_flags; this surfaces them so the owner knows which
	customers asked something risky and may need advising in person — a safety + sales signal that
	is otherwise invisible. Read-only, owner/reports only; shows the customer phone when captured."""
	ensure_cap("reports")
	since = add_days(nowdate(), -int(days or 14))
	rows = frappe.get_all(
		"Cago Chatbot Log",
		filters={"safety_flags": ["!=", ""], "creation": [">=", since]},
		fields=["question", "safety_flags", "customer_phone", "role", "creation"],
		order_by="creation desc",
		limit=int(limit or 50),
	)
	_VN = {
		"dosage": "liều lượng", "mixing": "pha/trộn", "stronger_than_label": "tăng liều",
		"near_harvest": "cách ly thu hoạch", "misuse": "dùng sai mục đích", "medical": "y tế/thú y",
	}
	out = []
	for r in rows:
		flags = [f.strip() for f in (r.safety_flags or "").split(",") if f.strip()]
		out.append(
			{
				"question": r.question,
				"flags": flags,
				"flags_text": ", ".join(_VN.get(f, f) for f in flags),
				"phone": r.customer_phone or "",
				"when": format_date(r.creation),
			}
		)
	return out


@frappe.whitelist()
def daily_digest():
	"""Owner 'việc cần làm hôm nay': counts of low-stock items, soon-expiring batches, and
	customers owing. The underlying reports return full row lists; this only needs counts, so the
	result is cached per-user for a short TTL — the home screen is hit on every visit and these
	numbers don't change second-to-second (the alert screens themselves stay live)."""
	ensure_internal()
	from cago.api import inventory

	cache_key = f"cago_digest::{frappe.session.user}"
	cached = frappe.cache().get_value(cache_key)
	if cached is not None:
		return cached

	# Each section degrades to empty if the user lacks that capability — a debt-only staff sees
	# only debtors, a stock-only staff only low-stock/expiring. (PermissionError per inner guard.)
	def _safe(fn):
		try:
			return fn()
		except frappe.PermissionError:
			return []

	low = _safe(low_stock)
	debts = _safe(debt_list)
	expiring = _safe(inventory.expiring_soon)
	total_debt = sum(flt(d["outstanding"]) for d in debts)
	# Split "đang hết" (zero stock → can't sell, highest urgency) from "sắp hết" so the home can
	# flag them separately instead of burying lost-sales risk in one count.
	out_of_stock = sum(1 for r in low if r.get("status") == "Hết hàng")
	result = {
		"out_of_stock": out_of_stock,
		"low_stock": len(low) - out_of_stock,
		"expiring": len(expiring),
		"debtors": len(debts),
		"debt_total_text": dto.format_price(total_debt) if total_debt else "0đ",
		"has_tasks": bool(low or expiring or debts),
	}
	frappe.cache().set_value(cache_key, result, expires_in_sec=120)
	return result
