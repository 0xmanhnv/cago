# Copyright (c) 2026, 0xManhnv
"""Customer directory + profile (Thông tin khách hàng).

A general customer hub on top of the existing debt-centric helpers: list/search every customer, view a
full profile (info + lifetime stats + recent orders) and edit it. Staff-safe — it only ever surfaces
SALE totals (revenue the customer paid), never cost / valuation / margin. Read = debt_view cap, write =
debt cap (the same tier that already creates customers + records debt)."""

import re

import frappe
from frappe import _
from frappe.utils import cint, flt

from cago.api.debt import get_customer_debt, resolve_customer
from cago.utils import dto
from cago.utils.permissions import ensure_cap, ensure_lang

_FIELDS = [
	"customer_name",
	"cago_nickname",
	"mobile_no",
	"email_id",
	"cago_village",
	"customer_group",
	"cago_slug",
	"cago_note",
	"cago_debt_limit",
	"cago_wholesale",
	"cago_points",
	"cago_unverified",
]


def _money(v):
	"""VND for a STAT amount: 0 → '0đ' (unlike dto.format_price which reads 0 as 'Liên hệ')."""
	return f"{int(round(flt(v))):,}".replace(",", ".") + "đ"


def _profile_row(c):
	info = frappe.db.get_value("Customer", c, _FIELDS, as_dict=True) or {}
	limit = flt(info.cago_debt_limit)
	return {
		"customer": c,
		"slug": info.cago_slug or c,
		"customer_name": info.customer_name or c,
		"nickname": info.cago_nickname or "",
		"mobile": info.mobile_no or "",
		"email": info.email_id or "",
		"village": info.cago_village or "",
		"group": info.customer_group or "",
		"note": info.cago_note or "",
		"debt_limit": limit,
		"debt_limit_text": dto.format_price(limit) if limit else "Không giới hạn",
		"wholesale": bool(info.cago_wholesale),
		"points": cint(info.cago_points),
		"unverified": bool(info.cago_unverified),
	}


@frappe.whitelist()
def list_customers(query=None, start=0, limit=30):
	"""The customer directory — search by name / tên thường gọi / SĐT / xóm; each row carries the live
	outstanding so the list can flag who owes."""
	ensure_cap("debt_view")
	query = (query or "").strip()
	or_filters = None
	if query:
		like = f"%{query}%"
		or_filters = [
			["customer_name", "like", like],
			["cago_nickname", "like", like],
			["mobile_no", "like", like],
			["cago_village", "like", like],
			["name", "like", like],
		]
	limit = max(1, min(cint(limit) or 30, 100))
	rows = frappe.get_all(
		"Customer",
		or_filters=or_filters,
		fields=["name", "customer_name", "cago_nickname", "mobile_no", "cago_village", "cago_slug"],
		order_by="customer_name asc",
		start=cint(start),
		page_length=limit + 1,
	)
	has_more = len(rows) > limit
	rows = rows[:limit]
	out = [
		{
			"customer": r.name,
			"slug": r.cago_slug or r.name,
			"customer_name": r.customer_name or r.name,
			"nickname": r.cago_nickname or "",
			"mobile": r.mobile_no or "",
			"village": r.cago_village or "",
			"outstanding": get_customer_debt(r.name)["outstanding"],
		}
		for r in rows
	]
	return {"rows": out, "has_more": has_more}


@frappe.whitelist()
def get_customer_profile(customer):
	"""Full profile: info + lifetime stats (total spent / order count / last purchase) + recent orders.
	Sale TOTALS only — never cost/margin."""
	ensure_cap("debt_view")
	ensure_lang()
	c = resolve_customer(customer)
	if not c or not frappe.db.exists("Customer", c):
		frappe.throw(_("Không tìm thấy khách hàng."))
	prof = _profile_row(c)
	debt = get_customer_debt(c)
	prof["outstanding"] = debt.get("outstanding")
	prof["outstanding_text"] = debt.get("outstanding_text")
	# Lifetime stats over submitted, non-return sales. Parameterised SQL (Frappe v16 rejects aggregate
	# strings in get_all fields; %s keeps it injection-safe).
	agg = frappe.db.sql(
		"""select coalesce(sum(grand_total), 0) as total, count(name) as cnt, max(posting_date) as last
		   from `tabSales Invoice` where customer = %s and docstatus = 1 and is_return = 0""",
		(c,),
		as_dict=True,
	)
	a = agg[0] if agg else {}
	prof["total_spent_text"] = _money(a.get("total"))
	prof["order_count"] = cint(a.get("cnt"))
	prof["last_purchase"] = str(a.get("last")) if a.get("last") else ""
	# Recent orders (incl. returns, flagged) — a quick activity view.
	recent = frappe.get_all(
		"Sales Invoice",
		filters={"customer": c, "docstatus": 1},
		fields=["name", "posting_date", "grand_total", "is_return", "outstanding_amount"],
		order_by="posting_date desc, posting_time desc",
		limit=6,
	)
	prof["recent_orders"] = [
		{
			"invoice": r.name,
			"date": str(r.posting_date),
			"total_text": dto.format_price(flt(r.grand_total)),
			"is_return": bool(r.is_return),
			"unpaid": flt(r.outstanding_amount) > 0.5,
		}
		for r in recent
	]
	return prof


@frappe.whitelist()
def update_customer(
	customer,
	customer_name=None,
	nickname=None,
	mobile=None,
	email=None,
	village=None,
	group=None,
	note=None,
	debt_limit=None,
	wholesale=None,
):
	"""Edit a customer's profile (Cập nhật). Phone is kept unique so debt/Zalo lookups stay unambiguous."""
	ensure_cap("debt")
	c = resolve_customer(customer)
	if not c or not frappe.db.exists("Customer", c):
		frappe.throw(_("Không tìm thấy khách hàng."))
	doc = frappe.get_doc("Customer", c)
	if customer_name is not None and customer_name.strip():
		doc.customer_name = customer_name.strip()
	if nickname is not None:
		doc.cago_nickname = nickname.strip()
	if mobile is not None:
		m = re.sub(r"[^\d+]", "", mobile.strip())
		if m and frappe.db.get_value("Customer", {"mobile_no": m, "name": ["!=", c]}, "name"):
			frappe.throw(_("Số điện thoại này đã gắn với khách khác."))
		doc.mobile_no = m
	if email is not None:
		doc.email_id = email.strip()
	if village is not None:
		doc.cago_village = village.strip()
	if note is not None:
		doc.cago_note = note.strip()
	if group is not None and group.strip() and frappe.db.exists("Customer Group", group.strip()):
		doc.customer_group = group.strip()
	if debt_limit is not None:
		doc.cago_debt_limit = max(0.0, flt(debt_limit))
	if wholesale is not None:
		doc.cago_wholesale = 1 if cint(wholesale) else 0
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return get_customer_profile(c)


@frappe.whitelist()
def create_customer(customer_name, mobile=None, nickname=None, email=None, village=None, group=None, note=None, debt_limit=None, wholesale=None):
	"""Create a customer with the full profile in one go; returns the new profile (so the UI can open it)."""
	ensure_cap("debt")
	ensure_lang()
	name = (customer_name or "").strip()
	if not name:
		frappe.throw(_("Nhập tên khách hàng."))
	m = re.sub(r"[^\d+]", "", (mobile or "").strip())
	if m and frappe.db.get_value("Customer", {"mobile_no": m}, "name"):
		frappe.throw(_("Số điện thoại này đã gắn với khách khác."))
	doc = frappe.new_doc("Customer")
	doc.customer_name = name
	doc.customer_type = "Individual"
	if m:
		doc.mobile_no = m
	if nickname:
		doc.cago_nickname = nickname.strip()
	if email:
		doc.email_id = email.strip()
	if village:
		doc.cago_village = village.strip()
	if note:
		doc.cago_note = note.strip()
	if debt_limit is not None:
		doc.cago_debt_limit = max(0.0, flt(debt_limit))
	if wholesale is not None:
		doc.cago_wholesale = 1 if cint(wholesale) else 0
	# Group + territory: honour the picked group, else fall back to a leaf default so validation passes.
	grp = (group or "").strip()
	doc.customer_group = grp if grp and frappe.db.exists("Customer Group", grp) else frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
	doc.territory = frappe.db.get_value("Territory", {"is_group": 0}, "name")
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return get_customer_profile(doc.name)


@frappe.whitelist()
def customer_groups():
	"""Nhóm khách hàng options (leaf groups) for the profile editor."""
	ensure_cap("debt_view")
	return [g.name for g in frappe.get_all("Customer Group", filters={"is_group": 0}, fields=["name"], order_by="name asc")]
