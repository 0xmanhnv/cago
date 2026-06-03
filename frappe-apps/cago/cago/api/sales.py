# Copyright (c) 2026, 0xManhnv
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
from frappe.utils import cint, flt, nowdate

from cago.api import debt
from cago.cago.doctype.cago_owner_action_log.cago_owner_action_log import record_action
from cago.utils import dto
from cago.utils.permissions import ensure_cap, ensure_internal, ensure_lang, is_owner, selling_limits
from cago.utils.privileged import as_user

SELLING_PRICE_LIST = dto.SELLING_PRICE_LIST


def walkin_customer():
	"""A generic walk-in customer for cash sales (created once)."""
	name = frappe.db.get_value("Customer", {"customer_name": dto.WALKIN_NAME}, "name")
	if name:
		return name
	doc = frappe.get_doc({"doctype": "Customer", "customer_name": dto.WALKIN_NAME, "customer_type": "Individual"})
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


def _check_stock(code, qty, uom, stock_uom, warehouse=None):
	"""Block selling beyond on-hand — per item, default ON.

	Policy (owner decision): negative stock is allowed PER ITEM, default OFF.
	- Manual-status items (cago_stock_auto = 0): on-hand isn't system-tracked → never blocked here.
	- Auto-tracked items WITHOUT cago_allow_oversell: blocked when the cart exceeds real on-hand.
	- Auto-tracked items WITH cago_allow_oversell: allowed to go negative (owner opted in).
	The global Stock Settings.allow_negative_stock stays ON so opted-in / offline / manual sales still
	submit; this is the gate that enforces the default-no-oversell rule at the till.
	"""
	flags = frappe.db.get_value("Item", code, ["cago_stock_auto", "cago_allow_oversell"], as_dict=True) or {}
	if not flags.get("cago_stock_auto") or flags.get("cago_allow_oversell"):
		return
	# Check the warehouse the sale actually draws from (a pre-flight; ERPNext re-validates on submit).
	if warehouse:
		on_hand = flt(frappe.db.get_value("Bin", {"item_code": code, "warehouse": warehouse}, "actual_qty"))
	else:
		on_hand = flt(dto.get_actual_qty(code))  # in stock units
	need = qty * _conversion_factor(code, uom, stock_uom)
	if need > on_hand + 1e-6:
		name = frappe.db.get_value("Item", code, "cago_display_name") or frappe.db.get_value("Item", code, "item_name") or code
		frappe.throw(
			_("Không đủ tồn: {0} chỉ còn {1} {2}. Mặt hàng này không cho bán quá tồn — hãy Nhập hàng trước (hoặc bật 'Cho bán quá tồn' nếu cần).").format(name, _trim(on_hand), stock_uom),
			frappe.ValidationError,
		)


def _trim(n):
	n = flt(n)
	return int(n) if n == int(n) else round(n, 2)


def _sale_lines(rows):
	"""Brief item list for the post-sale confirmation screen (what was sold)."""
	out = []
	for r in rows:
		code = r["item_code"]
		name = frappe.db.get_value("Item", code, "cago_display_name") or frappe.db.get_value("Item", code, "item_name") or code
		out.append(
			{
				"name": name,
				"qty": _trim(r["qty"]),
				"uom": dto.uom_label(r.get("uom")),
				"amount_text": dto.format_price(flt(r["qty"]) * flt(r["rate"])),
			}
		)
	return out


def _customer_label(customer):
	"""Display name of the buyer (who it was sold to), or walk-in."""
	return (customer and frappe.db.get_value("Customer", customer, "customer_name")) or dto.WALKIN_NAME


def _existing_sale_result(si_name):
	"""Rebuild a quick_sale result from an already-booked invoice — used when an offline sale is
	re-sent with the same client_uuid (dedup). `duplicate` lets the caller know it wasn't re-booked."""
	si = frappe.get_doc("Sales Invoice", si_name)
	# A re-sent uuid may resolve to an invoice the owner CANCELLED in the meantime (docstatus 2).
	# That sale was voided — its stock/debt were reversed — so it must NOT be reported as a live
	# booking. Flag it so the till/offline client surfaces it for re-entry instead of "done".
	cancelled = si.docstatus == 2
	total = flt(si.grand_total)
	out = flt(si.outstanding_amount)
	mode = "credit" if not si.is_pos else "cash"
	lines = [
		{
			"name": frappe.db.get_value("Item", it.item_code, "cago_display_name") or it.item_name or it.item_code,
			"qty": _trim(it.qty),
			"uom": dto.uom_label(it.uom),
			"amount_text": dto.format_price(flt(it.amount)),
		}
		for it in si.items
	]
	return {
		"invoice": si.name,
		"total": total,
		"total_text": dto.format_price(total),
		"payment_mode": mode,
		"item_count": len(si.items),
		"customer_name": _customer_label(si.customer),
		"lines": lines,
		"outstanding_text": (None if cancelled else (dto.format_price(out) if out > 0 else ("Không nợ" if mode == "credit" else None))),
		"duplicate": True,
		"cancelled": cancelled,
		"docstatus": int(si.docstatus),
	}


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
def credit_sale(customer, items, note=None, client_uuid=None):
	"""Create + submit an unpaid Sales Invoice (stock-reducing credit sale)."""
	ensure_cap("sell")
	ensure_lang()
	# Idempotency (same as quick_sale): a re-sent credit sale resolves to the existing invoice
	# instead of booking the customer's debt twice on a network retry.
	client_uuid = (client_uuid or "").strip() or None
	if client_uuid:
		existing = frappe.db.get_value("Sales Invoice", {"cago_client_uuid": client_uuid}, "name")
		if existing:
			return _existing_sale_result(existing)
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
		_check_stock(code, qty, uom, stock_uom, wh)
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
			"cago_client_uuid": client_uuid,
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


def _outstanding_map(customers):
	"""Batch receivable balances for many customers in ONE grouped query (avoids the per-customer
	GL scan that made customers_snapshot do thousands of full-table scans)."""
	customers = [c for c in set(customers) if c]
	if not customers:
		return {}
	# Parameterised grouped query (frappe.get_all rejects SQL functions in `fields` on v16).
	placeholders = ", ".join(["%s"] * len(customers))
	rows = frappe.db.sql(
		f"""
		select party, sum(debit) - sum(credit) as bal
		from `tabGL Entry`
		where party_type = 'Customer' and is_cancelled = 0 and company = %s and party in ({placeholders})
		group by party
		""",
		(debt._company(), *customers),
		as_dict=True,
	)
	return {r.party: flt(r.bal) for r in rows}


@frappe.whitelist()
def search_customers_lite(query=None, start=0):
	"""Staff: pick a customer at the till (for ghi nợ). Returns name/village/phone + current
	debt text only — no buying price/margin (that stays owner-only). Paginated (20/page)."""
	ensure_internal()
	from frappe.utils import cint

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
		fields=["name", "customer_name", "cago_village", "mobile_no", "cago_points"],
		limit=20,
		limit_start=cint(start),
		order_by="customer_name asc",
	)
	out = []
	for c in rows:
		if c.customer_name == dto.WALKIN_NAME:
			continue  # walk-in isn't a credit customer
		bal = _customer_outstanding(c.name)
		out.append(
			{
				"customer": c.name,
				"customer_name": c.customer_name,
				"village": c.cago_village,
				"mobile": c.mobile_no,
				"points": int(flt(c.cago_points)),
				"outstanding_text": dto.format_price(bal) if bal > 0 else "Không nợ",
			}
		)
	return out


@frappe.whitelist()
def add_customer_lite(customer_name, phone=None, village=None):
	"""Staff: quickly add a new customer at the till (e.g. a new debtor). Owner sets limits later."""
	ensure_internal()
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
def customers_snapshot(limit=2000):
	"""Whole customer list (lite) for OFFLINE caching, so staff can still pick a debtor for ghi nợ
	when the network drops. Same shape as search_customers_lite — no buying price/margin."""
	ensure_internal()
	from frappe.utils import cint

	rows = frappe.get_all(
		"Customer",
		filters={"disabled": 0},
		fields=["name", "customer_name", "cago_village", "mobile_no", "cago_points"],
		limit=cint(limit),
		order_by="customer_name asc",
	)
	bal_map = _outstanding_map([c.name for c in rows])  # one grouped GL query, not one per customer
	out = []
	for c in rows:
		if c.customer_name == dto.WALKIN_NAME:
			continue
		bal = bal_map.get(c.name, 0.0)
		out.append(
			{
				"customer": c.name,
				"customer_name": c.customer_name,
				"village": c.cago_village,
				"mobile": c.mobile_no,
				"points": int(flt(c.cago_points)),
				"outstanding_text": dto.format_price(bal) if bal > 0 else "Không nợ",
			}
		)
	return out


@frappe.whitelist()
def get_receipt(invoice):
	"""Staff: data for a printable 58mm bill (store header + lines + total + safety note)."""
	ensure_internal()
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
def list_recent_sales(limit=60, start=0, status="all", query=None):
	"""Staff: recent submitted sales (for returns / lookup), paginated + filterable SERVER-side.
	`status` = returnable | returned | all. Newest first, with a date-group label + time."""
	ensure_cap("returns")
	from frappe.utils import cint, format_datetime, getdate, nowdate

	company = debt._company()
	returned_names = {n for n in frappe.get_all("Sales Invoice", filters={"is_return": 1, "docstatus": 1, "company": company}, pluck="return_against") if n}

	base = {"docstatus": 1, "is_return": 0, "company": company}
	if status == "returned":
		base["name"] = ["in", list(returned_names) or ["__none__"]]
	elif status == "returnable" and returned_names:
		base["name"] = ["not in", list(returned_names)]

	q = (query or "").strip()
	or_filters = [["name", "like", f"%{q}%"], ["customer_name", "like", f"%{q}%"]] if q else None

	rows = frappe.get_all(
		"Sales Invoice",
		filters=base,
		or_filters=or_filters,
		fields=["name", "customer", "customer_name", "grand_total", "outstanding_amount", "creation", "is_pos"],
		order_by="creation desc",
		limit=cint(limit) or 60,
		limit_start=cint(start),
	)
	today = getdate(nowdate())
	out = []
	for r in rows:
		n_items = frappe.db.count("Sales Invoice Item", {"parent": r.name})
		delta = (today - getdate(r.creation)).days
		group = "Hôm nay" if delta == 0 else "Hôm qua" if delta == 1 else format_datetime(r.creation, "dd/MM/yyyy")
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
				"returned": r.name in returned_names,
				"kind": kind,  # paid | credit | partial
			}
		)
	return out


@frappe.whitelist()
def recent_sales_counts():
	"""True totals for the returns filter tabs (independent of pagination)."""
	ensure_cap("returns")
	company = debt._company()
	all_n = frappe.db.count("Sales Invoice", {"docstatus": 1, "is_return": 0, "company": company})
	returned_names = {n for n in frappe.get_all("Sales Invoice", filters={"is_return": 1, "docstatus": 1, "company": company}, pluck="return_against") if n}
	rn = len(returned_names)
	return {"all": all_n, "returned": rn, "returnable": max(0, all_n - rn)}


@frappe.whitelist()
def get_returnable(invoice):
	"""Per-line remaining returnable qty for an invoice (sold − already returned), so staff can
	return part of a line (e.g. 25kg of a 50kg bag) and return the same invoice more than once."""
	ensure_cap("returns")
	if not frappe.db.exists("Sales Invoice", invoice):
		frappe.throw(_("Không tìm thấy hoá đơn."))
	orig = frappe.db.get_value("Sales Invoice", invoice, ["docstatus", "is_return"], as_dict=True)
	if orig.docstatus != 1 or orig.is_return:
		frappe.throw(_("Hoá đơn này không trả được."))
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import make_sales_return

	lines = []
	try:
		with as_user("Administrator"):
			tmpl = make_sales_return(invoice)  # qty already nets off prior returns (negative = remaining)
		for it in tmpl.items:
			remaining = abs(flt(it.qty))
			if remaining <= 1e-9:
				continue
			name = frappe.db.get_value("Item", it.item_code, "cago_display_name") or it.item_name or it.item_code
			lines.append(
				{
					"item_code": it.item_code,
					"name": name,
					"uom": dto.uom_label(it.uom),
					"remaining": _trim(remaining),
					"rate": flt(it.rate),
					"rate_text": dto.format_price(flt(it.rate), it.uom),
				}
			)
	except Exception:
		lines = []
	return {"invoice": invoice, "lines": lines}


@frappe.whitelist()
def return_sale(invoice, lines=None):
	"""Trả hàng: reverse a submitted sale — stock comes back, money is refunded (or debt reduced
	for credit sales). `lines` (JSON [{item_code, qty}]) returns only those quantities (partial,
	e.g. 25kg of a 50kg bag); omit it to return the whole invoice. Can be called repeatedly until
	everything is returned. Uses ERPNext make_sales_return; staff-only, privileged submit."""
	ensure_cap("returns")
	ensure_lang()
	if not frappe.db.exists("Sales Invoice", invoice):
		frappe.throw(_("Không tìm thấy hoá đơn."))
	orig = frappe.db.get_value("Sales Invoice", invoice, ["docstatus", "is_return"], as_dict=True)
	if orig.docstatus != 1 or orig.is_return:
		frappe.throw(_("Hoá đơn này không trả được."))

	lines = frappe.parse_json(lines) if isinstance(lines, str) else lines
	want = None
	if lines:
		want = {}
		for it in lines:
			code = (it or {}).get("item_code")
			qty = flt((it or {}).get("qty"))
			if code and qty > 0:
				want[code] = want.get(code, 0) + qty
		if not want:
			frappe.throw(_("Chưa chọn số lượng trả."))

	from erpnext.accounts.doctype.sales_invoice.sales_invoice import make_sales_return

	# Capture the cashier handling the refund BEFORE elevation. cago_cashier is no_copy, so
	# make_sales_return blanks it — without re-stamping, the refund's negative cash would be
	# invisible to that person's till shift (drawer would look short by the refund amount).
	cashier = frappe.session.user
	with as_user("Administrator"):
		ret = make_sales_return(invoice)  # template: negative qty = remaining returnable per line
		if want is not None:
			kept = []
			for it in ret.items:
				remaining = abs(flt(it.qty))
				q = want.get(it.item_code, 0)
				if q <= 0 or remaining <= 1e-9:
					continue
				it.qty = -min(q, remaining)  # never return more than what's left
				kept.append(it)
			if not kept:
				frappe.throw(_("Hoá đơn này đã trả hết hoặc số lượng không hợp lệ."))
			ret.set("items", kept)
			# A partial return refunds only the chosen lines. make_sales_return copies the whole
			# invoice's discount + payment, which no longer match the reduced total — so drop the
			# copied discount and instead PRO-RATE the original whole-bill discount (manual + coupon
			# + redeemed points, all folded into discount_amount) onto the returned lines. Applied as
			# a Grand-Total discount on the return (scaling line rates doesn't survive insert —
			# ERPNext re-applies the price-list rate). Otherwise a partial return of a discounted bill
			# refunds the gross price and over-pays the customer.
			ret.additional_discount_percentage = 0
			ret.discount_amount = 0
			gross = sum(flt(x.qty) * flt(x.rate) for x in kept)  # negative magnitude of returned lines
			src = frappe.get_doc("Sales Invoice", invoice)
			orig_gross = flt(src.total) or flt(src.net_total)
			orig_disc = flt(src.discount_amount)
			ret_disc = round(orig_disc * abs(gross) / orig_gross) if (orig_disc and orig_gross) else 0
			if ret_disc:
				ret.apply_discount_on = "Grand Total"
				ret.discount_amount = -ret_disc  # negative → reduces the refund magnitude on a return
			partial_total = gross + ret_disc  # net refund (negative), matches post-discount grand total
			if ret.is_pos and ret.get("payments"):
				first = ret.payments[0]
				first.amount = partial_total
				first.base_amount = partial_total
				ret.set("payments", [first])
		elif not [it for it in ret.items if abs(flt(it.qty)) > 1e-9]:
			frappe.throw(_("Hoá đơn này đã được trả hết trước đó."))
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


@frappe.whitelist()
def exchange_sale(invoice, return_lines, new_items, payment_mode="cash", customer=None, posted_at=None):
	"""Đổi hàng trong một thao tác: trả lại các mặt đã chọn của hoá đơn cũ + bán các mặt mới, rồi
	báo CHÊNH LỆCH cần thu thêm hay hoàn lại. Mỗi vế vẫn là một chứng từ chuẩn (trả hàng + bán mới)
	nên kho và két tự khớp; phần net chỉ để nhân viên biết phải thu/trả bao nhiêu. Bán-mới đi qua
	quick_sale (bắt buộc đang mở ca, kiểm hạn mức nợ, v.v.)."""
	ensure_cap("returns")
	ensure_cap("sell")
	new_items = frappe.parse_json(new_items) if isinstance(new_items, str) else new_items
	if not new_items:
		frappe.throw(_("Chưa chọn hàng đổi lấy."))
	# Leg 1: refund the returned lines (cash back / debt reduced — return_sale handles both).
	ret = return_sale(invoice, return_lines)
	refund_amt = abs(flt(frappe.db.get_value("Sales Invoice", ret["return_invoice"], "grand_total")))
	# Leg 2: sell the replacement items (quick_sale accepts a parsed list directly).
	sale = quick_sale(new_items, payment_mode, customer=customer, posted_at=posted_at)
	new_total = flt(sale.get("total"))
	net = new_total - refund_amt  # > 0 → thu thêm của khách; < 0 → hoàn lại khách
	return {
		"return_invoice": ret["return_invoice"],
		"refund_total": refund_amt,
		"refund_text": dto.format_price(refund_amt),
		"sale_invoice": sale.get("invoice"),
		"new_total": new_total,
		"new_total_text": dto.format_price(new_total),
		"net": net,
		"net_text": dto.format_price(abs(net)) if net else "0đ",
		"net_direction": "collect" if net > 0 else ("refund" if net < 0 else "even"),
		"sale": sale,
	}


def _delivery_item():
	"""The non-stock service item used for a delivery-fee line (phí giao hàng). Created on first use
	so the shop never has to set it up; not stock-tracked, sold at the entered fee."""
	code = "CAGO-DELIVERY"
	if not frappe.db.exists("Item", code):
		grp = frappe.db.get_value("Item Group", {"is_group": 1}, "name") or "All Item Groups"
		with as_user("Administrator"):
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": code,
					"item_name": "Phí giao hàng",
					"cago_display_name": "Phí giao hàng",
					"item_group": grp,
					"stock_uom": "Nos",
					"is_stock_item": 0,
					"is_sales_item": 1,
					"cago_is_public_visible": 0,  # internal service line — never shown to kiosk/customers
				}
			).insert(ignore_permissions=True)
	return code


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
def quick_sale(items, payment_mode="cash", customer=None, discount_amount=0, payments=None, coupon=None, redeem_points=0, client_uuid=None, posted_at=None, delivery_charge=0):
	"""Cago-native checkout: a stock-reducing Sales Invoice (cash/bank/credit/split) for staff.

	ERPNext is the engine (submitted Sales Invoice, update_stock → stock + GL + loyalty).
	- payment_mode cash/bank → fully paid is_pos invoice (one method).
	- payment_mode credit    → unpaid invoice (ghi nợ), respects credit limit.
	- payments=[{mode,amount}] → SPLIT/PARTIAL: multiple methods; any shortfall becomes the
	  customer's debt (requires a real customer); overpay in cash returns change.
	"""
	ensure_cap("sell")
	ensure_lang()
	# Offline idempotency: the till tags each sale with a client_uuid. If a queued sale is re-sent
	# (flaky network → the first request's response was lost), resolve to the SAME invoice instead
	# of booking a second one. Must run before any doc creation.
	client_uuid = (client_uuid or "").strip() or None
	if client_uuid:
		existing = frappe.db.get_value("Sales Invoice", {"cago_client_uuid": client_uuid}, "name")
		if existing:
			return _existing_sale_result(existing)
	# Offline sells carry the moment they were rung up (posted_at) so the invoice lands in the
	# right till-shift window even when it syncs minutes/hours later. Online sells = now.
	posting_date, posting_time, set_posting = nowdate(), None, 0
	if posted_at:
		from frappe.utils import add_to_date, get_datetime, now_datetime

		_dt = get_datetime(posted_at)
		_now = now_datetime()
		# Guard a forged/wrong client clock: only honour a timestamp within [now−7d, now+5min]
		# (offline backlog is at most a couple of days). Otherwise fall back to now so a bad
		# posted_at can't back/forward-date the sale and skew the daily reports.
		if _dt and add_to_date(_now, days=-7) <= _dt <= add_to_date(_now, minutes=5):
			posting_date, posting_time, set_posting = _dt.strftime("%Y-%m-%d"), _dt.strftime("%H:%M:%S"), 1
	# Capture the real cashier BEFORE any Administrator elevation (as_user), so the till-shift
	# reconciliation can attribute this sale's cash to the person who made it.
	cashier = frappe.session.user
	# A live counter sale must be inside an open till shift (cash accountability). Exempt: the owner
	# (sells without a formal shift) and offline-queued sales (client_uuid — attributed by posted_at;
	# they may sync after the shift closed). Skipped under the test runner (tests open no shift).
	if client_uuid is None and not frappe.flags.in_test and not is_owner():
		from cago.api.shift import ensure_open_shift

		ensure_open_shift(cashier)
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
	# Bargaining (per-line override + whole-bill discount) is honoured ONLY when THIS cashier is
	# allowed to, with a per-staff max discount % (owner = unlimited). Set by the owner per
	# employee; never trust the client — re-checked here server-side.
	_limits = selling_limits(cashier)
	allow_price_edit = _limits["allow_price_edit"]
	max_discount_pct = _limits["max_discount_pct"]

	rows = []
	for it in items:
		code = (it or {}).get("item_code")
		qty = flt((it or {}).get("qty"))
		if not code or not frappe.db.exists("Item", code) or qty <= 0:
			continue
		stock_uom = frappe.db.get_value("Item", code, "stock_uom")
		uom = (it.get("uom") or stock_uom) if it else stock_uom
		# Enforce the no-oversell policy only for ONLINE live sales. An offline-queued sale (client_uuid)
		# was already physically handed over; blocking it at sync would lose a real sale.
		if client_uuid is None:
			_check_stock(code, qty, uom, stock_uom, wh)
		rate = _rate_for_uom(code, uom, stock_uom, pl)
		# A 0/empty rate means "no override" (use the catalogue price), not "sell for free".
		overridden = allow_price_edit and it and (it.get("rate") not in (None, "")) and flt(it.get("rate")) > 0
		# Defence in depth: never let an unpriced item ("Liên hệ") be sold for 0đ. The POS blocks
		# adding it, but guard the API too so no path books a free sale.
		if not overridden and flt(rate) <= 0:
			name = frappe.db.get_value("Item", code, "cago_display_name") or code
			frappe.throw(_("Sản phẩm '{0}' chưa có giá bán. Hãy đặt giá trước khi bán.").format(name))
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
	# A manual whole-bill discount is "mặc cả" too — only allowed when this cashier may bargain
	# (else staff could zero out the total via the discount box, bypassing the giá sàn), and never
	# beyond their per-staff max discount %.
	if disc > 0 and not allow_price_edit:
		frappe.throw(_("Bạn chưa được phép giảm giá khi bán. Nhờ chủ cửa hàng cấp quyền."))
	if disc > 0 and max_discount_pct < 100:
		_base = sum(flt(r["qty"]) * flt(r["rate"]) for r in rows)
		if _base > 0 and disc / _base * 100 > max_discount_pct + 0.01:
			frappe.throw(_("Vượt mức giảm tối đa {0}% của bạn.").format(_trim(max_discount_pct)))
	# A coupon's discount is validated + computed SERVER-side (never trust a client amount) and
	# its usage counted only here, on a completed sale. Stacks on top of any manual discount.
	coupon_code = None
	if coupon:
		from cago.api import coupon as coupon_mod

		subtotal = sum(flt(r["qty"]) * flt(r["rate"]) for r in rows)
		coupon_code, cdisc = coupon_mod.redeem(coupon, subtotal)
		disc = min(flt(subtotal), disc + flt(cdisc))

	# Giá sàn also binds a whole-bill discount: ERPNext spreads a Grand-Total discount across
	# lines proportionally, so check each line's post-discount rate up-front (covers all payment
	# paths the same way, no need to read ERPNext internals after insert).
	subtotal_all = sum(flt(r["qty"]) * flt(r["rate"]) for r in rows)
	if disc > 0 and subtotal_all > 0:
		factor = (subtotal_all - disc) / subtotal_all
		for r in rows:
			min_price = flt(frappe.db.get_value("Item", r["item_code"], "cago_min_price"))
			if not min_price:
				continue
			floor = min_price * _conversion_factor(r["item_code"], r["uom"], frappe.db.get_value("Item", r["item_code"], "stock_uom"))
			if flt(r["rate"]) * factor < floor - 0.5:
				name = frappe.db.get_value("Item", r["item_code"], "cago_display_name") or r["item_code"]
				frappe.throw(_("Giảm giá làm '{0}' xuống dưới giá sàn {1}/{2}.").format(name, dto.format_price(floor), r["uom"]))

	# Loyalty redemption: the customer SPENDS earned points as an extra discount. Exempt from the
	# giá-sàn / max-discount checks above (it's their own points, not bargaining). Deducted on the
	# invoice's on_submit (cago.loyalty), restored on cancel.
	redeem_pts = cint(redeem_points)
	if redeem_pts > 0 and cust != walkin_customer():
		from cago.loyalty import redeem_value

		bal = cint(frappe.db.get_value("Customer", cust, "cago_points"))
		room_pts = int(max(0.0, subtotal_all - disc) / (redeem_value() or 1))  # don't discount below 0
		redeem_pts = max(0, min(redeem_pts, bal, room_pts))
		disc = min(subtotal_all, disc + redeem_pts * redeem_value())
	else:
		redeem_pts = 0

	# Delivery fee (phí giao hàng tận nơi — cám/phân bao nặng): a flat add-on line, added AFTER the
	# discount/giá-sàn/redeem logic so it is never discounted or floor-checked. Non-stock service item.
	deliv = flt(delivery_charge)
	if deliv > 0:
		rows.append(
			{
				"item_code": _delivery_item(),
				"qty": 1,
				"uom": "Nos",
				"rate": deliv,
				"price_list_rate": deliv,
				"allow_zero_valuation_rate": 1,
			}
		)

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
					"posting_date": posting_date,
					"due_date": posting_date,
					"posting_time": posting_time,
					"set_posting_time": set_posting,
					"is_pos": 1,
					"pos_profile": profile,
					"update_stock": 1,
					"set_warehouse": wh,
					"selling_price_list": pl,
					"remarks": "Bán hàng tại quầy (nhiều hình thức)",
					"cago_cashier": cashier,
					"cago_points_redeemed": redeem_pts,
					"cago_client_uuid": client_uuid,
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
			"customer_name": _customer_label(cust),
			"lines": _sale_lines(rows),
			"paid_text": dto.format_price(paid),
			"cash_text": dto.format_price(_cash) if (_cash := sum(flt((p or {}).get("amount")) for p in payments if (p or {}).get("mode") == "cash")) > 0 else None,
			"bank_text": dto.format_price(_bank) if (_bank := sum(flt((p or {}).get("amount")) for p in payments if (p or {}).get("mode") == "bank")) > 0 else None,
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
				"posting_date": posting_date,
				"due_date": posting_date,
				"posting_time": posting_time,
				"set_posting_time": set_posting,
				"update_stock": 1,
				"set_warehouse": wh,
				"selling_price_list": pl,
				"remarks": "Bán chịu tại quầy",
				"cago_cashier": cashier,
				"cago_points_redeemed": redeem_pts,
				"cago_client_uuid": client_uuid,
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
			"customer_name": _customer_label(cust),
			"lines": _sale_lines(rows),
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
				"posting_date": posting_date,
				"due_date": posting_date,
				"posting_time": posting_time,
				"set_posting_time": set_posting,
				"is_pos": 1,
				"pos_profile": profile,
				"update_stock": 1,
				"set_warehouse": wh,
				"selling_price_list": pl,
				"remarks": f"Bán hàng tại quầy ({'chuyển khoản' if payment_mode == 'bank' else 'tiền mặt'})",
				"cago_cashier": cashier,
				"cago_points_redeemed": redeem_pts,
				"cago_client_uuid": client_uuid,
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
		"customer_name": _customer_label(cust),
		"lines": _sale_lines(rows),
	}
