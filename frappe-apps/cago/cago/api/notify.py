# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Outbound messaging (Zalo/SMS) — provider-agnostic and opt-in.

The shop captures plenty of pushable signals (debt, low stock, back-in-stock), but the owner
otherwise has to copy-paste drafts by hand. This module turns a draft into an actual send IF the
owner has configured a messaging webhook on the Company; otherwise it is a safe no-op (returns
sent=False) so nothing breaks and no message leaks to a half-configured gateway.

Design: we don't bind to one vendor's API. The owner points `cago_notify_webhook` at any small relay
(a Zalo ZNS bridge, an SMS gateway, a serverless function) that accepts POST {phone, text} and does
the vendor call. Keeps secrets out of this app and lets the shop swap providers without a code change.
"""

from __future__ import annotations

import frappe
from frappe import _

from cago.api.debt import _company
from cago.chatbot.observability import clean_phone
from cago.utils.permissions import ensure_internal, ensure_owner


def _config():
	from frappe.utils.password import get_decrypted_password

	c = _company()
	webhook = frappe.db.get_value("Company", c, "cago_notify_webhook")
	token = None
	if webhook:
		token = get_decrypted_password("Company", c, "cago_notify_token", raise_exception=False)
	return (webhook or "").strip(), (token or "").strip()


def is_configured() -> bool:
	"""True when an owner has wired a messaging webhook — otherwise sends are no-ops (drafts only)."""
	return bool(_config()[0])


def send_message(phone, text):
	"""Send one message. Returns {sent, reason}. Never raises on a transport/config problem — a failed
	reminder must not break the action that triggered it; the caller still has the draft to send by hand."""
	phone = clean_phone(phone)
	text = (text or "").strip()
	if not phone or not text:
		return {"sent": False, "reason": "missing phone/text"}
	webhook, token = _config()
	if not webhook:
		return {"sent": False, "reason": "not configured"}
	try:
		import requests

		headers = {"Content-Type": "application/json"}
		if token:
			headers["Authorization"] = f"Bearer {token}"
		r = requests.post(webhook, json={"phone": phone, "text": text}, headers=headers, timeout=10)
		ok = 200 <= r.status_code < 300
		return {"sent": ok, "reason": "" if ok else f"HTTP {r.status_code}"}
	except Exception as e:  # noqa: BLE001 — never propagate; messaging is best-effort
		frappe.log_error(title="Cago notify send failed", message=frappe.get_traceback())
		return {"sent": False, "reason": str(e)[:120]}


def send_owner(text):
	"""Message the shop owner (daily digest / alerts). No-op if no owner phone or webhook is set."""
	phone = frappe.db.get_value("Company", _company(), "cago_owner_phone")
	return send_message(phone, text)


@frappe.whitelist()
def notify_status():
	"""UI hint: whether real sending is on, so the draft screens can show 'Gửi' vs 'Sao chép'."""
	ensure_internal()
	return {"configured": is_configured()}


@frappe.whitelist()
def get_notify_config():
	"""Owner reads the messaging config (token is never returned — only whether it is set)."""
	ensure_owner()
	c = _company()
	return {
		"owner_phone": frappe.db.get_value("Company", c, "cago_owner_phone") or "",
		"webhook": frappe.db.get_value("Company", c, "cago_notify_webhook") or "",
		"has_token": bool(frappe.db.get_value("Company", c, "cago_notify_token")),
	}


@frappe.whitelist()
def set_notify_config(owner_phone=None, webhook=None, token=None):
	"""Owner sets the messaging config. Token only overwritten when a non-empty value is supplied."""
	ensure_owner()
	c = _company()
	if owner_phone is not None:
		frappe.db.set_value("Company", c, "cago_owner_phone", clean_phone(owner_phone))
	if webhook is not None:
		frappe.db.set_value("Company", c, "cago_notify_webhook", (webhook or "").strip())
	if token:
		frappe.db.set_value("Company", c, "cago_notify_token", token.strip())
	frappe.db.commit()
	return get_notify_config()


@frappe.whitelist()
def send_draft(phone, text):
	"""Send a draft the owner composed (debt reminder / restock). Internal users only."""
	ensure_internal()
	if not is_configured():
		frappe.throw(_("Chưa cấu hình gửi tin nhắn. Vào Cài đặt để bật, hoặc dùng nút Sao chép."))
	res = send_message(phone, text)
	if not res["sent"]:
		frappe.throw(_("Gửi không thành công ({0}). Bác thử lại hoặc sao chép gửi tay nhé.").format(res["reason"]))
	return res
