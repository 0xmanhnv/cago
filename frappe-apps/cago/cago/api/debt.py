# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Debt API — công nợ (owner-only).

Simple Vietnamese-facing wrappers over ERPNext accounting:
- get_customer_debt : outstanding receivable for a customer
- record_debt       : customer takes goods on credit (Journal Entry: Dr Debtors / Cr Income)
- record_repayment  : customer pays (Payment Entry: Receive, on account)

Every write logs an Cago Owner Action Log entry. ERPNext remains the source of
truth for balances.
"""

import frappe
from frappe import _
from frappe.utils import flt

from cago.cago.doctype.cago_owner_action_log.cago_owner_action_log import (
	record_action,
)
from cago.customer import resolve_customer
from cago.utils import dto
from cago.utils.permissions import ensure_lang, ensure_owner
from cago.utils.privileged import as_user


def _company():
	company = frappe.defaults.get_global_default("company") or frappe.db.get_value("Company", {}, "name")
	if not company:
		frappe.throw(_("Chưa thiết lập công ty. Hãy chạy thiết lập ban đầu."))
	return company


def _receivable_account(company):
	acc = frappe.db.get_value("Company", company, "default_receivable_account")
	if not acc:
		frappe.throw(_("Công ty chưa có tài khoản công nợ phải thu."))
	return acc


def _submit_privileged(doc):
	"""Insert + submit a trusted accounting document.

	The API is already authorized via ensure_owner(), but ERPNext helpers like
	PaymentEntry.get_account_details call frappe.has_permission("Account") directly,
	which a Cago Owner (no ERPNext accounting role) fails. So we run the write as
	Administrator and restore the real user immediately after, keeping least-privilege
	roles while still booking the entry. The business audit (Cago Owner Action Log)
	is written by the caller as the real user.
	"""
	with as_user("Administrator"):
		doc.flags.ignore_permissions = True
		doc.insert(ignore_permissions=True)
		doc.submit()
	return doc


@frappe.whitelist()
def search_customers(query=None):
	ensure_owner()
	query = (query or "").strip()
	filters = {}
	or_filters = None
	if query:
		like = f"%{query}%"
		or_filters = [["customer_name", "like", like], ["name", "like", like], ["cago_village", "like", like]]
	rows = frappe.get_all(
		"Customer",
		filters=filters,
		or_filters=or_filters,
		fields=["name", "customer_name", "cago_village", "mobile_no"],
		limit=24,
		order_by="customer_name asc",
	)
	out = []
	for r in rows:
		out.append(
			{
				"customer": r.name,
				"customer_name": r.customer_name,
				"village": r.cago_village,
				"mobile": r.mobile_no,
				"debt": get_customer_debt(r.name)["outstanding"],
			}
		)
	return out


def _debt_summary(customer):
	"""Guard-free outstanding summary, INTERNAL only (called by record_repayment after its own
	ensure_can_collect_debt guard). Not whitelisted — must never be reachable directly, or any
	authenticated session could read any customer's balance."""
	from erpnext.accounts.utils import get_balance_on

	balance = flt(get_balance_on(party_type="Customer", party=customer, date=frappe.utils.nowdate(), company=_company()))
	return {
		"customer": customer,
		"customer_name": frappe.db.get_value("Customer", customer, "customer_name"),
		"outstanding": balance,
		"outstanding_text": dto.format_price(balance) if balance else "Không nợ",
	}


def get_customer_debt(customer):
	ensure_owner()
	customer = resolve_customer(customer)
	if not frappe.db.exists("Customer", customer):
		frappe.throw(_("Không tìm thấy khách hàng."))
	company = _company()
	from erpnext.accounts.utils import get_balance_on

	balance = get_balance_on(
		party_type="Customer",
		party=customer,
		date=frappe.utils.nowdate(),
		company=company,
	)
	balance = flt(balance)
	limit = flt(frappe.db.get_value("Customer", customer, "cago_debt_limit"))
	return {
		"customer": customer,
		"customer_name": frappe.db.get_value("Customer", customer, "customer_name"),
		"outstanding": balance,
		"outstanding_text": dto.format_price(balance) if balance else "Không nợ",
		"debt_limit": limit,
		"debt_limit_text": dto.format_price(limit) if limit else "",
		"points": int(flt(frappe.db.get_value("Customer", customer, "cago_points"))),
		"wholesale": bool(frappe.db.get_value("Customer", customer, "cago_wholesale")),
	}


@frappe.whitelist()
def record_debt(customer, amount, note=None):
	"""Customer takes goods on credit. Increases receivable via a Journal Entry."""
	ensure_owner()
	ensure_lang()
	customer = resolve_customer(customer)
	if not frappe.db.exists("Customer", customer):
		frappe.throw(_("Không tìm thấy khách hàng."))
	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Số tiền phải lớn hơn 0."))

	# Credit limit (hạn mức nợ): block if this would push outstanding over the limit.
	limit = flt(frappe.db.get_value("Customer", customer, "cago_debt_limit"))
	if limit:
		current = flt(get_customer_debt(customer)["outstanding"])
		if current + amount > limit:
			frappe.throw(
				_("Vượt hạn mức nợ {0} (đang nợ {1}, ghi thêm {2}).").format(
					dto.format_price(limit), dto.format_price(current), dto.format_price(amount)
				)
			)

	company = _company()
	receivable = _receivable_account(company)
	income = frappe.db.get_value("Company", company, "default_income_account") or frappe.db.get_value(
		"Account", {"company": company, "account_name": "Sales"}, "name"
	)
	if not income:
		frappe.throw(_("Công ty chưa có tài khoản doanh thu."))

	je = frappe.get_doc(
		{
			"doctype": "Journal Entry",
			"voucher_type": "Journal Entry",
			"company": company,
			"posting_date": frappe.utils.nowdate(),
			"user_remark": note or f"Ghi nợ khách {customer}",
			"accounts": [
				{"account": receivable, "party_type": "Customer", "party": customer, "debit_in_account_currency": amount},
				{"account": income, "credit_in_account_currency": amount},
			],
		}
	)
	_submit_privileged(je)
	record_action("Debt Add", ref_doctype="Journal Entry", ref_name=je.name, new_value=amount)
	frappe.db.commit()
	return get_customer_debt(customer)


def ensure_can_collect_debt():
	"""Owner always; staff only when the owner enabled it on the Company. Returns the actor."""
	from cago.utils.permissions import is_owner, is_staff

	if is_owner():
		return frappe.session.user
	if is_staff() and frappe.db.get_value("Company", _company(), "cago_staff_can_collect_debt"):
		return frappe.session.user
	frappe.throw(_("Bạn không có quyền thu nợ. Liên hệ chủ cửa hàng để bật chức năng này."), frappe.PermissionError)


@frappe.whitelist()
def record_repayment(customer, amount, note=None):
	"""Customer pays. Decreases receivable via an on-account Payment Entry (Receive).
	Owner always; staff when allowed (cago_staff_can_collect_debt) — the cash then counts in
	that cashier's till shift and the collector is stamped on the Payment Entry."""
	cashier = ensure_can_collect_debt()
	ensure_lang()
	customer = resolve_customer(customer)
	if not frappe.db.exists("Customer", customer):
		frappe.throw(_("Không tìm thấy khách hàng."))
	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Số tiền phải lớn hơn 0."))

	company = _company()
	receivable = _receivable_account(company)
	cash = frappe.db.get_value("Company", company, "default_cash_account") or frappe.db.get_value(
		"Account", {"company": company, "account_name": "Cash"}, "name"
	)
	if not cash:
		frappe.throw(_("Công ty chưa có tài khoản tiền mặt."))

	pe = frappe.get_doc(
		{
			"doctype": "Payment Entry",
			"payment_type": "Receive",
			"company": company,
			"posting_date": frappe.utils.nowdate(),
			"party_type": "Customer",
			"party": customer,
			"paid_from": receivable,
			"paid_to": cash,
			"paid_amount": amount,
			"received_amount": amount,
			"reference_no": note or "Khách trả nợ",
			"reference_date": frappe.utils.nowdate(),
			"cago_cashier": cashier,  # who collected — for the till shift + audit
		}
	)
	_submit_privileged(pe)
	record_action("Debt Payment", ref_doctype="Payment Entry", ref_name=pe.name, new_value=amount)
	frappe.db.commit()
	# _debt_summary is guard-free so a staff collector can read the new balance back
	# (get_customer_debt is owner-only and would throw for staff).
	return _debt_summary(customer)


@frappe.whitelist()
def add_customer(customer_name, phone=None, village=None, debt_limit=None, wholesale=0):
	"""Create a new customer from the simplified owner UI (e.g. during Ghi nợ)."""
	ensure_owner()
	from frappe.utils import cint

	name = (customer_name or "").strip()
	if not name:
		frappe.throw(_("Nhập tên khách hàng."))

	from cago.chatbot.observability import clean_phone

	mobile = clean_phone(phone)  # '' if not a valid VN mobile
	doc = frappe.get_doc(
		{
			"doctype": "Customer",
			"customer_name": name,
			"customer_type": "Individual",
			"cago_village": (village or "").strip() or None,
			"mobile_no": mobile or None,
			"cago_zalo_phone": mobile or None,
			"cago_debt_limit": flt(debt_limit) or 0,
			"cago_wholesale": 1 if cint(wholesale) else 0,
		}
	)
	# Defaults so Customer validation passes on a fresh site.
	group = frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
	territory = frappe.db.get_value("Territory", {"is_group": 0}, "name")
	if group:
		doc.customer_group = group
	if territory:
		doc.territory = territory
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"customer": doc.name, "customer_name": name}


@frappe.whitelist()
def set_wholesale(customer, on):
	"""Owner: mark a customer as wholesale (mua theo giá sỉ) or not."""
	ensure_owner()
	from frappe.utils import cint

	customer = resolve_customer(customer)
	if not frappe.db.exists("Customer", customer):
		frappe.throw(_("Không tìm thấy khách hàng."))
	val = 1 if cint(on) else 0
	frappe.db.set_value("Customer", customer, "cago_wholesale", val)
	frappe.db.commit()
	return {"customer": customer, "wholesale": bool(val)}


@frappe.whitelist()
def get_customer_ledger(customer):
	"""Debt history for one customer: each ghi nợ / trả nợ with a running balance."""
	ensure_owner()
	customer = resolve_customer(customer)
	if not frappe.db.exists("Customer", customer):
		frappe.throw(_("Không tìm thấy khách hàng."))
	rows = frappe.get_all(
		"GL Entry",
		filters={"party_type": "Customer", "party": customer, "is_cancelled": 0, "company": _company()},
		fields=["posting_date", "voucher_type", "voucher_no", "debit", "credit"],
		order_by="posting_date asc, creation asc",
	)
	entries, balance = [], 0.0
	for r in rows:
		debit, credit = flt(r.debit), flt(r.credit)
		balance += debit - credit
		is_debt = debit >= credit
		amount = debit if is_debt else credit
		entries.append(
			{
				"date": str(r.posting_date),
				"type": "debt" if is_debt else "payment",
				"label": "Ghi nợ (lấy hàng)" if is_debt else "Khách trả nợ",
				"amount": amount,
				"amount_text": dto.format_price(amount),
				"balance": balance,
				"balance_text": dto.format_price(balance) if balance else "0đ",
				"voucher_type": r.voucher_type,
				"voucher_no": r.voucher_no,
			}
		)
	entries.reverse()  # newest first for display
	cust = get_customer_debt(customer)
	return {
		"customer": customer,
		"customer_name": cust["customer_name"],
		"outstanding": cust["outstanding"],
		"outstanding_text": cust["outstanding_text"],
		"overpaid": cust["outstanding"] < 0,
		"points": cust["points"],
		"wholesale": cust["wholesale"],
		"entries": entries,
	}


@frappe.whitelist()
def cancel_entry(voucher_type, voucher_no, customer=None):
	"""Cancel a mistaken debt/payment voucher (Journal Entry / Payment Entry)."""
	ensure_owner()
	ensure_lang()
	customer = resolve_customer(customer) if customer else customer
	if voucher_type not in ("Journal Entry", "Payment Entry"):
		frappe.throw(_("Chỉ huỷ được bút toán ghi nợ / trả nợ."))
	if not frappe.db.exists(voucher_type, voucher_no):
		frappe.throw(_("Không tìm thấy bút toán."))
	# Scope guard: only vouchers that post to a Customer party (i.e. belong to a debt
	# ledger) may be cancelled — and, when given, only for that customer. Without this an
	# owner could cancel ANY Journal/Payment Entry in the company by guessing its name.
	gl = frappe.get_all(
		"GL Entry",
		filters={"voucher_type": voucher_type, "voucher_no": voucher_no, "party_type": "Customer", "is_cancelled": 0},
		fields=["party"],
		limit=1,
	)
	if not gl:
		frappe.throw(_("Bút toán này không thuộc công nợ khách hàng."))
	if customer and gl[0].party != customer:
		frappe.throw(_("Bút toán không thuộc khách hàng này."))
	doc = frappe.get_doc(voucher_type, voucher_no)
	# Privileged cancel (owner lacks ERPNext accounting perms); audit keeps the real user.
	with as_user("Administrator"):
		doc.flags.ignore_permissions = True
		doc.cancel()
	record_action("Other", ref_doctype=voucher_type, ref_name=voucher_no, new_value="cancelled")
	frappe.db.commit()
	return get_customer_debt(customer) if customer else {"cancelled": voucher_no}
