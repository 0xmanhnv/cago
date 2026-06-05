# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Inbound Telegram ops bot.

The shop's Telegram chat doubles as a back-office console: the owner/staff can ask for today's
takings, debt, or low stock without opening the app. Telegram POSTs every message to `webhook()`;
we answer a few read-only commands.

Security model — this is a public (allow_guest) endpoint, so it is locked down two ways:
  1. A secret token (`cago_telegram_webhook_secret`) that we set when registering the webhook and
     Telegram echoes back in the `X-Telegram-Bot-Api-Secret-Token` header. No secret → ignored.
  2. The message must come from the shop's configured chat (`cago_telegram_chat_id`). A stranger who
     somehow forged the secret still can't query another shop's data.
Replies are sent back to that same chat via the outbound bot (cago.api.notify.notify_telegram), and
the read-only data is fetched under an elevated session (privileged.as_user) — the chat-id check is
the authorization boundary, not a Frappe role on the guest request.

Setup needs an external account + a public URL, so it's wired but configured later from cago admin:
`set_webhook(public_url)` registers with Telegram; `webhook_info()` reports status. See docs/45.
"""

from __future__ import annotations

import frappe

from cago.api.debt import _company
from cago.utils.permissions import ensure_admin

_HELP = (
	"<b>Cago — trợ lý cửa hàng</b>\n"
	"Gõ một trong các lệnh:\n"
	"/doanhthu — doanh thu hôm nay\n"
	"/no — khách còn nợ\n"
	"/tonkho — hàng sắp/đang hết\n"
	"/viec — việc cần làm hôm nay\n"
	"/help — trợ giúp"
)


def _gen_secret() -> str:
	"""A URL-safe random secret for Telegram's header check (no Math.random/Date in scripts here —
	this is server-side Python, frappe.generate_hash is fine)."""
	return frappe.generate_hash(length=32)


def _reply_doanhthu() -> str:
	from cago.api import reports

	s = reports.period_summary("today")
	return f"💰 <b>Doanh thu hôm nay</b>\n{s['sales_total_text']} · {s['invoice_count']} hoá đơn"


def _reply_no() -> str:
	from cago.api import reports

	rows = reports.debt_list()
	if not rows:
		return "📒 Không có khách nào còn nợ. 🎉"
	top = rows[:10]
	total = sum(r["outstanding"] for r in rows)
	lines = [f"• {r['customer_name']}{(' (' + r['village'] + ')') if r.get('village') else ''}: {r['outstanding_text']}" for r in top]
	more = f"\n… và {len(rows) - len(top)} khách khác" if len(rows) > len(top) else ""
	return f"📒 <b>Khách còn nợ</b> — tổng {reports.dto.format_price(total)}\n" + "\n".join(lines) + more


def _reply_tonkho() -> str:
	from cago.api import reports

	rows = reports.low_stock()
	if not rows:
		return "📦 Tồn kho ổn — không có mặt hàng nào sắp/đang hết."
	top = rows[:15]
	lines = [f"• {r.get('display_name') or r.get('item_code')} — {r.get('status', '')} ({r.get('qty', '')})" for r in top]
	more = f"\n… và {len(rows) - len(top)} mặt hàng khác" if len(rows) > len(top) else ""
	return "📦 <b>Hàng sắp / đang hết</b>\n" + "\n".join(lines) + more


def _reply_viec() -> str:
	from cago.api.alerts import digest_text

	return digest_text() or "✅ Hôm nay không có việc gì gấp."


_COMMANDS = {
	"/doanhthu": _reply_doanhthu,
	"/no": _reply_no,
	"/tonkho": _reply_tonkho,
	"/viec": _reply_viec,
}


def _handle(cmd: str) -> str:
	"""Map a command word to a reply, fetching data under an elevated session (the chat-id check in
	webhook() is the auth boundary). /start and unknown text fall back to help."""
	from cago.utils.privileged import as_user

	fn = _COMMANDS.get(cmd)
	if not fn:
		return _HELP
	try:
		with as_user("Administrator"):
			return fn()
	except Exception:  # noqa: BLE001 — never leak a traceback into the chat
		frappe.log_error(title="Cago telegram command failed", message=frappe.get_traceback())
		return "Xin lỗi, chưa lấy được số liệu. Bác thử lại sau nhé."


@frappe.whitelist(allow_guest=True)
def webhook():
	"""Telegram → us. Verify the secret header + that the message is from the shop's chat, then answer
	a read-only ops command. Always returns {ok: True} fast so Telegram doesn't retry."""
	from cago.api.notify import notify_telegram

	from cago.utils.secrets import get_secret

	c = _company()
	secret = get_secret("Company", c, "cago_telegram_webhook_secret") if c else ""
	# No secret configured → bot isn't wired; bail before touching the request (also keeps this callable
	# from a non-HTTP context). With a secret, Telegram must echo it back in the header.
	if not secret or frappe.get_request_header("X-Telegram-Bot-Api-Secret-Token") != secret:
		return {"ok": False}

	data = (frappe.request.get_json(silent=True) or {}) if getattr(frappe, "request", None) else {}
	msg = data.get("message") or data.get("edited_message") or {}
	chat_id = str((msg.get("chat") or {}).get("id") or "")
	want = str(frappe.db.get_value("Company", c, "cago_telegram_chat_id") or "")
	if not chat_id or (want and chat_id != want):
		# Message from an unknown chat — ignore silently (don't confirm the bot exists to strangers).
		return {"ok": True}

	text = (msg.get("text") or "").strip()
	cmd = text.split()[0].lower().split("@")[0] if text else ""
	notify_telegram(_handle(cmd))
	return {"ok": True}


@frappe.whitelist()
def set_webhook(public_url=None):
	"""ADMIN: register this app's /api/method/cago.api.telegram.webhook with Telegram so the bot
	forwards messages here. Generates + stores a fresh secret token. `public_url` is the app's public
	HTTPS origin (e.g. https://shop.example.com) — Telegram requires HTTPS. Needs a configured bot."""
	ensure_admin()
	from cago.utils.secrets import get_secret, set_secret

	c = _company()
	bot = get_secret("Company", c, "cago_telegram_bot_token")
	if not bot:
		frappe.throw("Chưa có Bot Token. Nhập Bot Token Telegram trước.")
	# Default to the shop's stored public origin (Kết nối & Kênh) so the UI can register with one click.
	from cago.api.integrations import public_url as stored_public_url

	origin = ((public_url or "").strip() or stored_public_url()).rstrip("/")
	if not origin.startswith("https://"):
		frappe.throw("Cần địa chỉ công khai HTTPS (vd: https://cuahang.example.com).")
	secret = _gen_secret()
	hook = f"{origin}/api/method/cago.api.telegram.webhook"
	try:
		import requests

		r = requests.post(
			f"https://api.telegram.org/bot{bot}/setWebhook",
			json={"url": hook, "secret_token": secret, "allowed_updates": ["message"]},
			timeout=10,
		)
		body = r.json()
	except Exception as e:  # noqa: BLE001
		frappe.throw(f"Không gọi được Telegram: {str(e)[:120]}")
	if not body.get("ok"):
		frappe.throw(f"Telegram từ chối: {body.get('description', 'lỗi không rõ')}")
	set_secret("Company", c, "cago_telegram_webhook_secret", secret)
	frappe.db.commit()
	return {"ok": True, "url": hook, "result": body.get("description", "")}


@frappe.whitelist()
def webhook_info():
	"""ADMIN: ask Telegram what webhook is currently registered (URL, pending count, last error)."""
	ensure_admin()
	from cago.utils.secrets import get_secret

	c = _company()
	bot = get_secret("Company", c, "cago_telegram_bot_token")
	if not bot:
		return {"configured": False}
	try:
		import requests

		r = requests.get(f"https://api.telegram.org/bot{bot}/getWebhookInfo", timeout=10)
		info = (r.json() or {}).get("result", {})
	except Exception as e:  # noqa: BLE001
		return {"configured": True, "error": str(e)[:120]}
	return {
		"configured": True,
		"url": info.get("url", ""),
		"pending": info.get("pending_update_count", 0),
		"last_error": info.get("last_error_message", ""),
	}
