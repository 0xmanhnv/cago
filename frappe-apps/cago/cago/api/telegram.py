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

import re

import frappe

from cago.api.debt import _company
from cago.utils.permissions import ensure_admin, ensure_internal

# Sensitive owner commands (revenue / debt / digest-with-debt) — answered only in a PRIVATE chat with
# an owner, never in the shared staff group. Operational commands are available to staff in the group.
_OWNER_CMDS = {"/doanhthu", "/no", "/viec"}
_STAFF_CMDS = {"/tonkho"}

_HELP_OWNER = (
	"<b>Cago — trợ lý chủ cửa hàng</b>\n"
	"/doanhthu — doanh thu hôm nay\n"
	"/no — khách còn nợ\n"
	"/tonkho — hàng sắp/đang hết\n"
	"/viec — việc cần làm hôm nay\n"
	"/myid — xem Telegram ID của bạn\n"
	"<i>Lệnh doanh thu/công nợ nhắn riêng cho bot để nhân viên không thấy.</i>"
)
_HELP_STAFF = (
	"<b>Cago — trợ lý cửa hàng</b>\n"
	"/tonkho — hàng sắp/đang hết\n"
	"/myid — xem Telegram ID của bạn\n"
	"<i>Doanh thu / công nợ chỉ chủ cửa hàng xem (nhắn riêng cho bot).</i>"
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


def _handle(cmd: str, from_id: str, is_owner: bool, in_group: bool) -> str:
	"""Reply for one command, gated by WHO sent it:
	- /myid → the sender's Telegram ID (so they can be added to the owner list).
	- owner commands (revenue/debt/digest) → only an owner, and only in a PRIVATE chat (refused in the
	  group so a reply never leaks money figures to staff).
	- staff commands (low stock) → anyone in the allowed chat.
	Data is fetched under an elevated session; the role check here is the authorisation boundary."""
	from cago.utils.privileged import as_user

	if cmd == "/myid":
		return f"Telegram ID của bạn: <code>{from_id}</code>\nĐưa ID này cho quản trị để được xem doanh thu/công nợ."
	if cmd in _OWNER_CMDS:
		if not is_owner:
			return "🔒 Lệnh này chỉ dành cho chủ cửa hàng. Gõ /myid rồi nhờ quản trị thêm ID của bạn (mục Kết nối & Kênh)."
		if in_group:
			return "📌 Để tránh lộ cho nhân viên, nhắn RIÊNG cho bot (chat 1-1) để xem doanh thu / công nợ."
	fn = _COMMANDS.get(cmd)
	if not fn:
		return _HELP_OWNER if is_owner else _HELP_STAFF
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
	from_id = str((msg.get("from") or {}).get("id") or "")
	text = (msg.get("text") or "").strip()
	parts = text.split(maxsplit=1)
	cmd = (parts[0].lower().split("@")[0]) if parts else ""
	arg = parts[1].strip() if len(parts) > 1 else ""

	# Account linking: a "/start <code>" carries a one-time code minted by the in-app "Liên kết
	# Telegram" flow — the code IS the auth, so accept it from ANY chat (the user isn't linked yet).
	if cmd == "/start" and arg:
		notify_telegram(_consume_link(arg, from_id), chat_id=chat_id)
		return {"ok": True}

	group = str(frappe.db.get_value("Company", c, "cago_telegram_chat_id") or "")
	owner_ids = {i.strip() for i in re.split(r"[,\s]+", frappe.db.get_value("Company", c, "cago_telegram_owner_ids") or "") if i.strip()}
	# Prefer the linked user's REAL Cago role; fall back to the manual owner-id allowlist.
	linked_user = frappe.db.get_value("User", {"cago_telegram_id": from_id}, "name") if from_id else None
	is_owner = (bool(linked_user) and _is_owner_user(linked_user)) or (from_id in owner_ids)
	in_group = bool(group) and chat_id == group
	private_ok = chat_id == from_id and (bool(linked_user) or is_owner)
	# Accept commands only from the configured ops group (staff context) or a linked/owner PRIVATE
	# chat. Anything else is ignored silently.
	if not chat_id or not (in_group or private_ok):
		return {"ok": True}

	# Reply to the chat the command came from (so an owner's private query stays private).
	notify_telegram(_handle(cmd, from_id, is_owner, in_group), chat_id=chat_id)
	return {"ok": True}


def _is_owner_user(user) -> bool:
	from cago.utils.permissions import is_owner_roles

	return is_owner_roles(set(frappe.get_roles(user)))


def _link_key(code: str) -> str:
	return f"cago_tg_link:{code}"


def _consume_link(code: str, from_id: str) -> str:
	"""A user tapped the deep-link → map their Telegram id to the Cago account that minted `code`."""
	if not from_id:
		return "Không đọc được tài khoản Telegram của bạn."
	user = frappe.cache().get_value(_link_key(code))
	if not user or not frappe.db.exists("User", user):
		return "Mã liên kết không hợp lệ hoặc đã hết hạn. Mở lại app và bấm 'Liên kết Telegram'."
	frappe.cache().delete_value(_link_key(code))
	# One Telegram id → one Cago user: detach it from any other account first (re-link / device change).
	for other in frappe.get_all("User", filters={"cago_telegram_id": from_id, "name": ["!=", user]}, pluck="name"):
		frappe.db.set_value("User", other, "cago_telegram_id", "")
	frappe.db.set_value("User", user, "cago_telegram_id", from_id)
	frappe.db.commit()
	return f"✅ Đã liên kết Telegram với tài khoản <b>{user}</b>. Từ giờ lệnh hiện theo đúng quyền của bạn."


@frappe.whitelist()
def link_start():
	"""Owner/staff self-link: mint a one-time code + a t.me deep link. Tapping it opens the bot, which
	maps the sender's Telegram id to THIS user (see _consume_link)."""
	ensure_internal()
	user = frappe.session.user
	code = frappe.generate_hash(length=10)
	frappe.cache().set_value(_link_key(code), user, expires_in_sec=600)
	bot = _bot_username()
	return {
		"code": code,
		"deep_link": f"https://t.me/{bot}?start={code}" if bot else "",
		"bot": bot or "",
		"expires_in_sec": 600,
	}


@frappe.whitelist()
def link_status():
	"""Whether the current user's Telegram is linked (for the 'Liên kết / Huỷ' UI)."""
	ensure_internal()
	return {"linked": bool(frappe.db.get_value("User", frappe.session.user, "cago_telegram_id"))}


@frappe.whitelist()
def unlink():
	"""Detach the current user's Telegram link."""
	ensure_internal()
	frappe.db.set_value("User", frappe.session.user, "cago_telegram_id", "")
	frappe.db.commit()
	return {"linked": False}


def _bot_username():
	"""The bot's @username (for building the t.me deep link), via getMe. Cached briefly."""
	from cago.utils.secrets import get_secret

	bot = get_secret("Company", _company(), "cago_telegram_bot_token")
	if not bot:
		return ""
	cached = frappe.cache().get_value("cago_tg_bot_username")
	if cached:
		return cached
	try:
		import requests

		r = requests.get(f"https://api.telegram.org/bot{bot}/getMe", timeout=10)
		name = ((r.json() or {}).get("result") or {}).get("username") or ""
		if name:
			frappe.cache().set_value("cago_tg_bot_username", name, expires_in_sec=86400)
		return name
	except Exception:  # noqa: BLE001
		return ""


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
