# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Customer self-service debt on the kiosk — staff-assisted verification.

Privacy-first: nothing about a customer is shown until a staff member confirms the person
in front of them. Flow:
  1. kiosk  -> verify.request(phone)      (rate-limited; creates a pending request)
  2. staff  -> verify.pending() / approve(request_id)   (issues a short-lived token)
  3. kiosk  -> verify.status(request_id)  (polls; gets the token once approved)
  4. kiosk  -> verify.my_debt(token)      (returns ONLY that customer's outstanding; audited)

Owner gate: Company.cago_kiosk_debt_visible. No debt is ever returned before approval, and
the request never reveals whether a phone matches a customer. State lives in Redis (TTL).
"""

import hmac
import json
import time

import frappe
from frappe import _
from frappe.utils import flt

from cago.api import debt
from cago.cago.doctype.cago_owner_action_log.cago_owner_action_log import record_action
from cago.chatbot.observability import clean_phone
from frappe.utils import cint

from cago.utils import dto
from cago.utils.permissions import ensure_owner, ensure_staff
from cago.utils.ratelimit import rate_guard

STORE = "cago_verify_store"
TTL = 600  # seconds (10 min)


def _store():
	raw = frappe.cache().get_value(STORE)
	d = json.loads(raw) if raw else {}
	now = int(time.time())
	return {k: v for k, v in d.items() if now - v.get("t", 0) < TTL}  # prune expired


def _save(d):
	frappe.cache().set_value(STORE, json.dumps(d))


def _enabled():
	return bool(frappe.db.get_value("Company", debt._company(), "cago_kiosk_debt_visible"))


@frappe.whitelist()
def get_visible():
	"""Owner: is kiosk debt self-service enabled?"""
	ensure_owner()
	return {"enabled": _enabled()}


@frappe.whitelist()
def set_visible(on):
	"""Owner: enable/disable kiosk debt self-service."""
	ensure_owner()
	val = 1 if cint(on) else 0
	frappe.db.set_value("Company", debt._company(), "cago_kiosk_debt_visible", val)
	frappe.db.commit()
	return {"enabled": bool(val)}


@frappe.whitelist()
def get_price_edit():
	"""Owner: may staff edit the per-line price at the till (mặc cả / bớt giá)?"""
	ensure_owner()
	return {"enabled": bool(frappe.db.get_value("Company", debt._company(), "cago_allow_price_edit"))}


@frappe.whitelist()
def set_price_edit(on):
	"""Owner: enable/disable per-line price override in the sell screen."""
	ensure_owner()
	val = 1 if cint(on) else 0
	frappe.db.set_value("Company", debt._company(), "cago_allow_price_edit", val)
	frappe.db.commit()
	return {"enabled": bool(val)}


@frappe.whitelist()
def get_staff_collect_debt():
	"""Owner: may staff record customer debt repayments (Khách trả nợ)?"""
	ensure_owner()
	return {"enabled": bool(frappe.db.get_value("Company", debt._company(), "cago_staff_can_collect_debt"))}


@frappe.whitelist()
def set_staff_collect_debt(on):
	"""Owner: enable/disable staff debt collection."""
	ensure_owner()
	val = 1 if cint(on) else 0
	frappe.db.set_value("Company", debt._company(), "cago_staff_can_collect_debt", val)
	frappe.db.commit()
	return {"enabled": bool(val)}


def _owes(customer):
	# Company-scoped to match sales._customer_outstanding — a multi-company site must not sum a
	# customer's receivables across companies in the kiosk debt lookup.
	rows = frappe.get_all(
		"GL Entry",
		filters={"party_type": "Customer", "party": customer, "is_cancelled": 0, "company": debt._company()},
		fields=["debit", "credit"],
	)
	return flt(sum(flt(r.debit) - flt(r.credit) for r in rows))


def _mask(phone):
	return ("•" * max(0, len(phone) - 3)) + phone[-3:] if phone else ""


@frappe.whitelist(allow_guest=True)
def request(phone):
	"""Kiosk: ask to view own debt. Never reveals whether the phone matches a customer."""
	rate_guard("verify", limit=10, seconds=300)
	if not _enabled():
		return {"enabled": False}
	p = clean_phone(phone)
	if not p:
		frappe.throw(_("Số điện thoại chưa đúng (vd 0987654321)."))
	cust = frappe.db.get_value("Customer", {"cago_zalo_phone": p}, "name") or frappe.db.get_value(
		"Customer", {"mobile_no": p}, "name"
	)
	rid = frappe.generate_hash()  # full-length, unguessable
	d = _store()
	d[rid] = {
		"phone": p,
		"customer": cust or "",
		"approved": 0,
		"token": "",
		"t": int(time.time()),
		"ip": getattr(frappe.local, "request_ip", None) or "",
	}
	_save(d)
	return {"enabled": True, "request_id": rid}


@frappe.whitelist()
def pending():
	"""Staff: list pending verification requests to confirm in person."""
	ensure_staff()
	d = _store()
	out = []
	for k, v in d.items():
		if v.get("approved"):
			continue
		out.append(
			{
				"request_id": k,
				"phone_masked": _mask(v["phone"]),
				"customer_name": frappe.db.get_value("Customer", v["customer"], "customer_name") if v["customer"] else None,
			}
		)
	return out


@frappe.whitelist()
def approve(request_id):
	"""Staff: confirm the person → issue a short-lived view token."""
	ensure_staff()
	d = _store()
	v = d.get(request_id)
	if not v:
		frappe.throw(_("Yêu cầu đã hết hạn, nhờ khách nhập lại."))
	if not v["customer"]:
		frappe.throw(_("Không tìm thấy khách hàng với số điện thoại này."))
	v["approved"] = 1
	v["token"] = frappe.generate_hash()  # full-length view token
	_save(d)
	return {"ok": True}


@frappe.whitelist(allow_guest=True)
def status(request_id):
	"""Kiosk: poll approval; returns the token once approved."""
	rate_guard("verify_poll", limit=90, seconds=300)
	v = _store().get(request_id)
	if not v:
		return {"approved": False, "expired": True}
	# Only the device that created the request may poll it — don't hand the token to a
	# different client that guessed/observed the request_id.
	cur_ip = getattr(frappe.local, "request_ip", None) or ""
	if v.get("ip") and cur_ip and v["ip"] != cur_ip:
		return {"approved": False}
	return {"approved": bool(v["approved"]), "token": v["token"] if v["approved"] else None}


@frappe.whitelist(allow_guest=True)
def my_debt(token):
	"""Kiosk: with a valid approved token, return ONLY that customer's outstanding (audited)."""
	rate_guard("verify_debt", limit=30, seconds=300)
	if not token:
		frappe.throw(_("Phiên không hợp lệ."))
	for v in _store().values():
		if v.get("approved") and v.get("customer") and v.get("token") and hmac.compare_digest(v["token"], token):
			cust = v["customer"]
			bal = _owes(cust)
			try:
				record_action("Other", ref_doctype="Customer", ref_name=cust, new_value="kiosk debt view")
			except Exception:
				pass  # never fail the view because the audit insert hiccupped
			return {
				"customer_name": frappe.db.get_value("Customer", cust, "customer_name"),
				"outstanding": bal,
				"outstanding_text": dto.format_price(bal) if bal > 0 else "Không nợ",
				"points": int(flt(frappe.db.get_value("Customer", cust, "cago_points"))),
			}
	frappe.throw(_("Phiên đã hết hạn, nhờ người bán xác nhận lại."))
