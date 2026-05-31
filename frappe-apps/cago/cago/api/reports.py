# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Reports API — báo cáo (owner-only).

Lightweight summaries for the owner home: today's sales, low stock, best sellers,
and the debt list. Read-only.
"""

import frappe
from frappe.query_builder import Order
from frappe.query_builder.functions import Count, Sum
from frappe.utils import add_days, flt, get_first_day, nowdate

from cago.api.debt import get_customer_debt
from cago.utils import dto
from cago.utils.permissions import ensure_owner

LOW_STOCK_STATUSES = ["Còn ít", "Hết hàng", "Sắp nhập"]
PERIOD_LABEL = {"today": "Hôm nay", "week": "7 ngày qua", "month": "Tháng này"}


def _period_range(period):
	today = nowdate()
	if period == "week":
		return add_days(today, -6), today
	if period == "month":
		return str(get_first_day(today)), today
	return today, today


@frappe.whitelist()
def period_summary(period="today"):
	"""Sales summary for today / week / month."""
	ensure_owner()
	if period not in PERIOD_LABEL:
		period = "today"
	start, end = _period_range(period)
	si = frappe.qb.DocType("Sales Invoice")
	res = (
		frappe.qb.from_(si)
		.select(Sum(si.grand_total), Count(si.name))
		.where((si.docstatus == 1) & (si.posting_date >= start) & (si.posting_date <= end))
	).run()
	total = flt(res[0][0]) if res and res[0] else 0
	count = (res[0][1] if res and res[0] else 0) or 0
	return {
		"period": period,
		"period_label": PERIOD_LABEL[period],
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
def payment_split(period="today"):
	"""Tiền mặt / chuyển khoản / khác (từ thanh toán POS) + ghi nợ (outstanding)."""
	ensure_owner()
	if period not in PERIOD_LABEL:
		period = "today"
	start, end = _period_range(period)
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
		.where((si.docstatus == 1) & (si.posting_date >= start) & (si.posting_date <= end))
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
		.where((si.docstatus == 1) & (si.posting_date >= start) & (si.posting_date <= end))
	).run()
	credit = flt(res[0][0]) if res and res[0] else 0

	def _t(v):
		return dto.format_price(v) if v else "0đ"

	return {
		"period": period,
		"period_label": PERIOD_LABEL[period],
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
def low_stock():
	ensure_owner()
	rows = frappe.get_all(
		"Item",
		filters={"disabled": 0, "cago_stock_status_manual": ["in", LOW_STOCK_STATUSES]},
		fields=["name", "item_name", "cago_display_name", "cago_stock_status_manual", "cago_shelf_location"],
		order_by="cago_stock_status_manual asc",
	)
	return [
		{
			"item_code": r.name,
			"display_name": r.cago_display_name or r.item_name,
			"status": r.cago_stock_status_manual,
			"shelf_location": r.cago_shelf_location,
		}
		for r in rows
	]


@frappe.whitelist()
def best_sellers(limit=10):
	ensure_owner()
	si = frappe.qb.DocType("Sales Invoice")
	sii = frappe.qb.DocType("Sales Invoice Item")
	rows = (
		frappe.qb.from_(sii)
		.join(si)
		.on(sii.parent == si.name)
		.select(sii.item_code, Sum(sii.qty).as_("qty"))
		.where(si.docstatus == 1)
		.groupby(sii.item_code)
		.orderby(Sum(sii.qty), order=Order.desc)
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
	ensure_owner()
	customers = frappe.get_all("Customer", fields=["name", "customer_name", "cago_village"])
	out = []
	for c in customers:
		bal = get_customer_debt(c.name)["outstanding"]
		if bal and bal > 0:
			out.append(
				{
					"customer": c.name,
					"customer_name": c.customer_name,
					"village": c.cago_village,
					"outstanding": bal,
					"outstanding_text": dto.format_price(bal),
				}
			)
	out.sort(key=lambda x: x["outstanding"], reverse=True)
	return out
