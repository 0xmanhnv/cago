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


def _auto_batch(code, wh):
	"""Pick a batch for a batch-tracked item so staff never sees ERPNext's raw
	'Batch No are mandatory' at checkout. FEFO: sell the nearest-expiry lot first (correct for
	chemicals/HSD), preferring lots that still have stock in this warehouse. Returns None for
	non-batch items, or when the item has no batch at all (owner must create one via Nhập hàng)."""
	if not frappe.db.get_value("Item", code, "has_batch_no"):
		return None
	try:
		from erpnext.stock.doctype.batch.batch import get_batch_qty
	except Exception:
		return None
	batches = frappe.get_all("Batch", filters={"item": code, "disabled": 0}, fields=["name", "expiry_date"])
	scored = []
	for bz in batches:
		try:
			qty = flt(get_batch_qty(bz.name, wh, code))
		except Exception:
			qty = 0
		scored.append((qty, bz.expiry_date, bz.name))
	in_stock = [s for s in scored if s[0] > 0]
	if not in_stock:
		# Expiry-tracked goods must sell from a real received lot (ERPNext blocks negative batch
		# stock, and "which lot's HSD?" is unanswerable otherwise). Caller raises a friendly error.
		return None
	# FEFO: nearest expiry first; undated lots last.
	in_stock.sort(key=lambda s: (s[1] is None, str(s[1] or "9999-12-31")))
	return in_stock[0][2]


def _assign_batch(row, code, wh):
	"""Auto-assign a FEFO lot to a batch-tracked sale row, or raise a clear Vietnamese error
	(not ERPNext's raw English) telling the owner to receive the lot first via Nhập hàng."""
	if not frappe.db.get_value("Item", code, "has_batch_no"):
		return
	batch = _auto_batch(code, wh)
	if not batch:
		name = frappe.db.get_value("Item", code, "cago_display_name") or frappe.db.get_value("Item", code, "item_name") or code
		frappe.throw(_("{0} cần nhập lô/HSD trước khi bán. Vào 'Nhập hàng' để nhập lô.").format(name))
	row["batch_no"] = batch


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
		_assign_batch(rows[-1], code, wh)
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


def _customer_outstanding(customer):
	"""Receivable balance for a customer (company-scoped). Debt only — never cost/margin."""
	rows = frappe.get_all(
		"GL Entry",
		filters={"party_type": "Customer", "party": customer, "is_cancelled": 0, "company": debt._company()},
		fields=["debit", "credit"],
	)
	return flt(sum(flt(r.debit) - flt(r.credit) for r in rows))


@frappe.whitelist()
def search_customers_lite(query=None):
	"""Staff: pick a customer at the till (for ghi nợ). Returns name/village/phone + current
	debt text only — no buying price/margin (that stays owner-only)."""
	ensure_staff()
	query = (query or "").strip()
	or_filters = (
		[["customer_name", "like", f"%{query}%"], ["mobile_no", "like", f"%{query}%"], ["cago_zalo_phone", "like", f"%{query}%"]]
		if query
		else None
	)
	rows = frappe.get_all(
		"Customer",
		filters={"disabled": 0},
		or_filters=or_filters,
		fields=["name", "customer_name", "cago_village", "mobile_no"],
		limit=20,
		order_by="customer_name asc",
	)
	out = []
	for c in rows:
		if c.customer_name == "Khách lẻ":
			continue  # walk-in isn't a credit customer
		bal = _customer_outstanding(c.name)
		out.append(
			{
				"customer": c.name,
				"customer_name": c.customer_name,
				"village": c.cago_village,
				"mobile": c.mobile_no,
				"outstanding_text": dto.format_price(bal) if bal > 0 else "Không nợ",
			}
		)
	return out


@frappe.whitelist()
def add_customer_lite(customer_name, phone=None, village=None):
	"""Staff: quickly add a new customer at the till (e.g. a new debtor). Owner sets limits later."""
	ensure_staff()
	name = (customer_name or "").strip()
	if not name:
		frappe.throw(_("Nhập tên khách hàng."))
	from cago.chatbot.observability import clean_phone

	mobile = clean_phone(phone)
	doc = frappe.get_doc(
		{
			"doctype": "Customer",
			"customer_name": name,
			"customer_type": "Individual",
			"cago_village": (village or "").strip() or None,
			"mobile_no": mobile or None,
			"cago_zalo_phone": mobile or None,
		}
	)
	group = frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
	territory = frappe.db.get_value("Territory", {"is_group": 0}, "name")
	if group:
		doc.customer_group = group
	if territory:
		doc.territory = territory
	with as_user("Administrator"):
		doc.flags.ignore_permissions = True
		doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"customer": doc.name, "customer_name": name}


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
				"uom": dto.uom_label(it.uom),
				"rate_text": dto.format_price(flt(it.rate)),
				"amount_text": dto.format_price(flt(it.amount)),
			}
		)
	from cago.utils.safety import STANDARD_SAFETY_WARNING

	return {
		"invoice": si.name,
		# Receipt header = the customer-facing brand (Minh Tuyết), not the ERPNext Company entity.
		"store": frappe.db.get_single_value("Website Settings", "app_name") or frappe.db.get_value("Company", company, "company_name") or company,
		"when": format_datetime(si.creation, "dd/MM/yyyy HH:mm"),
		"customer_name": si.customer_name,
		"lines": lines,
		"total_text": dto.format_price(flt(si.grand_total)),
		"paid_text": dto.format_price(flt(si.paid_amount)) if si.is_pos else None,
		"outstanding_text": dto.format_price(flt(si.outstanding_amount)) if flt(si.outstanding_amount) > 0 else None,
		"safety": STANDARD_SAFETY_WARNING if has_chem else None,
	}


@frappe.whitelist()
def list_recent_sales(limit=60):
	"""Staff: recent submitted sales (for returns / lookup). Newest first, with a date-group
	label + time so the UI can group (Hôm nay / Hôm qua / dd/MM) and filter cleanly."""
	ensure_staff()
	from frappe.utils import cint, format_datetime, getdate, nowdate

	rows = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 1, "is_return": 0, "company": debt._company()},
		fields=["name", "customer", "customer_name", "grand_total", "outstanding_amount", "creation", "is_pos"],
		order_by="creation desc",
		limit=cint(limit) or 60,
	)
	today = getdate(nowdate())
	out = []
	for r in rows:
		n_items = frappe.db.count("Sales Invoice Item", {"parent": r.name})
		returned = frappe.db.get_value("Sales Invoice", {"return_against": r.name, "docstatus": 1}, "name")
		delta = (today - getdate(r.creation)).days
		group = "Hôm nay" if delta == 0 else "Hôm qua" if delta == 1 else format_datetime(r.creation, "dd/MM/yyyy")
		# payment kind: paid POS, on-credit, or partially paid
		owed = flt(r.outstanding_amount)
		kind = "credit" if (not r.is_pos and owed > 0) else "partial" if owed > 0 else "paid"
		out.append(
			{
				"invoice": r.name,
				"customer_name": r.customer_name,
				"total_text": dto.format_price(flt(r.grand_total)),
				"date_group": group,
				"time": format_datetime(r.creation, "HH:mm"),
				"item_count": n_items,
				"returned": bool(returned),
				"kind": kind,  # paid | credit | partial
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

	# Capture the cashier handling the refund BEFORE elevation. cago_cashier is no_copy, so
	# make_sales_return blanks it — without re-stamping, the refund's negative cash would be
	# invisible to that person's till shift (drawer would look short by the refund amount).
	cashier = frappe.session.user
	with as_user("Administrator"):
		ret = make_sales_return(invoice)
		ret.flags.ignore_permissions = True
		ret.update_stock = 1
		ret.cago_cashier = cashier
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
def quick_sale(items, payment_mode="cash", customer=None, discount_amount=0, payments=None, coupon=None):
	"""Cago-native checkout: a stock-reducing Sales Invoice (cash/bank/credit/split) for staff.

	ERPNext is the engine (submitted Sales Invoice, update_stock → stock + GL + loyalty).
	- payment_mode cash/bank → fully paid is_pos invoice (one method).
	- payment_mode credit    → unpaid invoice (ghi nợ), respects credit limit.
	- payments=[{mode,amount}] → SPLIT/PARTIAL: multiple methods; any shortfall becomes the
	  customer's debt (requires a real customer); overpay in cash returns change.
	"""
	ensure_staff()
	ensure_lang()
	# Capture the real cashier BEFORE any Administrator elevation (as_user), so the till-shift
	# reconciliation can attribute this sale's cash to the person who made it.
	cashier = frappe.session.user
	items = frappe.parse_json(items) if isinstance(items, str) else (items or [])
	payments = frappe.parse_json(payments) if isinstance(payments, str) else payments
	if not items:
		frappe.throw(_("Chưa chọn sản phẩm."))
	if not payments and payment_mode not in ("cash", "bank", "credit"):
		frappe.throw(_("Hình thức thanh toán không hợp lệ."))

	company = debt._company()
	wh = _warehouse()
	if not wh:
		frappe.throw(_("Chưa cấu hình kho."))

	cust = customer if (customer and frappe.db.exists("Customer", customer)) else walkin_customer()
	if payment_mode == "credit" and cust == walkin_customer():
		frappe.throw(_("Ghi nợ cần chọn đúng khách hàng (không dùng khách lẻ)."))
	pl = _price_list_for(cust)
	# Per-line price override (mặc cả) is honoured ONLY when the owner has enabled it on the
	# Company — never trust the client flag. Off → always sell at the price-list rate.
	allow_price_edit = bool(frappe.db.get_value("Company", company, "cago_allow_price_edit"))

	rows = []
	for it in items:
		code = (it or {}).get("item_code")
		qty = flt((it or {}).get("qty"))
		if not code or not frappe.db.exists("Item", code) or qty <= 0:
			continue
		stock_uom = frappe.db.get_value("Item", code, "stock_uom")
		uom = (it.get("uom") or stock_uom) if it else stock_uom
		_check_stock(code, qty, uom, stock_uom)
		rate = _rate_for_uom(code, uom, stock_uom, pl)
		# A 0/empty rate means "no override" (use the catalogue price), not "sell for free".
		overridden = allow_price_edit and it and (it.get("rate") not in (None, "")) and flt(it.get("rate")) > 0
		row = {
			"item_code": code,
			"qty": qty,
			"uom": uom,
			"rate": rate,
			"warehouse": wh,
			# Items received without a cost have zero valuation; selling them via
			# update_stock would otherwise fail ("Allow Zero Valuation Rate not enabled").
			# COGS is 0 for those until a cost is recorded — owner enters cost on nhập hàng.
			"allow_zero_valuation_rate": 1,
		}
		if overridden:
			new_rate = flt(it.get("rate"))
			# Bargaining ("bớt giá") still cannot go below the owner's price floor (giá sàn),
			# which is meant to stop selling under cost. min_price is per stock unit; scale it
			# to the chosen selling unit (1 Bao = 25 Kg → floor × 25).
			min_price = flt(frappe.db.get_value("Item", code, "cago_min_price"))
			if min_price:
				floor = min_price * _conversion_factor(code, uom, stock_uom)
				if new_rate < floor:
					frappe.throw(
						_("Giá {0}/{1} thấp hơn giá sàn {2}.").format(dto.format_price(new_rate), uom, dto.format_price(floor))
					)
			# A manual rate must stick — pin price_list_rate to it so ERPNext does not re-apply
			# the catalogue price on validate and lose the bargained amount.
			row["rate"] = new_rate
			row["price_list_rate"] = new_rate
		_assign_batch(row, code, wh)
		rows.append(row)
	if not rows:
		frappe.throw(_("Không có sản phẩm hợp lệ."))
	disc = flt(discount_amount)
	# A coupon's discount is validated + computed SERVER-side (never trust a client amount) and
	# its usage counted only here, on a completed sale. Stacks on top of any manual discount.
	coupon_code = None
	if coupon:
		from cago.api import coupon as coupon_mod

		subtotal = sum(flt(r["qty"]) * flt(r["rate"]) for r in rows)
		coupon_code, cdisc = coupon_mod.redeem(coupon, subtotal)
		disc = min(flt(subtotal), disc + flt(cdisc))

	if payments:
		# Split / partial: one or more cash/bank methods; any shortfall becomes the customer's
		# debt (requires a real customer). is_pos invoice with the payment rows.
		profile = _pos_profile(company)
		if not profile:
			frappe.throw(_("Chưa cấu hình điểm bán hàng (POS Profile)."))
		paid_rows, paid = [], 0.0
		for p in payments:
			amt = flt((p or {}).get("amount"))
			if amt <= 0:
				continue
			m = _mode_of_payment(company, (p or {}).get("mode"))
			if not m:
				frappe.throw(_("Chưa cấu hình hình thức thanh toán."))
			paid_rows.append({"mode_of_payment": m, "amount": amt})
			paid += amt
		if not paid_rows:
			frappe.throw(_("Chưa nhập số tiền thanh toán."))
		with as_user("Administrator"):
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
					"remarks": "Bán hàng tại quầy (nhiều hình thức)",
					"cago_cashier": cashier,
					"items": rows,
				}
			)
			if disc > 0:
				si.apply_discount_on = "Grand Total"
				si.discount_amount = disc
			si.flags.ignore_permissions = True
			si.insert(ignore_permissions=True)
			total = flt(si.grand_total)
			if paid < total - 1:  # shortfall -> the rest is debt
				if cust == walkin_customer():
					frappe.throw(_("Trả thiếu thì phải chọn khách hàng (phần còn lại ghi nợ)."))
				limit = flt(frappe.db.get_value("Customer", cust, "cago_debt_limit"))
				if limit:
					current = _customer_outstanding(cust)
					if current + (total - paid) > limit:
						frappe.throw(
							_("Vượt hạn mức nợ {0} (đang nợ {1}).").format(dto.format_price(limit), dto.format_price(current))
						)
			for pr in paid_rows:
				si.append("payments", pr)
			si.save(ignore_permissions=True)
			si.submit()
		frappe.db.commit()
		total = flt(si.grand_total)
		out = flt(si.outstanding_amount)
		change = flt(getattr(si, "change_amount", 0)) or max(0.0, paid - total)
		return {
			"invoice": si.name,
			"total": total,
			"total_text": dto.format_price(total),
			"payment_mode": "split",
			"item_count": len(rows),
			"paid_text": dto.format_price(paid),
			"change_text": dto.format_price(change) if change > 0 else None,
			"outstanding_text": dto.format_price(out) if out > 0 else None,
		}

	if payment_mode == "credit":
		# Bán chịu tại quầy: unpaid, stock-reducing Sales Invoice (NOT is_pos). Respects limit.
		limit = flt(frappe.db.get_value("Customer", cust, "cago_debt_limit"))
		if limit:
			current = _customer_outstanding(cust)
			est = sum(r["qty"] * r["rate"] for r in rows)
			if current + est > limit:
				frappe.throw(
					_("Vượt hạn mức nợ {0} (đang nợ {1}).").format(dto.format_price(limit), dto.format_price(current))
				)
		si = frappe.get_doc(
			{
				"doctype": "Sales Invoice",
				"customer": cust,
				"company": company,
				"posting_date": nowdate(),
				"due_date": nowdate(),
				"update_stock": 1,
				"set_warehouse": wh,
				"selling_price_list": pl,
				"remarks": "Bán chịu tại quầy",
				"cago_cashier": cashier,
				"items": rows,
			}
		)
		if disc > 0:
			si.apply_discount_on = "Grand Total"
			si.discount_amount = disc
		debt._submit_privileged(si)
		record_action("Debt Add", ref_doctype="Sales Invoice", ref_name=si.name, new_value=flt(si.grand_total))
		frappe.db.commit()
		total = flt(si.grand_total)
		bal = _customer_outstanding(cust)
		return {
			"invoice": si.name,
			"total": total,
			"total_text": dto.format_price(total),
			"payment_mode": "credit",
			"item_count": len(rows),
			"outstanding_text": dto.format_price(bal) if bal > 0 else "Không nợ",
		}

	# cash / bank — paid is_pos invoice
	profile = _pos_profile(company)
	if not profile:
		frappe.throw(_("Chưa cấu hình điểm bán hàng (POS Profile)."))
	mode = _mode_of_payment(company, payment_mode)
	if not mode:
		frappe.throw(_("Chưa cấu hình hình thức thanh toán."))
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
				"cago_cashier": cashier,
				"items": rows,
			}
		)
		if disc > 0:
			si.apply_discount_on = "Grand Total"
			si.discount_amount = disc
		si.flags.ignore_permissions = True
		si.insert(ignore_permissions=True)  # totals computed (after discount)
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
