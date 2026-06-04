# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Công nợ nhà cung cấp — supplier payables (owner-only).

Mirror of the customer side, done correctly on the buy side:
- credit_purchase : nhập hàng trả sau = a submitted, UNPAID Purchase Invoice (update_stock)
  → on-hand goes UP, payable (Creditors) goes up, cost recorded. No double counting.
- pay_supplier    : trả tiền NCC = Payment Entry (Pay) reducing the payable.

Privileged submit (owner lacks ERPNext buying/accounting perms; ERPNext still validates).
ERPNext remains the source of truth for balances.
"""

import frappe
from frappe import _
from frappe.utils import flt, nowdate

from cago.api import debt
from cago.cago.doctype.cago_owner_action_log.cago_owner_action_log import record_action
from cago.utils import dto
from cago.utils.permissions import ensure_cap, ensure_lang


def _warehouse():
	company = debt._company()
	for wh in ("Stores", "Finished Goods"):
		w = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0, "warehouse_name": wh}, "name")
		if w:
			return w
	return frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")


def _payable_account(company):
	acc = frappe.db.get_value("Company", company, "default_payable_account")
	if not acc:
		acc = frappe.db.get_value("Account", {"company": company, "account_type": "Payable", "is_group": 0}, "name")
	if not acc:
		frappe.throw(_("Công ty chưa có tài khoản công nợ phải trả."))
	return acc


def _supplier_outstanding(supplier):
	"""How much we owe a supplier = credit − debit on their party GL (positive = we owe)."""
	rows = frappe.get_all(
		"GL Entry",
		filters={"party_type": "Supplier", "party": supplier, "is_cancelled": 0, "company": debt._company()},
		fields=["debit", "credit"],
	)
	return flt(sum(flt(r.credit) - flt(r.debit) for r in rows))


@frappe.whitelist()
def search_suppliers(query=None):
	ensure_cap("supplier")
	query = (query or "").strip()
	or_filters = [["supplier_name", "like", f"%{query}%"], ["name", "like", f"%{query}%"]] if query else None
	rows = frappe.get_all(
		"Supplier", filters={"disabled": 0}, or_filters=or_filters, fields=["name", "supplier_name", "mobile_no"], limit=24, order_by="supplier_name asc"
	)
	out = []
	for r in rows:
		bal = _supplier_outstanding(r.name)
		out.append(
			{"supplier": r.name, "supplier_name": r.supplier_name, "mobile": r.mobile_no, "debt": bal, "debt_text": dto.format_price(bal) if bal > 0 else "Không nợ"}
		)
	return out


@frappe.whitelist()
def add_supplier(supplier_name, phone=None, note=None):
	ensure_cap("supplier")
	name = (supplier_name or "").strip()
	if not name:
		frappe.throw(_("Nhập tên nhà cung cấp."))
	from cago.chatbot.observability import clean_phone

	doc = frappe.get_doc({"doctype": "Supplier", "supplier_name": name, "supplier_type": "Company", "mobile_no": clean_phone(phone) or None})
	group = frappe.db.get_value("Supplier Group", {"is_group": 0}, "name")
	if group:
		doc.supplier_group = group
	if note is not None:
		doc.cago_supplier_note = (note or "").strip() or None
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"supplier": doc.name, "supplier_name": name}


@frappe.whitelist()
def list_suppliers():
	"""All suppliers for the manage screen (name, phone, note, debt) — newest activity aside, simple
	alphabetical so the owner can find + edit any supplier, not only the ones currently owed."""
	ensure_cap("supplier")
	out = []
	for r in frappe.get_all("Supplier", fields=["name", "supplier_name", "mobile_no", "cago_supplier_note", "disabled"], order_by="disabled asc, supplier_name asc"):
		bal = _supplier_outstanding(r.name)
		out.append({
			"supplier": r.name, "supplier_name": r.supplier_name, "mobile": r.mobile_no or "",
			"note": r.cago_supplier_note or "", "debt": bal, "debt_text": dto.format_price(bal) if bal > 0 else "Không nợ",
			"disabled": bool(r.disabled),
		})
	return out


@frappe.whitelist()
def save_supplier(supplier, supplier_name, phone=None, note=None):
	"""Edit a supplier (name / phone / note). Renaming an ERPNext Supplier updates its links."""
	ensure_cap("supplier")
	if not frappe.db.exists("Supplier", supplier):
		frappe.throw(_("Không tìm thấy nhà cung cấp."))
	from cago.chatbot.observability import clean_phone

	name = (supplier_name or "").strip()
	if not name:
		frappe.throw(_("Nhập tên nhà cung cấp."))
	doc = frappe.get_doc("Supplier", supplier)
	doc.mobile_no = clean_phone(phone) or None
	doc.cago_supplier_note = (note or "").strip() or None
	doc.save(ignore_permissions=True)
	# A name change renames the docname; do it last so the links cascade cleanly.
	if name != doc.supplier_name or name != supplier:
		from cago.utils.privileged import as_user

		with as_user("Administrator"):
			if name != supplier and frappe.db.exists("Supplier", name):
				frappe.throw(_("Đã có nhà cung cấp tên '{0}'.").format(name))
			frappe.db.set_value("Supplier", supplier, "supplier_name", name)
			if name != supplier:
				frappe.rename_doc("Supplier", supplier, name)
	frappe.db.commit()
	return {"supplier": name}


@frappe.whitelist()
def set_supplier_active(supplier, active=1):
	"""Ngừng dùng / dùng lại a supplier — we DISABLE, never delete, so purchase & debt history stays
	traceable. A disabled supplier is hidden from new-purchase search but its ledger remains."""
	ensure_cap("supplier")
	if not frappe.db.exists("Supplier", supplier):
		frappe.throw(_("Không tìm thấy nhà cung cấp."))
	from frappe.utils import cint

	frappe.db.set_value("Supplier", supplier, "disabled", 0 if cint(active) else 1)
	frappe.db.commit()
	return {"supplier": supplier, "disabled": 0 if cint(active) else 1}


@frappe.whitelist()
def get_supplier_debt(supplier):
	ensure_cap("supplier")
	bal = _supplier_outstanding(supplier)
	return {
		"supplier": supplier,
		"supplier_name": frappe.db.get_value("Supplier", supplier, "supplier_name"),
		"outstanding": bal,
		"outstanding_text": dto.format_price(bal) if bal > 0 else "Không nợ",
	}


@frappe.whitelist()
def credit_purchase(supplier, items, note=None):
	"""Nhập hàng trả sau: submitted UNPAID Purchase Invoice (update_stock). items = list of
	{item_code, qty, rate (giá nhập), uom?}. Increases stock + supplier payable."""
	ensure_cap("supplier")
	ensure_lang()
	if not frappe.db.exists("Supplier", supplier):
		frappe.throw(_("Không tìm thấy nhà cung cấp."))
	items = frappe.parse_json(items) if isinstance(items, str) else (items or [])
	company = debt._company()
	wh = _warehouse()
	rows = []
	for it in items:
		code = (it or {}).get("item_code")
		qty = flt((it or {}).get("qty"))
		rate = flt((it or {}).get("rate"))
		if not code or not frappe.db.exists("Item", code) or qty <= 0:
			continue
		row = {"item_code": code, "qty": qty, "rate": rate, "warehouse": wh}
		if it.get("uom"):
			row["uom"] = it["uom"]
		rows.append(row)
	if not rows:
		frappe.throw(_("Không có sản phẩm hợp lệ."))
	pi = frappe.get_doc(
		{
			"doctype": "Purchase Invoice",
			"supplier": supplier,
			"company": company,
			"posting_date": nowdate(),
			"due_date": nowdate(),
			"update_stock": 1,
			"set_warehouse": wh,
			"credit_to": _payable_account(company),
			"remarks": note or f"Nhập hàng nợ {supplier}",
			"items": rows,
		}
	)
	debt._submit_privileged(pi)
	record_action("Other", ref_doctype="Purchase Invoice", ref_name=pi.name, new_value=flt(pi.grand_total))
	frappe.db.commit()
	return {"invoice": pi.name, "total": flt(pi.grand_total), "total_text": dto.format_price(flt(pi.grand_total)), "outstanding_text": get_supplier_debt(supplier)["outstanding_text"]}


@frappe.whitelist()
def pay_supplier(supplier, amount, note=None):
	"""Trả tiền nhà cung cấp — Payment Entry (Pay), reduces payable."""
	ensure_cap("supplier")
	ensure_lang()
	if not frappe.db.exists("Supplier", supplier):
		frappe.throw(_("Không tìm thấy nhà cung cấp."))
	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Số tiền phải lớn hơn 0."))
	company = debt._company()
	cash = frappe.db.get_value("Company", company, "default_cash_account") or frappe.db.get_value(
		"Account", {"company": company, "account_name": "Cash"}, "name"
	)
	pe = frappe.get_doc(
		{
			"doctype": "Payment Entry",
			"payment_type": "Pay",
			"company": company,
			"posting_date": nowdate(),
			"party_type": "Supplier",
			"party": supplier,
			"paid_from": cash,
			"paid_to": _payable_account(company),
			"paid_amount": amount,
			"received_amount": amount,
			"reference_no": note or "Trả NCC",
			"reference_date": nowdate(),
		}
	)
	debt._submit_privileged(pe)
	record_action("Other", ref_doctype="Payment Entry", ref_name=pe.name, new_value=amount)
	frappe.db.commit()
	return get_supplier_debt(supplier)


@frappe.whitelist()
def supplier_debt_list():
	ensure_cap("supplier")
	out = []
	for s in frappe.get_all("Supplier", fields=["name", "supplier_name"]):
		bal = _supplier_outstanding(s.name)
		if bal > 0:
			out.append({"supplier": s.name, "supplier_name": s.supplier_name, "outstanding": bal, "outstanding_text": dto.format_price(bal)})
	out.sort(key=lambda x: x["outstanding"], reverse=True)
	return out


@frappe.whitelist()
def get_supplier_ledger(supplier):
	ensure_cap("supplier")
	rows = frappe.get_all(
		"GL Entry",
		filters={"party_type": "Supplier", "party": supplier, "is_cancelled": 0, "company": debt._company()},
		fields=["posting_date", "voucher_type", "voucher_no", "debit", "credit"],
		order_by="posting_date asc, creation asc",
	)
	entries, bal = [], 0.0
	for r in rows:
		debit, credit = flt(r.debit), flt(r.credit)
		bal += credit - debit
		is_purchase = credit >= debit
		amount = credit if is_purchase else debit
		entries.append(
			{
				"date": str(r.posting_date),
				"type": "purchase" if is_purchase else "payment",
				"label": "Nhập hàng nợ" if is_purchase else "Trả tiền NCC",
				"amount_text": dto.format_price(amount),
				"voucher_type": r.voucher_type,
				"voucher_no": r.voucher_no,
			}
		)
	entries.reverse()
	d = get_supplier_debt(supplier)
	info = frappe.db.get_value("Supplier", supplier, ["mobile_no", "cago_supplier_note", "disabled"], as_dict=True) or {}
	return {
		"supplier": supplier,
		"supplier_name": d["supplier_name"],
		"outstanding_text": d["outstanding_text"],
		"mobile": info.get("mobile_no") or "",
		"note": info.get("cago_supplier_note") or "",
		"disabled": bool(info.get("disabled")),
		"entries": entries,
	}
