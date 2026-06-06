# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Customer login via Zalo (Mini App / OAuth) → linked to a Cago Customer.

The Zalo Mini App gives a user id + a phone-number TOKEN; the server exchanges that token for the
verified phone using the OA's app secret, then finds-or-creates the Customer (storing `cago_zalo_id`
+ `cago_zalo_phone`). A self-registered customer is a LEAD (`cago_unverified`) — browse / order /
cash are fine, but NO buying on credit until the owner verifies them (see
cago.api.debt.ensure_not_unverified + staff.verify_customer).

The token→phone exchange needs the real OA + app secret + HTTPS, so it is wired but only smoke-tested
with real accounts; the find-or-create + lead tiering is unit-tested via link_customer(). See docs/45.
"""

import re

import frappe
from frappe import _

from cago.api.debt import _company
from cago.utils.ratelimit import rate_guard


def _app_secret() -> str:
	from cago.utils.secrets import get_secret

	return get_secret("Company", _company(), "cago_zalo_app_secret")


def _resolve_phone(access_token, phone_token) -> str:
	"""Exchange the Mini App phone token for the verified number via the Zalo Graph API (needs the OA
	app secret). Returns '' if not configured / on any error — the caller decides what to do."""
	secret = _app_secret()
	if not (access_token and phone_token and secret):
		return ""
	try:
		import requests

		r = requests.get(
			"https://graph.zalo.me/v2.0/me/info",
			headers={"access_token": access_token, "code": phone_token, "secret_key": secret},
			timeout=10,
		)
		number = ((r.json() or {}).get("data") or {}).get("number") or ""
		return re.sub(r"[^\d]", "", number)
	except Exception:  # noqa: BLE001 — best-effort; treat any failure as "no phone"
		return ""


def link_customer(phone, zalo_id=None, name=None) -> str:
	"""Find-or-create a Customer by phone and attach the Zalo id. A NEW customer is a lead
	(cago_unverified=1) so they cannot buy on credit until the owner verifies them. Returns the name."""
	phone = re.sub(r"[^\d]", "", phone or "")
	if not phone:
		frappe.throw(_("Thiếu số điện thoại."))
	existing = (
		(frappe.db.get_value("Customer", {"cago_zalo_id": zalo_id}, "name") if zalo_id else None)
		or frappe.db.get_value("Customer", {"mobile_no": phone}, "name")
		or frappe.db.get_value("Customer", {"cago_zalo_phone": phone}, "name")
	)
	if existing:
		if zalo_id and not frappe.db.get_value("Customer", existing, "cago_zalo_id"):
			frappe.db.set_value("Customer", existing, "cago_zalo_id", zalo_id)
			frappe.db.commit()
		return existing
	doc = frappe.get_doc(
		{
			"doctype": "Customer",
			"customer_name": (name or "").strip() or f"Khách Zalo {phone[-4:]}",
			"customer_type": "Individual",
			"mobile_no": phone,
			"cago_zalo_phone": phone,
			"cago_zalo_id": zalo_id or "",
			"cago_unverified": 1,  # lead — no credit until the owner verifies
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
	return doc.name


@frappe.whitelist()
def oa_status():
	"""For the 'Liên kết mạng xã hội' hub: whether the shop's Zalo Official Account is configured (so the
	UI can offer a 'Theo dõi Zalo OA' link) without exposing the app secret. Internal users only."""
	from cago.utils.permissions import ensure_internal

	ensure_internal()
	oa = frappe.db.get_value("Company", _company(), "cago_zalo_oa_id") or ""
	return {"configured": bool(oa), "oa_id": oa}


@frappe.whitelist(allow_guest=True)
def login(access_token=None, phone_token=None, zalo_id=None, name=None):
	"""Zalo Mini App → log the customer in: resolve their verified phone, find-or-create the Customer,
	return a public-safe handle. Rate-limited. The customer isn't a Frappe user — this just links a
	Zalo identity to a Customer record for ordering / tracking / loyalty."""
	rate_guard("zalo_login", limit=20, seconds=60)
	phone = _resolve_phone(access_token, phone_token)
	if not phone:
		frappe.throw(_("Chưa lấy được số điện thoại Zalo (chưa cấu hình, hoặc bạn chưa đồng ý chia sẻ số)."))
	name_ = link_customer(phone, zalo_id=zalo_id, name=name)
	return {
		"customer": frappe.db.get_value("Customer", name_, "cago_slug") or name_,
		"name": frappe.db.get_value("Customer", name_, "customer_name"),
		"unverified": bool(frappe.db.get_value("Customer", name_, "cago_unverified")),
		"linked": True,
	}
