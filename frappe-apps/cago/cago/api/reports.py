# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Reports API — báo cáo (owner-only).

Lightweight summaries for the owner home: today's sales, low stock, best sellers,
and the debt list. Read-only.
"""

import re

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
	# Distinct customers + average per bill (richer KPI row, learnt from a polished VN POS report).
	# Exclude the shared "Khách lẻ" walk-in record — it's a real Customer (never empty), so without this
	# every anonymous cash sale would count as the same +1 "customer", making the KPI meaningless.
	cust = frappe.db.sql(
		"""select count(distinct customer) from `tabSales Invoice`
		   where docstatus=1 and is_return=0 and company=%s and posting_date>=%s and posting_date<=%s
		     and ifnull(customer,'')!='' and ifnull(customer_name,'')!=%s""",
		(company, start, end, dto.WALKIN_NAME),
	)
	customer_count = (cust[0][0] if cust and cust[0] else 0) or 0
	avg = (total / count) if count else 0
	return {
		"period": period,
		"period_label": label,
		"from": start,
		"to": end,
		"sales_total": total,
		"sales_total_text": dto.format_price(total) if total else "0đ",
		"invoice_count": count,
		"customer_count": customer_count,
		"avg_text": dto.format_price(avg) if avg else "0đ",
	}


@frappe.whitelist()
def revenue_by_hour(date=None):
	"""Net sales per hour for `date` (default today) and the day before — for the trend chart
	(Hôm nay vs Hôm qua). Lightweight: two 24-slot arrays the frontend draws as an SVG line."""
	ensure_cap("reports")
	from frappe.utils import add_days, getdate, nowdate

	d = getdate(date or nowdate())
	prev = add_days(d, -1)
	company = _company()

	def buckets(day):
		arr = [0.0] * 24
		for r in frappe.db.sql(
			"""select hour(posting_time) h, sum(grand_total) v from `tabSales Invoice`
			   where docstatus=1 and company=%s and posting_date=%s group by hour(posting_time)""",
			(company, day),
			as_dict=1,
		):
			h = int(r.h or 0)
			if 0 <= h <= 23:
				arr[h] = flt(r.v)
		return arr

	today, yest = buckets(d), buckets(prev)
	return {
		"date": str(d),
		"today": today,
		"yesterday": yest,
		"max": max(max(today), max(yest), 1),
		"today_total_text": dto.format_price(sum(today)) if sum(today) else "0đ",
		"yesterday_total_text": dto.format_price(sum(yest)) if sum(yest) else "0đ",
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


def _norm_q(q):
	"""Normalise a question for clustering: lowercase, strip Vietnamese accents + punctuation, collapse
	spaces. So 'Cám gà bao nhiêu?' / 'cam ga bao nhieu' land in the same bucket."""
	from cago.chatbot.deterministic import _norm

	return " ".join((_norm(q) or "").split())


_GENERIC_Q_RE = re.compile(
	r"(còn\s*hàng|còn\s*ko|còn\s*không|hết\s*hàng|có\s*sẵn|có\s*hàng|giá\s*bao\s*nhiêu|bao\s*nhiêu\s*tiền|"
	r"bao\s*nhiêu|nhiêu\s*tiền|ở\s*đâu|để\s*đâu|chỗ\s*nào|còn|không|\bko\b|hàng|giá|\bcó\b|sẵn|tiền|"
	r"\bạ\b|vậy|thế|nhỉ|cho\s*hỏi|hỏi|cái\s*này|sản\s*phẩm\s*này|nó)",
	re.IGNORECASE | re.UNICODE,
)


def _context_dependent(q):
	"""True for a bare stock / price / location question that names NO product (e.g. 'còn hàng
	không?', 'giá bao nhiêu?', 'để đâu?'). The assistant already answers these from the product the
	customer is VIEWING (focus_item) — so they're NOT a knowledge gap and must not be turned into a
	static FAQ (the answer changes per product). Heuristic: strip the generic words; if nothing
	meaningful remains, it's context-dependent."""
	s = re.sub(r"[^\w\s]", " ", q or "", flags=re.UNICODE)  # drop punctuation (keep VN letters)
	s = _GENERIC_Q_RE.sub(" ", s)
	return len(re.sub(r"\s+", "", s)) < 3  # no product noun left over


@frappe.whitelist()
def assistant_insights(days=1, limit=12):
	"""What the assistant was asked recently, so the owner can teach it: the most-asked questions
	(→ FAQ / suggestion chips) and the GAPS (questions it couldn't answer / refused → the owner adds
	a product, a nickname, or label instructions). Deterministic frequency clustering over the chat
	log (no LLM needed); customer-facing turns only."""
	ensure_cap("reports")
	from frappe.utils import add_days, nowdate

	since = add_days(nowdate(), -(int(days or 1) - 1)) + " 00:00:00"
	rows = frappe.get_all(
		"Cago Chatbot Log",
		filters={"creation": [">=", since], "role": ["!=", "staff"]},
		fields=["question", "needs_staff_help", "safety_flags", "provider"],
		limit=5000,
	)
	groups = {}
	for r in rows:
		q = (r.question or "").strip()
		if len(q) < 3:
			continue
		key = _norm_q(q)
		if not key:
			continue
		g = groups.setdefault(key, {"sample": q, "count": 0, "gap": 0, "safety": 0})
		g["count"] += 1
		if r.needs_staff_help or r.provider in ("refused", "no_data"):
			g["gap"] += 1
		if (r.safety_flags or "").strip():
			g["safety"] += 1
	lim = int(limit or 12)
	top = sorted(groups.values(), key=lambda g: -g["count"])[:lim]
	# Drop context-dependent generic questions (còn hàng?/giá?/ở đâu? with no product named): the
	# assistant answers those from the focused product, so they're not a gap to write a static FAQ for.
	gaps = sorted([g for g in groups.values() if g["gap"] and not _context_dependent(g["sample"])], key=lambda g: -g["gap"])[:lim]
	return {
		"total": len(rows),
		"top": [{"q": g["sample"], "count": g["count"]} for g in top],
		"gaps": [{"q": g["sample"], "count": g["gap"], "safety": bool(g["safety"])} for g in gaps],
	}


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
