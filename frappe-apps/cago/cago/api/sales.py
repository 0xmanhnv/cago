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
from cago.utils.permissions import ensure_lang, ensure_owner, ensure_staff
from cago.utils.privileged import as_user

SELLING_PRICE_LIST = dto.SELLING_PRICE_LIST


def walkin_customer():
	"""A generic walk-in customer for cash sales (created once)."""
	name = frappe.db.get_value("Customer", {"customer_name": "Khách lẻ"}, "name")
	if name:
		return name
	doc = frappe.get_doc({"doctype": "Customer", "customer_name": "Khách lẻ", "customer_type": "Individual"})
	group = frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
	territory = frappe.db.get_value("Territory", {"is_group": 0}, "name")
	if group:
		doc.customer_group = group
	if territory:
		doc.territory = territory
	doc.insert(ignore_permissions=True)
	return doc.name


def _warehouse():
	company = debt._company()
	for wh in ("Stores", "Finished Goods"):
		w = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0, "warehouse_name": wh}, "name")
		if w:
			return w
	return frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")


def _price_list_for(customer):
	"""Wholesale customers use the 'Giá sỉ' list; everyone else the standard one."""
	if customer and frappe.db.get_value("Customer", customer, "cago_wholesale"):
		return dto.WHOLESALE_PRICE_LIST
	return SELLING_PRICE_LIST


def _rate_for_uom(item_code, uom, stock_uom, price_list=None):
	price_list = price_list or SELLING_PRICE_LIST
	# A wholesale list may not price every item/uom — fall back to the standard list so a
	# missing giá-sỉ entry never blocks the sale (owner just sells at retail price).
	for pl in [p for p in (price_list, SELLING_PRICE_LIST) if p]:
		if uom and uom != stock_uom:
			r = frappe.db.get_value(
				"Item Price",
				{"item_code": item_code, "price_list": pl, "selling": 1, "uom": uom},
				"price_list_rate",
			)
			if r:
				return flt(r)
		else:
			r = frappe.db.get_value(
				"Item Price",
				{"item_code": item_code, "price_list": pl, "selling": 1, "uom": stock_uom},
				"price_list_rate",
			)
			if r:
				return flt(r)
	if uom and uom != stock_uom:
		# A retail UOM with no price anywhere — refuse rather than charge the bulk price per unit.
		frappe.throw(_("Chưa đặt giá bán cho đơn vị {0}. Vào Sửa sản phẩm để đặt giá.").format(uom))
	return flt(dto.get_selling_price(item_code))


def _conversion_factor(item_code, uom, stock_uom):
	"""Stock units per 1 selling unit (e.g. 1 Bao = 25 Kg → factor 25 for Bao, 1 for Kg)."""
	if not uom or uom == stock_uom:
		return 1.0
	cf = frappe.db.get_value("UOM Conversion Detail", {"parent": item_code, "uom": uom}, "conversion_factor")
	return flt(cf) or 1.0


def _check_stock(code, qty, uom, stock_uom):
	"""Friendly Vietnamese stock check (ERPNext's own error is raw HTML in English)."""
	if frappe.db.get_single_value("Stock Settings", "allow_negative_stock"):
		return
	on_hand = flt(dto.get_actual_qty(code))  # in stock units
	need = qty * _conversion_factor(code, uom, stock_uom)
	if need > on_hand + 1e-6:
		name = frappe.db.get_value("Item", code, "cago_display_name") or frappe.db.get_value("Item", code, "item_name") or code
		frappe.throw(
			_("Không đủ tồn: {0} chỉ còn {1} {2}.").format(name, _trim(on_hand), stock_uom),
			frappe.ValidationError,
		)


def _trim(n):
	n = flt(n)
	return int(n) if n == int(n) else round(n, 2)


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
	pl = _price_list_for(customer)

	rows = []
	for it in items:
		code = (it or {}).get("item_code")
		qty = flt((it or {}).get("qty"))
		if not code or not frappe.db.exists("Item", code) or qty <= 0:
			continue
		stock_uom = frappe.db.get_value("Item", code, "stock_uom")
		uom = (it.get("uom") or stock_uom) if it else stock_uom
		_check_stock(code, qty, uom, stock_uom)
		rows.append(
			{
				"item_code": code,
				"qty": qty,
				"uom": uom,
				"rate": _rate_for_uom(code, uom, stock_uom, pl),
				"warehouse": wh,
				# Items received without a cost have zero valuation; selling them via
				# update_stock would otherwise fail ("Allow Zero Valuation Rate not enabled").
				# COGS is 0 for those until a cost is recorded — owner enters cost on nhập hàng.
				"allow_zero_valuation_rate": 1,
			}
		)
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
			"selling_price_list": pl,
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


@frappe.whitelist()
def get_receipt(invoice):
	"""Staff: data for a printable 58mm bill (store header + lines + total + safety note)."""
	ensure_staff()
	if not frappe.db.exists("Sales Invoice", invoice):
		frappe.throw(_("Không tìm thấy hoá đơn."))
	from frappe.utils import format_datetime

	si = frappe.get_doc("Sales Invoice", invoice)
	company = si.company
	lines, has_chem = [], False
	for it in si.items:
		if frappe.db.get_value("Item", it.item_code, "cago_is_chemical"):
			has_chem = True
		lines.append(
			{
				"name": frappe.db.get_value("Item", it.item_code, "cago_display_name") or it.item_name,
				"qty": flt(it.qty),
				"uom": it.uom,
				"rate_text": dto.format_price(flt(it.rate)),
				"amount_text": dto.format_price(flt(it.amount)),
			}
		)
	from cago.utils.safety import STANDARD_SAFETY_WARNING

	return {
		"invoice": si.name,
		"store": frappe.db.get_value("Company", company, "company_name") or company,
		"when": format_datetime(si.creation, "dd/MM/yyyy HH:mm"),
		"customer_name": si.customer_name,
		"lines": lines,
		"total_text": dto.format_price(flt(si.grand_total)),
		"paid_text": dto.format_price(flt(si.paid_amount)) if si.is_pos else None,
		"outstanding_text": dto.format_price(flt(si.outstanding_amount)) if flt(si.outstanding_amount) > 0 else None,
		"safety": STANDARD_SAFETY_WARNING if has_chem else None,
	}


@frappe.whitelist()
def list_recent_sales(limit=30):
	"""Staff: recent submitted sales (for returns / lookup). Newest first."""
	ensure_staff()
	from frappe.utils import cint, format_datetime

	rows = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 1, "is_return": 0, "company": debt._company()},
		fields=["name", "customer", "customer_name", "grand_total", "posting_date", "creation", "is_pos"],
		order_by="creation desc",
		limit=cint(limit) or 30,
	)
	out = []
	for r in rows:
		n_items = frappe.db.count("Sales Invoice Item", {"parent": r.name})
		returned = frappe.db.get_value("Sales Invoice", {"return_against": r.name, "docstatus": 1}, "name")
		out.append(
			{
				"invoice": r.name,
				"customer_name": r.customer_name,
				"total_text": dto.format_price(flt(r.grand_total)),
				"when": format_datetime(r.creation, "dd/MM HH:mm"),
				"item_count": n_items,
				"returned": bool(returned),
				"paid": "POS" if r.is_pos else "Nợ",
			}
		)
	return out


@frappe.whitelist()
def return_sale(invoice):
	"""Trả hàng: fully reverse a submitted sale — stock comes back, money is refunded.

	Uses ERPNext's make_sales_return (is_return, negative qty, copies payments). Staff-only;
	privileged submit (staff lack accounting/stock perms; ERPNext still validates)."""
	ensure_staff()
	ensure_lang()
	if not frappe.db.exists("Sales Invoice", invoice):
		frappe.throw(_("Không tìm thấy hoá đơn."))
	orig = frappe.db.get_value("Sales Invoice", invoice, ["docstatus", "is_return"], as_dict=True)
	if orig.docstatus != 1 or orig.is_return:
		frappe.throw(_("Hoá đơn này không trả được."))
	if frappe.db.get_value("Sales Invoice", {"return_against": invoice, "docstatus": 1}, "name"):
		frappe.throw(_("Hoá đơn này đã được trả trước đó."))

	from erpnext.accounts.doctype.sales_invoice.sales_invoice import make_sales_return

	with as_user("Administrator"):
		ret = make_sales_return(invoice)
		ret.flags.ignore_permissions = True
		ret.update_stock = 1
		for it in ret.items:
			it.allow_zero_valuation_rate = 1
		ret.insert(ignore_permissions=True)
		ret.submit()

	record_action("Other", ref_doctype="Sales Invoice", ref_name=invoice, new_value="returned")
	frappe.db.commit()
	return {"return_invoice": ret.name, "total_text": dto.format_price(abs(flt(ret.grand_total)))}


def _pos_profile(company):
	return frappe.db.get_value("POS Profile", {"company": company, "disabled": 0}, "name") or frappe.db.get_value(
		"POS Profile", {"company": company}, "name"
	)


def _mode_of_payment(company, payment_mode):
	"""Resolve a Mode of Payment by intent ('bank' vs 'cash').

	Only modes that have an account configured for this company submit cleanly in a POS
	invoice, so we pick among those. setup.company.ensure_payment_modes wires up Cash and
	'Chuyển khoản'; we prefer the matching type and fall back to any configured mode.
	"""
	want = "Bank" if payment_mode == "bank" else "Cash"
	configured = [r.parent for r in frappe.get_all("Mode of Payment Account", filters={"company": company}, fields=["parent"])]
	if not configured:
		return None
	for name in configured:
		if frappe.db.get_value("Mode of Payment", {"name": name, "type": want, "enabled": 1}):
			return name
	for name in configured:  # fall back: any enabled configured mode (cash first)
		if frappe.db.get_value("Mode of Payment", {"name": name, "enabled": 1}):
			return name
	return None


@frappe.whitelist()
def quick_sale(items, payment_mode="cash", customer=None):
	"""Cago-native checkout: a paid POS Sales Invoice (cash/bank) that reduces stock.

	This is the staff selling tool — a clean Cago cart instead of the raw ERPNext Desk POS
	(which staff lack permission for). ERPNext is still the engine: a submitted is_pos
	Sales Invoice (update_stock) moves stock + records the payment + GL. Native Desk POS
	stays available to the owner as a documented fallback (docs/04).
	"""
	ensure_staff()
	ensure_lang()
	items = frappe.parse_json(items) if isinstance(items, str) else (items or [])
	if not items:
		frappe.throw(_("Chưa chọn sản phẩm."))
	if payment_mode not in ("cash", "bank"):
		frappe.throw(_("Hình thức thanh toán không hợp lệ."))

	company = debt._company()
	wh = _warehouse()
	if not wh:
		frappe.throw(_("Chưa cấu hình kho."))
	profile = _pos_profile(company)
	if not profile:
		frappe.throw(_("Chưa cấu hình điểm bán hàng (POS Profile)."))
	mode = _mode_of_payment(company, payment_mode)
	if not mode:
		frappe.throw(_("Chưa cấu hình hình thức thanh toán."))

	cust = customer if (customer and frappe.db.exists("Customer", customer)) else walkin_customer()
	pl = _price_list_for(cust)

	rows = []
	for it in items:
		code = (it or {}).get("item_code")
		qty = flt((it or {}).get("qty"))
		if not code or not frappe.db.exists("Item", code) or qty <= 0:
			continue
		stock_uom = frappe.db.get_value("Item", code, "stock_uom")
		uom = (it.get("uom") or stock_uom) if it else stock_uom
		_check_stock(code, qty, uom, stock_uom)
		rows.append(
			{
				"item_code": code,
				"qty": qty,
				"uom": uom,
				"rate": _rate_for_uom(code, uom, stock_uom, pl),
				"warehouse": wh,
				# Items received without a cost have zero valuation; selling them via
				# update_stock would otherwise fail ("Allow Zero Valuation Rate not enabled").
				# COGS is 0 for those until a cost is recorded — owner enters cost on nhập hàng.
				"allow_zero_valuation_rate": 1,
			}
		)
	if not rows:
		frappe.throw(_("Không có sản phẩm hợp lệ."))

	with as_user("Administrator"):  # staff lacks Sales Invoice/Payment perms; ERPNext still validates
		si = frappe.get_doc(
			{
				"doctype": "Sales Invoice",
				"customer": cust,
				"company": company,
				"posting_date": nowdate(),
				"due_date": nowdate(),
				"is_pos": 1,
				"pos_profile": profile,
				"update_stock": 1,
				"set_warehouse": wh,
				"selling_price_list": pl,
				"remarks": f"Bán hàng tại quầy ({'chuyển khoản' if payment_mode == 'bank' else 'tiền mặt'})",
				"items": rows,
			}
		)
		si.flags.ignore_permissions = True
		si.insert(ignore_permissions=True)  # totals computed
		si.append("payments", {"mode_of_payment": mode, "amount": flt(si.grand_total)})
		si.save(ignore_permissions=True)
		si.submit()

	frappe.db.commit()
	total = flt(si.grand_total)
	return {
		"invoice": si.name,
		"total": total,
		"total_text": dto.format_price(total),
		"payment_mode": payment_mode,
		"item_count": len(rows),
	}
