# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Proactive owner alerts.

The shop already computes low-stock, near-expiry and debt live for the owner home, but the owner has
to go look. This builds the same "việc hôm nay" once a day and PUSHES it — an in-app Notification Log
the owner sees on next login, plus a Zalo/SMS if a messaging webhook is configured (else a no-op).
Run from the scheduler (see hooks.scheduler_events); does nothing on a day with no tasks.
"""

from __future__ import annotations

import frappe
from frappe.utils import flt

from cago.utils import dto
from cago.utils.permissions import ensure_internal, ensure_owner


def _owner_users():
	"""Real owner logins (the 'Cago Owner' role), excluding the system Administrator."""
	users = frappe.get_all("Has Role", filters={"role": "Cago Owner", "parenttype": "User"}, pluck="parent")
	return [u for u in users if u not in ("Administrator", "Guest")]


def digest_text():
	"""The owner's 'việc hôm nay' as one line, or '' when nothing needs attention."""
	from cago.api import reports

	d = reports.daily_digest()
	if not d.get("has_tasks"):
		return ""
	parts = []
	if d.get("out_of_stock"):
		parts.append(f"{d['out_of_stock']} mặt hàng ĐANG HẾT")
	if d.get("low_stock"):
		parts.append(f"{d['low_stock']} mặt hàng sắp hết")
	if d.get("expiring"):
		parts.append(f"{d['expiring']} lô sắp hết hạn")
	if d.get("debtors"):
		parts.append(f"{d['debtors']} khách còn nợ ({d['debt_total_text']})")
	return "Cửa hàng Minh Tuyết — việc hôm nay: " + "; ".join(parts) + "."


def daily_owner_digest():
	"""Scheduled daily job. Builds the digest and pushes it in-app + (optionally) by Zalo/SMS."""
	try:
		text = digest_text()
	except Exception:
		frappe.log_error(title="Cago daily digest failed", message=frappe.get_traceback())
		return
	if not text:
		return
	for u in _owner_users():
		try:
			frappe.get_doc(
				{"doctype": "Notification Log", "subject": text, "for_user": u, "type": "Alert", "email_content": text}
			).insert(ignore_permissions=True)
		except Exception:
			pass  # an in-app notice failing must not stop the outbound send
	from cago.api import notify

	notify.send_owner(text)  # no-op when no webhook/owner phone is configured
	frappe.db.commit()


@frappe.whitelist()
def preview_digest():
	"""Owner: see today's digest line on demand (same text the daily job would push)."""
	ensure_owner()
	return {"text": digest_text()}


@frappe.whitelist()
def today_alerts(limit=40):
	"""Consolidated 'cảnh báo hôm nay' — the ACTUAL warning items (not just counts), grouped by
	urgency so the owner can review everything in one screen each morning:
	🔴 đang hết (mất doanh thu) → 🟠 sắp hết → ⏰ sắp/đã hết hạn → 📒 nợ vượt hạn mức.
	Read-only; each section degrades to empty if the caller lacks that capability (stock/debt)."""
	ensure_internal()
	from cago.api import inventory, reports

	def _safe(fn, default):
		try:
			return fn()
		except frappe.PermissionError:
			return default

	n = int(limit or 40)
	low = _safe(reports.low_stock, [])
	out_of_stock = [r for r in low if r.get("status") == "Hết hàng"][:n]
	low_only = [r for r in low if r.get("status") != "Hết hàng"][:n]
	expiring = _safe(inventory.expiring_soon, [])[:n]
	# Debt alerts = customers OVER their credit limit (actionable), not every debtor.
	over_limit = []
	for d in _safe(reports.debt_list, []):
		limit_amt = flt(frappe.db.get_value("Customer", d["customer"], "cago_debt_limit"))
		if limit_amt and d["outstanding"] > limit_amt:
			over_limit.append({**d, "limit_text": dto.format_price(limit_amt)})
	return {
		"out_of_stock": out_of_stock,
		"low_stock": low_only,
		"expiring": expiring,
		"over_limit": over_limit[:n],
		"counts": {
			"out_of_stock": len(out_of_stock),
			"low_stock": len(low_only),
			"expiring": len(expiring),
			"over_limit": len(over_limit),
		},
	}


@frappe.whitelist()
def onboarding_status():
	"""First-run checklist for a non-technical owner: which setup steps are done. Drives a dismissible
	'bắt đầu' card on the home so she isn't dropped into an empty system with no guidance."""
	ensure_owner()
	company = frappe.defaults.get_global_default("company") or frappe.db.get_value("Company", {}, "name")
	has_products = bool(frappe.db.exists("Item", {"disabled": 0, "has_variants": 0, "is_sales_item": 1}))
	has_price = bool(frappe.db.exists("Item Price", {"selling": 1, "price_list_rate": [">", 0]}))
	has_category = bool(frappe.db.exists("Item Group", {"is_group": 0, "cago_icon": ["!=", ""]}))
	has_bank = bool(company and frappe.db.get_value("Company", company, "cago_bank_bin"))
	has_staff = bool(frappe.db.exists("Has Role", {"role": "Cago Sell", "parenttype": "User"}))
	steps = [
		{"key": "products", "label": "Thêm sản phẩm đầu tiên", "done": has_products, "href": "/pos/products/new"},
		{"key": "price", "label": "Đặt giá bán", "done": has_price, "href": "/pos/price"},
		{"key": "category", "label": "Tạo loại hàng (có biểu tượng)", "done": has_category, "href": "/pos/categories"},
		{"key": "bank", "label": "Cài QR/chuyển khoản", "done": has_bank, "href": "/pos/settings"},
		{"key": "staff", "label": "Thêm nhân viên bán hàng", "done": has_staff, "href": "/pos/staff"},
	]
	done = sum(1 for s in steps if s["done"])
	return {"steps": steps, "done": done, "total": len(steps), "all_done": done == len(steps)}
