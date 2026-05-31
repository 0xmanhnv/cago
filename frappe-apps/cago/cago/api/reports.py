# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Reports API — báo cáo (owner-only).

Lightweight summaries for the owner home: today's sales, low stock, best sellers,
and the debt list. Read-only.
"""

import frappe
from frappe.query_builder import Order
from frappe.query_builder.functions import Count, Sum
from frappe.utils import add_days, cint, flt, get_first_day, nowdate

from cago.api.debt import get_customer_debt
from cago.utils import dto
from cago.utils.permissions import ensure_owner

LOW_STOCK_STATUSES = ["Còn ít", "Hết hàng", "Sắp nhập"]
PERIOD_LABEL = {"today": "Hôm nay", "week": "7 ngày qua", "month": "Tháng này"}


def _company():
	return frappe.defaults.get_global_default("company") or (frappe.get_all("Company", pluck="name") or [None])[0]


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
	company = _company()
	si = frappe.qb.DocType("Sales Invoice")
	res = (
		frappe.qb.from_(si)
		.select(Sum(si.grand_total), Count(si.name))
		.where((si.docstatus == 1) & (si.company == company) & (si.posting_date >= start) & (si.posting_date <= end))
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
def sales_by_customer(period="month", limit=10):
	"""Owner-only: top customers by sales total in the period."""
	ensure_owner()
	if period not in PERIOD_LABEL:
		period = "month"
	start, end = _period_range(period)
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
def gross_profit(period="today"):
	"""Owner-only gross profit = doanh thu (net) − giá vốn (COGS). COGS uses the Sales
	Invoice Item incoming_rate (set when stock is maintained). Never exposed to staff/kiosk."""
	ensure_owner()
	if period not in PERIOD_LABEL:
		period = "today"
	start, end = _period_range(period)
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
		"period_label": PERIOD_LABEL[period],
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
	ensure_owner()
	out = {}
	# 1) manual statuses
	for r in frappe.get_all(
		"Item",
		filters={"disabled": 0, "cago_stock_auto": 0, "cago_stock_status_manual": ["in", LOW_STOCK_STATUSES]},
		fields=["name", "item_name", "cago_display_name", "cago_stock_status_manual", "cago_shelf_location"],
		order_by="cago_stock_status_manual asc",
	):
		out[r.name] = {
			"item_code": r.name,
			"display_name": r.cago_display_name or r.item_name,
			"status": r.cago_stock_status_manual,
			"shelf_location": r.cago_shelf_location,
			"qty": None,
		}
	# 2) auto items at/under reorder (or out of stock)
	auto = frappe.get_all(
		"Item",
		filters={"disabled": 0, "cago_stock_auto": 1},
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
def best_sellers(limit=10):
	ensure_owner()
	company = _company()
	si = frappe.qb.DocType("Sales Invoice")
	sii = frappe.qb.DocType("Sales Invoice Item")
	rows = (
		frappe.qb.from_(sii)
		.join(si)
		.on(sii.parent == si.name)
		.select(sii.item_code, Sum(sii.qty).as_("qty"))
		.where((si.docstatus == 1) & (si.company == company))
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
