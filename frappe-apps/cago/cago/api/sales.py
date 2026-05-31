# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Bán chịu trừ tồn — itemized credit sale (owner-only).

The amount-only 'ghi nợ' (debt.record_debt) is a Journal Entry that does NOT move stock.
This is the correct, stock-aware alternative: a submitted Sales Invoice (update_stock) that
is left UNPAID — so on-hand decreases, items/COGS are recorded (best-sellers + gross profit
work), and the receivable goes up. Repayment uses the existing debt.record_repayment.

Privileged submit (owner lacks ERPNext accounting/stock perms; ERPNext still validates).
"""

import frappe
from frappe import _
from frappe.utils import flt, nowdate

from cago.api import debt
from cago.cago.doctype.cago_owner_action_log.cago_owner_action_log import record_action
from cago.utils import dto
from cago.utils.permissions import ensure_lang, ensure_owner

SELLING_PRICE_LIST = dto.SELLING_PRICE_LIST


def _warehouse():
	company = debt._company()
	for wh in ("Stores", "Finished Goods"):
		w = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0, "warehouse_name": wh}, "name")
		if w:
			return w
	return frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")


def _rate_for_uom(item_code, uom, stock_uom):
	if uom and uom != stock_uom:
		r = frappe.db.get_value(
			"Item Price",
			{"item_code": item_code, "price_list": SELLING_PRICE_LIST, "selling": 1, "uom": uom},
			"price_list_rate",
		)
		if r:
			return flt(r)
	return flt(dto.get_selling_price(item_code))


@frappe.whitelist()
def credit_sale(customer, items, note=None):
	"""Create + submit an unpaid Sales Invoice (stock-reducing credit sale)."""
	ensure_owner()
	ensure_lang()
	if not frappe.db.exists("Customer", customer):
		frappe.throw(_("Không tìm thấy khách hàng."))
	items = frappe.parse_json(items) if isinstance(items, str) else (items or [])
	if not items:
		frappe.throw(_("Chưa chọn sản phẩm."))

	company = debt._company()
	wh = _warehouse()
	if not wh:
		frappe.throw(_("Chưa cấu hình kho."))

	rows = []
	for it in items:
		code = (it or {}).get("item_code")
		qty = flt((it or {}).get("qty"))
		if not code or not frappe.db.exists("Item", code) or qty <= 0:
			continue
		stock_uom = frappe.db.get_value("Item", code, "stock_uom")
		uom = (it.get("uom") or stock_uom) if it else stock_uom
		rows.append({"item_code": code, "qty": qty, "uom": uom, "rate": _rate_for_uom(code, uom, stock_uom), "warehouse": wh})
	if not rows:
		frappe.throw(_("Không có sản phẩm hợp lệ."))

	# Credit limit (rough estimate in selling units).
	limit = flt(frappe.db.get_value("Customer", customer, "cago_debt_limit"))
	if limit:
		current = flt(debt.get_customer_debt(customer)["outstanding"])
		est = sum(r["qty"] * r["rate"] for r in rows)
		if current + est > limit:
			frappe.throw(
				_("Vượt hạn mức nợ {0} (đang nợ {1}).").format(dto.format_price(limit), dto.format_price(current))
			)

	si = frappe.get_doc(
		{
			"doctype": "Sales Invoice",
			"customer": customer,
			"company": company,
			"posting_date": nowdate(),
			"due_date": nowdate(),
			"update_stock": 1,
			"set_warehouse": wh,
			"selling_price_list": SELLING_PRICE_LIST,
			"remarks": note or f"Bán chịu {customer}",
			"items": rows,
		}
	)
	debt._submit_privileged(si)
	record_action("Debt Add", ref_doctype="Sales Invoice", ref_name=si.name, new_value=flt(si.grand_total))
	frappe.db.commit()
	d = debt.get_customer_debt(customer)
	return {
		"invoice": si.name,
		"total": flt(si.grand_total),
		"total_text": dto.format_price(flt(si.grand_total)),
		"outstanding_text": d["outstanding_text"],
	}
