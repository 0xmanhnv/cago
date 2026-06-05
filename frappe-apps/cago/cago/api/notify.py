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
from cago.utils.permissions import ensure_admin, ensure_internal, ensure_owner, is_admin
from cago.utils.secrets import has_secret


def _config():
	from cago.utils.secrets import get_secret

	c = _company()
	webhook = frappe.db.get_value("Company", c, "cago_notify_webhook")
	token = get_secret("Company", c, "cago_notify_token") if webhook else ""
	return (webhook or "").strip(), token


def is_configured() -> bool:
	"""True when an owner has wired a messaging webhook — otherwise sends are no-ops (drafts only)."""
	return bool(_config()[0])


def send_message(phone, text):
	"""Send one message. Returns {sent, reason}. Never raises on a transport/config problem — a failed
	reminder must not break the action that triggered it; the caller still has the draft to send by hand."""
	if frappe.flags.in_test:
		return {"sent": False, "reason": "test mode"}  # never hit a real channel from the test suite
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


def notify_telegram(text, chat_id=None, button=None):
	"""Push a message to the shop's Telegram ops chat (owner + staff) via the Bot API, or to a specific
	`chat_id` (e.g. reply to the chat a command came from). `button` = {"text", "url"} adds a tap-to-open
	inline button (e.g. "Mở đơn"). No-op if no bot token / chat configured. Best-effort — never raises."""
	text = (text or "").strip()
	if not text:
		return {"sent": False, "reason": "empty"}
	if frappe.flags.in_test:
		return {"sent": False, "reason": "test mode"}  # never hit a real channel from the test suite
	from cago.utils.secrets import get_secret

	c = _company()
	bot = get_secret("Company", c, "cago_telegram_bot_token") if c else ""
	# Default to the shop ops group; a command reply passes the originating chat so a private
	# owner query (doanh thu / công nợ) is answered in the DM, never broadcast to the staff group.
	chat = chat_id or frappe.db.get_value("Company", c, "cago_telegram_chat_id")
	if not bot or not chat:
		return {"sent": False, "reason": "not configured"}
	try:
		import requests

		payload = {"chat_id": chat, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
		if button and button.get("url"):
			payload["reply_markup"] = {"inline_keyboard": [[{"text": button.get("text") or "Mở", "url": button["url"]}]]}
		r = requests.post(f"https://api.telegram.org/bot{bot}/sendMessage", json=payload, timeout=10)
		ok = 200 <= r.status_code < 300
		return {"sent": ok, "reason": "" if ok else f"HTTP {r.status_code}"}
	except Exception as e:  # noqa: BLE001 — best-effort
		return {"sent": False, "reason": str(e)[:120]}


def notify_ops(text, button=None):
	"""Broadcast an OPS alert (new remote order, call-staff, daily digest…) to the shop's channels:
	the owner's Zalo/SMS + the Telegram ops chat. `button` = {"text","url"} adds a tap-to-open button
	on Telegram (Zalo/SMS is plain text). Best-effort on each; returns which fired."""
	return {"zalo": send_owner(text), "telegram": notify_telegram(text, button=button)}


@frappe.whitelist()
def notify_status():
	"""UI hint: whether real sending is on, so the draft screens can show 'Gửi' vs 'Sao chép'."""
	ensure_internal()
	return {"configured": is_configured()}


@frappe.whitelist()
def get_notify_config():
	"""Messaging config. owner_phone is a business field (owner). The webhook URL + token are the
	technical relay config (admin) — the URL is returned only to an admin; others just learn whether
	it's set."""
	ensure_owner()
	c = _company()
	admin = is_admin()
	return {
		"owner_phone": frappe.db.get_value("Company", c, "cago_owner_phone") or "",
		"is_admin": admin,
		"webhook": (frappe.db.get_value("Company", c, "cago_notify_webhook") or "") if admin else "",
		"has_webhook": bool(frappe.db.get_value("Company", c, "cago_notify_webhook")),
		"has_token": has_secret("Company", c, "cago_notify_token"),
		"telegram_chat_id": (frappe.db.get_value("Company", c, "cago_telegram_chat_id") or "") if admin else "",
		"has_telegram_bot": has_secret("Company", c, "cago_telegram_bot_token"),
		"telegram_owner_ids": (frappe.db.get_value("Company", c, "cago_telegram_owner_ids") or "") if admin else "",
		"notify_on_sale": bool(frappe.db.get_value("Company", c, "cago_notify_on_sale")),
	}


@frappe.whitelist()
def set_notify_on_sale(on=0):
	"""Owner: toggle a Zalo/Telegram ping on every completed sale (off by default)."""
	ensure_owner()
	from frappe.utils import cint

	frappe.db.set_value("Company", _company(), "cago_notify_on_sale", 1 if cint(on) else 0)
	frappe.db.commit()
	return {"notify_on_sale": bool(frappe.db.get_value("Company", _company(), "cago_notify_on_sale"))}


@frappe.whitelist()
def set_notify_config(owner_phone=None):
	"""Owner sets the shop's contact phone (alerts / support escalation). Business field."""
	ensure_owner()
	if owner_phone is not None:
		frappe.db.set_value("Company", _company(), "cago_owner_phone", clean_phone(owner_phone))
	frappe.db.commit()
	return get_notify_config()


@frappe.whitelist()
def set_webhook(webhook=None, token=None):
	"""Set the Zalo/SMS relay endpoint + bearer token — technical config, ADMIN only. Token is only
	overwritten when a non-empty value is supplied (saving the URL alone keeps the existing token)."""
	ensure_admin()
	from cago.utils.secrets import set_secret

	c = _company()
	if webhook is not None:
		frappe.db.set_value("Company", c, "cago_notify_webhook", (webhook or "").strip())
	if token:
		set_secret("Company", c, "cago_notify_token", token)
	frappe.db.commit()
	return get_notify_config()


@frappe.whitelist()
def set_telegram(bot_token=None, chat_id=None, owner_ids=None):
	"""Set the Telegram ops bot token + chat id + owner Telegram IDs — technical config, ADMIN only.
	`owner_ids` (comma/space-separated Telegram user IDs) are who may run the sensitive owner commands
	(doanh thu / công nợ) in a private chat — staff in the group only get operational commands. Token
	is only overwritten when a non-empty value is supplied."""
	ensure_admin()
	from cago.utils.secrets import set_secret

	c = _company()
	if bot_token:
		set_secret("Company", c, "cago_telegram_bot_token", bot_token)
	if chat_id is not None:
		frappe.db.set_value("Company", c, "cago_telegram_chat_id", (chat_id or "").strip())
	if owner_ids is not None:
		frappe.db.set_value("Company", c, "cago_telegram_owner_ids", (owner_ids or "").strip())
	frappe.db.commit()
	return get_notify_config()


@frappe.whitelist()
def telegram_test():
	"""Send a test message to the Telegram ops chat so the admin can confirm the bot is wired."""
	ensure_admin()
	res = notify_telegram("✅ Cago: kết nối Telegram thành công. Cảnh báo & đơn mới sẽ gửi vào đây.")
	if not res.get("sent"):
		frappe.throw(_("Chưa gửi được ({0}). Kiểm tra Bot Token & Chat ID.").format(res.get("reason")))
	return res


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
