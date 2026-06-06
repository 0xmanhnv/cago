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
from frappe import _

from cago.api.debt import _company
from cago.utils.permissions import ensure_admin, ensure_internal

# Sensitive owner commands (revenue / debt / digest-with-debt) — answered only in a PRIVATE chat with
# an owner, never in the shared staff group. Operational commands are available to staff in the group.
_OWNER_CMDS = {"/doanhthu", "/no", "/viec", "/banchay", "/duyet"}
_STAFF_CMDS = {"/tonkho", "/nhaphang"}

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


_PERIODS = {"today": "hôm nay", "week": "tuần này", "month": "tháng này"}


def _reply_doanhthu(period="today") -> str:
	from cago.api import reports

	period = period if period in _PERIODS else "today"
	s = reports.period_summary(period)
	return f"💰 <b>Doanh thu {_PERIODS[period]}</b>\n{s['sales_total_text']} · {s['invoice_count']} hoá đơn"


def _reply_no() -> str:
	from cago.api import reports

	rows = reports.debt_list()
	if not rows:
		return "📒 Không có khách nào còn nợ. 🎉"
	top = rows[:10]
	total = sum(r["outstanding"] for r in rows)
	lines = [f"{i + 1}. {r['customer_name']}{(' · ' + r['village']) if r.get('village') else ''} — {r['outstanding_text']}" for i, r in enumerate(top)]
	more = f"\n… và {len(rows) - len(top)} khách khác" if len(rows) > len(top) else ""
	hint = "\n<i>Bấm 🔔 Nhắc 1–5 để gửi tin nhắc nợ (có xác nhận trước khi gửi).</i>" if top else ""
	return f"📒 <b>Khách còn nợ</b> — tổng {reports.dto.format_price(total)}\n" + "\n".join(lines) + more + hint


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


def _reply_topsell() -> str:
	from cago.api import reports

	rows = reports.best_sellers(limit=10) or []
	if not rows:
		return "🏆 Chưa có dữ liệu bán chạy."
	lines = [f"{i + 1}. {r.get('display_name') or r.get('item_code')} — {r.get('qty_text') or r.get('sold') or ''}" for i, r in enumerate(rows[:10])]
	return "🏆 <b>Bán chạy</b>\n" + "\n".join(lines)


def _reply_reorder() -> str:
	from cago.api import purchasing

	rows = purchasing.reorder_suggestions() or []
	if not rows:
		return "🛒 Chưa cần nhập thêm — tồn kho ổn."
	top = rows[:15]
	lines = [f"• {r.get('display_name') or r.get('item_code')} — còn {r.get('qty', r.get('actual_qty', ''))}{(' · gợi ý nhập ' + str(r['suggest'])) if r.get('suggest') else ''}" for r in top]
	more = f"\n… và {len(rows) - len(top)} mặt hàng khác" if len(rows) > len(top) else ""
	return "🛒 <b>Gợi ý nhập hàng</b>\n" + "\n".join(lines) + more


def _reply_leads() -> str:
	rows = frappe.get_all("Customer", filters={"cago_unverified": 1}, fields=["customer_name", "mobile_no", "cago_slug"], limit=20)
	if not rows:
		return "✅ Không có khách nào chờ duyệt mua chịu."
	lines = [f"{i + 1}. {r.customer_name}{(' · ' + r.mobile_no) if r.mobile_no else ''}" for i, r in enumerate(rows[:20])]
	return "🪪 <b>Khách tự đăng ký — chờ duyệt mua chịu</b>\n" + "\n".join(lines) + "\n<i>Bấm ✅ Duyệt 1–5 để duyệt (có xác nhận trước).</i>"


def _reply_product(query) -> str:
	"""Quick price/stock/shelf lookup for staff — type a product name, get the essentials + safety."""
	from cago.utils import dto

	cards = dto.list_dtos(query, audience="staff", limit=5) or []
	if not cards:
		return f"🔎 Không tìm thấy “{query}”. Thử tên khác / biệt danh nhé."
	out = []
	for c in cards[:5]:
		bits = [f"<b>{c.get('display_name')}</b> — {c.get('price_text', '')}"]
		extra = " · ".join(x for x in [c.get("stock_status"), (("Kệ " + c["shelf_location"]) if c.get("shelf_location") else None)] if x)
		if extra:
			bits.append(extra)
		if c.get("is_chemical"):
			bits.append("⚠️ Hoá chất — đọc kỹ nhãn, để xa trẻ em/vật nuôi.")
		out.append("\n".join(bits))
	return "🔎 <b>Kết quả</b>\n" + "\n\n".join(out)


_COMMANDS = {
	"/doanhthu": _reply_doanhthu,
	"/no": _reply_no,
	"/tonkho": _reply_tonkho,
	"/viec": _reply_viec,
	"/banchay": _reply_topsell,
	"/nhaphang": _reply_reorder,
	"/duyet": _reply_leads,
}


def _menu(is_owner, in_group):
	"""Tappable shortcut buttons under every reply — so the owner navigates without typing. Role/
	context aware: the owner's sensitive shortcuts only in a private chat (not the staff group)."""
	if is_owner and not in_group:
		return [
			{"text": "💰 Doanh thu", "cb": "cmd:doanhthu"}, {"text": "📒 Công nợ", "cb": "cmd:no"},
			{"text": "📦 Tồn kho", "cb": "cmd:tonkho"}, {"text": "🗓 Việc", "cb": "cmd:viec"},
			{"text": "🏆 Bán chạy", "cb": "cmd:banchay"}, {"text": "🛒 Nhập hàng", "cb": "cmd:nhaphang"},
			{"text": "🪪 Chờ duyệt", "cb": "cmd:duyet"},
		]
	return [{"text": "📦 Tồn kho", "cb": "cmd:tonkho"}, {"text": "🛒 Nhập hàng", "cb": "cmd:nhaphang"}]


_REPORT_CMDS = {"/doanhthu", "/no", "/tonkho", "/viec", "/banchay", "/nhaphang", "/duyet"}
# Each report view deep-links to the matching app screen (needs the public URL set).
_APP_PATHS = {
	"/doanhthu": "/pos/reports", "/no": "/pos/debt", "/tonkho": "/pos/low-stock", "/viec": "/pos",
	"/banchay": "/pos/reports", "/nhaphang": "/pos/reorder", "/duyet": "/pos/debt",
}


def _open_app_button(cmd, in_group):
	"""A '📲 Mở app' button to the relevant screen — only when the public URL is set. In a private chat
	it's a Web App button (opens INSIDE Telegram like a mini-app, no 'open link?' prompt); in a group
	Web App buttons aren't allowed, so fall back to a normal link."""
	from cago.api.integrations import public_url

	base = public_url()
	if not base:
		return None
	url = f"{base}{_APP_PATHS.get(cmd, '/pos')}"
	return {"text": "📲 Mở app", "url": url} if in_group else {"text": "📲 Mở app", "webapp": url}


def _report_actions(cmd, is_owner):
	"""Data-driven action buttons under a report: 🔔 Nhắc <khách> on /no, ✅ Duyệt <khách> on /duyet
	(top 5). Runs elevated because the webhook itself is a Guest request."""
	if not is_owner or cmd not in ("/no", "/duyet"):
		return []
	from cago.utils.privileged import as_user

	btns = []
	try:
		with as_user("Administrator"):
			if cmd == "/no":
				from cago.api import reports

				# Numbered to match the "1. 2. 3…" rows in the message — a short label never gets
				# truncated by Telegram's button width, and the confirm step shows the full name anyway.
				for i, r in enumerate((reports.debt_list() or [])[:5]):
					btns.append({"text": f"🔔 Nhắc {i + 1}", "cb": f"debt:remind:{r['slug']}"})
			else:  # /duyet
				for i, c in enumerate(frappe.get_all("Customer", filters={"cago_unverified": 1}, fields=["customer_name", "cago_slug"], limit=5)):
					btns.append({"text": f"✅ Duyệt {i + 1}", "cb": f"lead:verify:{c.cago_slug}"})
	except Exception:  # noqa: BLE001
		pass
	return btns


def _buttons_for(cmd, is_owner, in_group):
	"""Per-reply inline buttons. On the MENU/welcome → the shortcut grid (drill in). On a REPORT view →
	action buttons (nhắc nợ / duyệt) + extras (revenue period) + 📲 Mở app + ⬅️ Menu — reads like an app."""
	app = _open_app_button(cmd, in_group)
	if cmd in _REPORT_CMDS:
		btns = _report_actions(cmd, is_owner)
		if cmd == "/doanhthu" and is_owner and not in_group:
			btns += [
				{"text": "Hôm nay", "cb": "cmd:doanhthu:today"}, {"text": "Tuần", "cb": "cmd:doanhthu:week"},
				{"text": "Tháng", "cb": "cmd:doanhthu:month"},
			]
		if app:
			btns.append(app)
		btns.append({"text": "⬅️ Menu", "cb": "cmd:menu"})
		return btns
	return _menu(is_owner, in_group) + ([app] if app else [])


def _welcome(is_owner, in_group):
	if is_owner and not in_group:
		return "👋 <b>Cago — trợ lý chủ cửa hàng</b>\nBấm nút bên dưới để xem nhanh, hoặc gõ lệnh. Doanh thu/công nợ chỉ hiện ở chat riêng này nên nhân viên không thấy."
	return "👋 <b>Cago — trợ lý cửa hàng</b>\nBấm 📦 Tồn kho bên dưới, hoặc gõ /tonkho /myid.\n<i>Doanh thu/công nợ chỉ chủ xem (nhắn riêng cho bot).</i>"


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
	# Tap-to-act buttons (Xác nhận / Đang giao / …) arrive as a callback_query, handled separately.
	if data.get("callback_query"):
		_handle_callback(data["callback_query"])
		return {"ok": True}
	# Inline mode: "@bot cám" typed in ANY chat → tra giá nhanh (recognized staff only).
	if data.get("inline_query"):
		_handle_inline_query(data["inline_query"])
		return {"ok": True}
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
		try:
			reply = _consume_link(arg, from_id)
		except Exception:  # noqa: BLE001 — a bind hiccup must never 500 the webhook (Telegram would retry)
			frappe.log_error(title="Cago telegram link failed", message=frappe.get_traceback())
			reply = "Chưa liên kết được, bác thử lại sau ít phút nhé."
		notify_telegram(reply, chat_id=chat_id)
		return {"ok": True}

	reply, buttons = _route(cmd, text, from_id, chat_id)
	if reply is not None:
		# Reply to the chat the command came from (private stays private) + tappable shortcut menu.
		notify_telegram(reply, chat_id=chat_id, buttons=buttons)
	return {"ok": True}


def _route(cmd, text, from_id, chat_id):
	"""Decide the bot's reply (text, buttons) for an inbound message, AFTER the secret check. Returns
	(None, None) to stay silent. Two gates:
	1. Only the configured ops group or a valid private chat is answered at all.
	2. Only a RECOGNIZED sender — one whose Telegram id is LINKED to a Cago user, or is in the owner
	   allowlist — sees any store data. An un-linked person (even sitting in the ops group) is asked to
	   link first; group membership alone no longer reveals stock / nhập-hàng / any figures.
	/myid is always allowed (it's how a new person gets the id to link / be added)."""
	is_owner, in_group, linked, private_ok = _context(from_id, chat_id)
	is_private = bool(chat_id) and chat_id == from_id
	# /myid is always answerable from a direct chat or the ops group — it only echoes the sender's own
	# id, and it's the bootstrap for getting linked / added to the owner list (works before recognition).
	if cmd == "/myid" and (is_private or in_group):
		return _handle("/myid", from_id, is_owner, in_group), None
	if not chat_id or not (in_group or private_ok):
		return None, None
	# private_ok already implies linked/owner, so an unrecognized sender can only be an un-linked
	# member of the ops group → prompt them to link instead of showing data.
	if not (bool(linked) or is_owner):
		return _link_prompt(), _link_buttons(in_group)
	# /start (no code) and /menu → the friendly button menu; a /command → its handler; plain text →
	# quick product lookup (tra giá).
	if cmd in ("/start", "/menu"):
		reply = _welcome(is_owner, in_group)
	elif cmd.startswith("/"):
		reply = _handle(cmd, from_id, is_owner, in_group)
	else:
		reply = _lookup_product(text)
	return reply, _buttons_for(cmd, is_owner, in_group)


def _link_prompt():
	return (
		"🔒 <b>Bạn chưa liên kết tài khoản Cago</b>\n"
		"Nên chưa xem được số liệu cửa hàng (tồn kho, nhập hàng, doanh thu…).\n"
		"Mở app Cago → <b>🔗 Liên kết Telegram</b> để dùng trợ lý.\n"
		"<i>Gõ /myid để xem ID Telegram của bạn.</i>"
	)


def _link_buttons(in_group):
	"""A '📲 Mở app' button to the self-link screen — Web App in a private chat, a link in a group."""
	from cago.api.integrations import public_url

	base = public_url()
	if not base:
		return []
	url = f"{base}/pos/link-telegram"
	return [{"text": "📲 Mở app", "url": url} if in_group else {"text": "📲 Mở app", "webapp": url}]


def _lookup_product(query):
	"""Plain text in the bot = a quick price/stock/shelf lookup (elevated; webhook is a Guest request)."""
	from cago.utils.privileged import as_user

	if not query:
		return _HELP_STAFF
	try:
		with as_user("Administrator"):
			return _reply_product(query)
	except Exception:  # noqa: BLE001
		return "Xin lỗi, chưa tra được. Thử tên khác nhé."


def _build_inline(query, linked):
	"""Build inline-query results (tra giá nhanh "@bot cám" in any chat). Returns (results, switch_pm):
	only a RECOGNIZED internal staff/owner gets product results (price/stock is staff info) — anyone else
	gets an empty list + a 'link your account' button. The inserted message is share-safe (name + price +
	stock + chemical safety; NO cost/margin, NO shelf location)."""
	if not (linked and _is_internal_user(linked)):
		return [], "Liên kết tài khoản để tra giá"
	if not query or len(query) < 2:
		return [], None
	from cago.api.integrations import public_url
	from cago.utils import dto
	from cago.utils.privileged import as_user

	with as_user("Administrator"):
		cards = dto.list_dtos(query, audience="staff", limit=12) or []
	base = public_url()
	results = []
	for i, c in enumerate(cards[:12]):
		name = c.get("display_name") or c.get("item_code")
		price = c.get("price_text", "")
		stock = c.get("stock_status") or ""
		msg = f"<b>{name}</b>" + (f"\n💵 {price}" if price else "") + (f"\n📦 {stock}" if stock else "")
		if c.get("is_chemical"):
			msg += "\n⚠️ Hoá chất — đọc kỹ nhãn, để xa trẻ em/vật nuôi."
		result = {
			"type": "article",
			"id": str(i),
			"title": f"{name}{(' — ' + price) if price else ''}",
			"description": " · ".join(x for x in [price, stock] if x) or "Xem chi tiết",
			"input_message_content": {"message_text": msg, "parse_mode": "HTML"},
		}
		img = c.get("image")
		if img and base and img.startswith("/"):
			result["thumbnail_url"] = base + img
		elif img and str(img).startswith("http"):
			result["thumbnail_url"] = img
		results.append(result)
	return results, None


def _answer_inline(qid, results, switch_pm=None):
	"""answerInlineQuery — short cache, personalised (results are role-gated). switch_pm shows a button
	above the results that opens the bot in a private chat (to link)."""
	payload = {"inline_query_id": qid, "results": results, "cache_time": 5, "is_personal": True}
	if switch_pm:
		payload["switch_pm_text"] = switch_pm
		payload["switch_pm_parameter"] = "link"
	_tg_api("answerInlineQuery", payload)


def _handle_inline_query(iq):
	"""Inbound inline query → role-gated product lookup. Never raises (webhook must return fast)."""
	qid = iq.get("id")
	from_id = str((iq.get("from") or {}).get("id") or "")
	query = (iq.get("query") or "").strip()
	try:
		linked = frappe.db.get_value("User", {"cago_telegram_id": from_id, "enabled": 1}, "name") if from_id else None
		results, switch_pm = _build_inline(query, linked)
		_answer_inline(qid, results, switch_pm)
	except Exception:  # noqa: BLE001
		frappe.log_error(title="Cago telegram inline", message=frappe.get_traceback())
		_answer_inline(qid, [])


def _context(from_id, chat_id):
	"""Resolve who is talking to the bot: their Cago role (linked user's real role, else the manual
	owner-id allowlist) + whether it's the ops group or a valid private chat."""
	c = _company()
	group = str(frappe.db.get_value("Company", c, "cago_telegram_chat_id") or "")
	owner_ids = {i.strip() for i in re.split(r"[,\s]+", frappe.db.get_value("Company", c, "cago_telegram_owner_ids") or "") if i.strip()}
	# Only an ENABLED linked user counts — a disabled account's stale link must not drive the bot.
	linked = frappe.db.get_value("User", {"cago_telegram_id": from_id, "enabled": 1}, "name") if from_id else None
	is_owner = (bool(linked) and _is_owner_user(linked)) or (from_id in owner_ids)
	in_group = bool(group) and chat_id == group
	private_ok = chat_id == from_id and (bool(linked) or is_owner)
	return is_owner, in_group, linked, private_ok


def _is_owner_user(user) -> bool:
	from cago.utils.permissions import is_owner_roles

	return is_owner_roles(set(frappe.get_roles(user)))


def _is_internal_user(user) -> bool:
	"""An enabled Cago staff/owner/admin User (holds an owner or capability role). Used to gate order
	actions: a linked account that is NOT internal (or is disabled) must not drive order status."""
	from cago.utils.permissions import ALL_CAP_ROLES, OWNER_ROLES

	if not user or not frappe.db.get_value("User", user, "enabled"):
		return False
	return bool(set(frappe.get_roles(user)) & (OWNER_ROLES | ALL_CAP_ROLES))


# Tap-to-act buttons on a new-order alert: callback_data "wl:<action>:<code>" → order status.
_CB_ACTIONS = {"confirm": "Confirmed", "deliver": "Delivering", "done": "Completed", "cancel": "Cancelled"}
_CB_VI = {"Confirmed": "Đã xác nhận", "Delivering": "Đang giao", "Completed": "Hoàn tất", "Cancelled": "Đã huỷ"}


def _tg_api(method, payload):
	"""Fire-and-forget Bot API call (answerCallbackQuery / editMessageText). Never raises."""
	from cago.utils.secrets import get_secret

	bot = get_secret("Company", _company(), "cago_telegram_bot_token")
	if not bot:
		return
	try:
		import requests

		requests.post(f"https://api.telegram.org/bot{bot}/{method}", json=payload, timeout=10)
	except Exception:  # noqa: BLE001
		pass


def _answer_callback(cb_id, text):
	if cb_id:
		_tg_api("answerCallbackQuery", {"callback_query_id": cb_id, "text": text})


def _handle_cmd_callback(cb):
	"""A menu shortcut button (cmd:doanhthu / cmd:no / cmd:doanhthu:week …) was tapped → run that
	command and EDIT the message in place into a live dashboard (result + the menu again), gated by
	the tapper's role exactly like a typed command."""
	from cago.api.notify import _inline_keyboard

	cb_id = cb.get("id")
	from_id = str((cb.get("from") or {}).get("id") or "")
	message = cb.get("message") or {}
	chat_id = str((message.get("chat") or {}).get("id") or "")
	message_id = message.get("message_id")
	parts = (cb.get("data") or "").split(":")
	name = parts[1] if len(parts) > 1 else ""
	period = parts[2] if len(parts) > 2 else "today"
	is_owner, in_group, _linked, _ = _context(from_id, chat_id)
	cmd = "/" + name
	if name == "menu":  # ⬅️ Menu → back to the welcome + shortcut grid
		text = _welcome(is_owner, in_group)
	elif name == "doanhthu" and is_owner and not in_group:
		from cago.utils.privileged import as_user

		try:
			# Elevate: the webhook is a Guest request, so the revenue query needs Administrator (exactly
			# like a typed /doanhthu does inside _handle). Without this the period buttons errored.
			with as_user("Administrator"):
				text = _reply_doanhthu(period)
		except Exception:  # noqa: BLE001
			text = "Xin lỗi, chưa lấy được số liệu."
	else:
		text = _handle(cmd, from_id, is_owner, in_group)
	_tg_api("editMessageText", {
		"chat_id": chat_id, "message_id": message_id, "parse_mode": "HTML", "disable_web_page_preview": True,
		"text": text, "reply_markup": {"inline_keyboard": _inline_keyboard(_buttons_for(cmd, is_owner, in_group))},
	})
	_answer_callback(cb_id, "✅")


def _owner_gate(cb):
	"""(cb_id, ok): an action button (remind/verify) is owner-only."""
	cb_id = cb.get("id")
	from_id = str((cb.get("from") or {}).get("id") or "")
	chat_id = str(((cb.get("message") or {}).get("chat") or {}).get("id") or "")
	is_owner, _g, _l, _p = _context(from_id, chat_id)
	return cb_id, is_owner


def _edit_message(cb, text, buttons):
	"""Replace the tapped message's text + buttons in place (confirm prompt / outcome)."""
	from cago.api.notify import _inline_keyboard

	message = cb.get("message") or {}
	_tg_api("editMessageText", {
		"chat_id": str((message.get("chat") or {}).get("id") or ""),
		"message_id": message.get("message_id"),
		"parse_mode": "HTML", "disable_web_page_preview": True, "text": text,
		"reply_markup": {"inline_keyboard": _inline_keyboard(buttons)},
	})


# A confirm step before any action that changes data / sends a message: the first tap shows the full
# details + an explicit Đồng ý / Thôi, only the second tap (the "!" variant) actually runs it. Telegram
# inline buttons fire on a single tap with no native confirm, so we do it ourselves — and it doubles as
# the place to show the FULL customer name (button labels are short + can be truncated by Telegram).
def _confirm_debt_remind(cb, slug):
	"""First tap on 🔔 Nhắc → confirm prompt (full name + amount) before sending the reminder."""
	cb_id, is_owner = _owner_gate(cb)
	if not is_owner:
		return _answer_callback(cb_id, "Chỉ chủ cửa hàng.")
	try:
		from cago.api.debt import get_customer_debt
		from cago.customer import resolve_customer
		from cago.utils import dto
		from cago.utils.privileged import as_user

		with as_user("Administrator"):
			cust = resolve_customer(slug)
			nm = frappe.db.get_value("Customer", cust, "customer_name")
			phone = frappe.db.get_value("Customer", cust, "mobile_no")
			bal = get_customer_debt(cust)["outstanding"]
		if not phone:
			return _answer_callback(cb_id, "Khách chưa có số điện thoại.")
		_edit_message(
			cb,
			f"🔔 <b>Gửi tin nhắc nợ?</b>\n👤 {nm}\n📱 {phone}\n💵 Còn nợ <b>{dto.format_price(bal)}</b>\n\n<i>Tin sẽ gửi qua Zalo/SMS tới khách.</i>",
			[{"text": "✅ Gửi nhắc", "cb": f"debt:remind!:{slug}"}, {"text": "✖️ Thôi", "cb": "cmd:no"}],
		)
		_answer_callback(cb_id, "")
	except Exception:  # noqa: BLE001
		_answer_callback(cb_id, "Lỗi, thử lại.")


def _handle_debt_remind(cb, slug):
	"""Confirmed 🔔 Nhắc: send the customer a debt reminder over the Zalo/SMS relay (owner-only)."""
	cb_id, is_owner = _owner_gate(cb)
	if not is_owner:
		return _answer_callback(cb_id, "Chỉ chủ cửa hàng.")
	if not (cb.get("message") or {}).get("message_id"):  # stale (>48h): the confirm buttons can't be
		return _answer_callback(cb_id, "Tin quá cũ — gõ /no để làm lại.")  # removed → avoid double-send
	try:
		from cago.api.debt import get_customer_debt
		from cago.api.notify import send_message
		from cago.customer import resolve_customer
		from cago.utils import dto
		from cago.utils.privileged import as_user

		with as_user("Administrator"):
			cust = resolve_customer(slug)
			phone = frappe.db.get_value("Customer", cust, "mobile_no")
			nm = frappe.db.get_value("Customer", cust, "customer_name")
			bal = get_customer_debt(cust)["outstanding"]
			if not phone:
				return _answer_callback(cb_id, "Khách chưa có số điện thoại.")
			res = send_message(phone, f"Cửa hàng Minh Tuyết: bác {nm} còn nợ {dto.format_price(bal)}. Khi nào tiện bác ghé trả giúp ạ, cảm ơn bác!")
		if res.get("sent"):
			_edit_message(cb, f"✅ <b>Đã gửi tin nhắc nợ</b>\n👤 {nm} — {dto.format_price(bal)}", [{"text": "📒 Công nợ", "cb": "cmd:no"}, {"text": "⬅️ Menu", "cb": "cmd:menu"}])
			_answer_callback(cb_id, "✅ Đã gửi")
		else:
			_edit_message(cb, "⚠️ <b>Chưa gửi được</b>\nChưa bật kênh gửi tin (Zalo/SMS). Vào <i>Kết nối &amp; Kênh</i> để bật.", [{"text": "⬅️ Menu", "cb": "cmd:menu"}])
			_answer_callback(cb_id, "Chưa bật kênh gửi tin")
	except Exception:  # noqa: BLE001
		frappe.log_error(title="Cago telegram debt remind", message=frappe.get_traceback())
		_answer_callback(cb_id, "Lỗi, thử lại.")


def _confirm_lead_verify(cb, slug):
	"""First tap on ✅ Duyệt → confirm prompt (full name) before approving the lead for credit."""
	cb_id, is_owner = _owner_gate(cb)
	if not is_owner:
		return _answer_callback(cb_id, "Chỉ chủ cửa hàng.")
	try:
		from cago.customer import resolve_customer
		from cago.utils.privileged import as_user

		with as_user("Administrator"):
			cust = resolve_customer(slug)
			nm = frappe.db.get_value("Customer", cust, "customer_name")
			phone = frappe.db.get_value("Customer", cust, "mobile_no")
		_edit_message(
			cb,
			f"✅ <b>Duyệt cho mua chịu?</b>\n👤 {nm}{(' · ' + phone) if phone else ''}\n\n<i>Sau khi duyệt, khách này được phép mua ghi nợ. Chỉ duyệt khi bác biết rõ khách.</i>",
			[{"text": "✅ Đồng ý duyệt", "cb": f"lead:verify!:{slug}"}, {"text": "✖️ Thôi", "cb": "cmd:duyet"}],
		)
		_answer_callback(cb_id, "")
	except Exception:  # noqa: BLE001
		_answer_callback(cb_id, "Lỗi, thử lại.")


def _handle_lead_verify(cb, slug):
	"""Confirmed ✅ Duyệt: approve a self-registered lead for buying on credit (owner-only)."""
	cb_id, is_owner = _owner_gate(cb)
	if not is_owner:
		return _answer_callback(cb_id, "Chỉ chủ cửa hàng.")
	if not (cb.get("message") or {}).get("message_id"):  # stale (>48h) → buttons can't be removed
		return _answer_callback(cb_id, "Tin quá cũ — gõ /duyet để làm lại.")
	try:
		from cago.api.debt import verify_customer
		from cago.customer import resolve_customer
		from cago.utils.privileged import as_user

		with as_user("Administrator"):
			cust = resolve_customer(slug)
			nm = frappe.db.get_value("Customer", cust, "customer_name")
			verify_customer(slug)
		_edit_message(cb, f"✅ <b>Đã duyệt cho mua chịu</b>\n👤 {nm}", [{"text": "🪪 Chờ duyệt", "cb": "cmd:duyet"}, {"text": "⬅️ Menu", "cb": "cmd:menu"}])
		_answer_callback(cb_id, "✅ Đã duyệt")
	except Exception:  # noqa: BLE001
		_answer_callback(cb_id, "Lỗi, thử lại.")


def _handle_support_action(cb, action, name):
	"""🙋 Tôi xử lý / ✅ Đã xong on a call-staff alert → claim/resolve the request AS the linked staff
	member (so it records who took it + respects their cap). Requires a linked internal user."""
	cb_id = cb.get("id")
	from_id = str((cb.get("from") or {}).get("id") or "")
	linked = frappe.db.get_value("User", {"cago_telegram_id": from_id}, "name") if from_id else None
	if not (linked and _is_internal_user(linked)):
		return _answer_callback(cb_id, "Hãy liên kết tài khoản nhân viên trong app trước.")
	if action not in ("accept", "resolve"):
		return _answer_callback(cb_id, "Hành động không hợp lệ.")
	if not (cb.get("message") or {}).get("message_id"):
		return _answer_callback(cb_id, "Tin quá cũ — mở /pos/support trong app.")
	try:
		from cago.api import support
		from cago.utils.privileged import as_user

		with as_user(linked):
			view = support.accept_request(name) if action == "accept" else support.resolve_request(name)
		who = frappe.utils.get_fullname(linked)
		base = (cb.get("message") or {}).get("text") or "Khách cần hỗ trợ"
		if action == "accept":
			# Claimed → show who's handling it + leave only the "Đã xong" + Mở buttons.
			btns = [{"text": "✅ Đã xong", "cb": f"sup:resolve:{name}"}]
			from cago.api.integrations import public_url

			b = public_url()
			if b:
				btns.append({"text": "📋 Mở", "url": f"{b}/pos/support"})
			_edit_message(cb, base + f"\n— 🙋 {who} đang xử lý", btns)
			_answer_callback(cb_id, "✅ Bạn đang xử lý")
		else:
			_edit_message(cb, base + f"\n— ✅ {who} đã xử lý xong", [])
			_answer_callback(cb_id, "✅ Đã xong")
		_ = view
	except Exception:  # noqa: BLE001
		frappe.log_error(title="Cago telegram support action", message=frappe.get_traceback())
		_answer_callback(cb_id, "Lỗi, thử lại.")


def _handle_callback(cb):
	"""A staff/owner tapped a button → run a menu command (cmd:…) or update an order's status (wl:…).
	Gated to the ops group or a linked Cago user; order actions reuse staff.set_wanted_list_status."""
	data = cb.get("data") or ""
	if data.startswith("cmd:"):
		return _handle_cmd_callback(cb)
	# "!" = the confirmed second tap (actually run it); without "!" = first tap (show confirm prompt).
	if data.startswith("debt:remind!:"):
		return _handle_debt_remind(cb, data.split(":", 2)[2])
	if data.startswith("debt:remind:"):
		return _confirm_debt_remind(cb, data.split(":", 2)[2])
	if data.startswith("lead:verify!:"):
		return _handle_lead_verify(cb, data.split(":", 2)[2])
	if data.startswith("lead:verify:"):
		return _confirm_lead_verify(cb, data.split(":", 2)[2])
	if data.startswith("sup:"):
		parts = data.split(":", 2)
		if len(parts) == 3:
			return _handle_support_action(cb, parts[1], parts[2])
	cb_id = cb.get("id")
	from_id = str((cb.get("from") or {}).get("id") or "")
	message = cb.get("message") or {}
	chat_id = str((message.get("chat") or {}).get("id") or "")
	message_id = message.get("message_id")
	parts = data.split(":", 2)
	if len(parts) != 3 or parts[0] != "wl":
		return _answer_callback(cb_id, "Lệnh không hợp lệ.")
	action, code = parts[1], parts[2]
	# Gate: order actions are a staff/owner operation → require a linked INTERNAL user. Raw ops-group
	# membership or a linked non-staff/disabled account is NOT enough (a linked customer-lead must not
	# be able to confirm/cancel orders). Matches the _route recognition gate.
	linked = frappe.db.get_value("User", {"cago_telegram_id": from_id}, "name") if from_id else None
	if not (linked and _is_internal_user(linked)):
		return _answer_callback(cb_id, "Bạn chưa có quyền — hãy liên kết tài khoản nhân viên trong app trước.")
	status = _CB_ACTIONS.get(action)
	if not status:
		return _answer_callback(cb_id, "Hành động không hợp lệ.")
	if not message_id:  # stale (>48h) message → the button-removal edit can't run, so refuse to re-act
		return _answer_callback(cb_id, "Tin quá cũ — mở lại đơn trong app để xử lý.")
	try:
		from cago.api.staff import set_wanted_list_status
		from cago.utils.privileged import as_user

		with as_user("Administrator"):
			set_wanted_list_status(code, status)
		_answer_callback(cb_id, f"✅ {code}: {_CB_VI.get(status, status)}")
		# Append the outcome + drop the buttons (no reply_markup) so it can't be tapped twice.
		_tg_api("editMessageText", {
			"chat_id": chat_id, "message_id": message_id, "parse_mode": "HTML", "disable_web_page_preview": True,
			"text": (message.get("text") or f"Đơn {code}") + f"\n— {_CB_VI.get(status, status)} ✅ (qua Telegram)",
		})
	except Exception:  # noqa: BLE001
		frappe.log_error(title="Cago telegram callback failed", message=frappe.get_traceback())
		_answer_callback(cb_id, "Lỗi, thử lại sau.")


def _link_key(code: str) -> str:
	return f"cago_tg_link:{code}"


def _mask_tg(tg_id) -> str:
	"""Show only the last 4 digits of a Telegram id in UI/notifications (don't echo the full id)."""
	s = str(tg_id or "")
	return ("•••" + s[-4:]) if len(s) >= 4 else (s or "—")


def _audit_link(user, message):
	"""Append a permanent entry to the user's timeline — a queryable audit trail of link/unlink events
	(who, what, when). Best-effort; never breaks the link itself."""
	try:
		frappe.get_doc({
			"doctype": "Comment", "comment_type": "Info", "reference_doctype": "User",
			"reference_name": user, "content": f"[Cago Telegram] {message}",
		}).insert(ignore_permissions=True)
	except Exception:  # noqa: BLE001
		pass


def _notify_in_app(user, subject):
	"""Drop an in-app Notification Log to a user (the bell) so an account owner SEES a link change even
	if their messaging channel isn't the one that changed. Best-effort."""
	try:
		frappe.get_doc({
			"doctype": "Notification Log", "for_user": user, "type": "Alert",
			"subject": subject, "document_type": "User", "document_name": user,
		}).insert(ignore_permissions=True)
	except Exception:  # noqa: BLE001
		pass


def _bind_telegram(user, tg_id):
	"""Atomically bind a Telegram id to `user`: detach the id from any OTHER account (NULL, never "" —
	UNIQUE index), record the bind + timestamp, audit, and alert any account whose link just changed.
	The bind itself is the security boundary; the alerts make a hijack VISIBLE (detect & respond)."""
	from frappe.utils import now_datetime

	prev = frappe.db.get_value("User", user, "cago_telegram_id")
	# Move the Telegram id off whatever other account currently holds it (re-link / device change).
	for other in frappe.get_all("User", filters={"cago_telegram_id": tg_id, "name": ["!=", user]}, pluck="name"):
		frappe.db.set_value("User", other, "cago_telegram_id", None)
		frappe.db.set_value("User", other, "cago_telegram_linked_at", None)
		_audit_link(other, f"Telegram {_mask_tg(tg_id)} chuyển sang tài khoản {user}")
		_notify_in_app(other, f"Telegram {_mask_tg(tg_id)} đã được gỡ khỏi tài khoản bạn (chuyển sang {user}).")
	frappe.db.set_value("User", user, "cago_telegram_id", tg_id)
	frappe.db.set_value("User", user, "cago_telegram_linked_at", now_datetime())
	_audit_link(user, f"Liên kết Telegram {_mask_tg(tg_id)}")
	_notify_in_app(user, f"Tài khoản của bạn vừa liên kết Telegram {_mask_tg(tg_id)}. Nếu không phải bạn, hãy gỡ ngay trong app.")
	frappe.db.commit()
	# If THIS account had a different Telegram before, warn that old device — it's the channel a real
	# owner would still be watching if someone replaced their link. Best-effort: the bind is already
	# durable (committed above), so a send failure here must NOT surface as failure to the caller.
	if prev and str(prev) != str(tg_id):
		try:
			from cago.api.notify import notify_telegram

			notify_telegram("⚠️ Liên kết Telegram của tài khoản này vừa được thay bằng thiết bị khác. Nếu không phải bạn, hãy mở app kiểm tra ngay.", chat_id=prev)
		except Exception:  # noqa: BLE001
			pass


def _pending_key(user) -> str:
	return f"cago_tg_pending:{user}"


def _consume_link(code: str, from_id: str) -> str:
	"""A user tapped the deep-link → bind their Telegram id to the Cago account that minted `code`.
	STEP-UP for owner-tier accounts: instead of binding on the spot (a leaked code could otherwise bind
	an attacker's Telegram to a privileged account), the link is held PENDING until confirmed from the
	logged-in app — only someone with that account's session can finish it. Staff bind immediately."""
	if not from_id:
		return "Không đọc được tài khoản Telegram của bạn."
	user = frappe.cache().get_value(_link_key(code))
	if not user or not frappe.db.exists("User", user):
		return "Mã liên kết không hợp lệ hoặc đã hết hạn. Mở lại app và bấm 'Liên kết Telegram'."
	frappe.cache().delete_value(_link_key(code))  # single-use
	if _is_owner_user(user):
		# High-privilege account → require confirmation from inside the app (can't be done by a stranger
		# who merely intercepted the code). Stash the pending Telegram id for confirm_link().
		frappe.cache().set_value(_pending_key(user), from_id, expires_in_sec=600)
		_audit_link(user, f"Yêu cầu liên kết Telegram {_mask_tg(from_id)} — chờ xác nhận trong app")
		_notify_in_app(user, f"Có yêu cầu liên kết Telegram {_mask_tg(from_id)} vào tài khoản chủ của bạn. Mở app để Xác nhận hoặc Từ chối.")
		return (
			f"🔒 Tài khoản <b>{user}</b> là tài khoản CHỦ. Để bảo vệ, hãy mở app Cago (đang đăng nhập tài khoản này) "
			"và bấm <b>Xác nhận liên kết</b>. Yêu cầu hết hạn sau 10 phút."
		)
	_bind_telegram(user, from_id)
	return f"✅ Đã liên kết Telegram với tài khoản <b>{user}</b>. Từ giờ lệnh hiện theo đúng quyền của bạn."


def _check_init_data(init_data, bot):
	"""Pure HMAC check of Telegram Mini App `initData` against a given bot token. Returns
	(ok, user_dict, reason). The signature is computed with the bot token, so a valid hash PROVES the
	data came from Telegram for THIS bot and wasn't forged — this is the auth, no password needed.
	Algorithm (per Telegram docs): secret = HMAC_SHA256("WebAppData", bot_token);
	hash == HMAC_SHA256(secret, "\\n".join sorted "key=value" excluding hash). Also rejects stale data."""
	import hashlib
	import hmac
	import json as _json
	import time
	from urllib.parse import parse_qsl

	if not init_data:
		return False, {}, "empty"
	if not bot:
		return False, {}, "no_bot"
	try:
		pairs = dict(parse_qsl(init_data, keep_blank_values=True))
	except Exception:  # noqa: BLE001
		return False, {}, "parse"
	received = pairs.pop("hash", "")
	if not received:
		return False, {}, "no_hash"
	# `signature` (Telegram's newer Ed25519 third-party-validation field) is excluded from the HMAC
	# data-check string just like `hash` — otherwise a client that sends it would fail verification.
	pairs.pop("signature", None)
	data_check = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
	secret_key = hmac.new(b"WebAppData", bot.encode(), hashlib.sha256).digest()
	calc = hmac.new(secret_key, data_check.encode(), hashlib.sha256).hexdigest()
	if not hmac.compare_digest(calc, received):
		return False, {}, "bad_sig"
	# Replay guard: require a fresh auth_date — reject missing/zero, a far-future stamp (clock-skew
	# tolerance 5 min), or anything older than ~24h. A signature with no auth_date would otherwise be
	# valid forever.
	try:
		auth_date = int(pairs.get("auth_date") or 0)
	except Exception:  # noqa: BLE001
		auth_date = 0
	now = int(time.time())
	if auth_date <= 0 or auth_date > now + 300 or (now - auth_date) > 86400:
		return False, {}, "stale"
	try:
		user = _json.loads(pairs.get("user") or "{}")
	except Exception:  # noqa: BLE001
		user = {}
	return True, user, ""


def _verify_init_data(init_data):
	"""_check_init_data against the shop's configured bot token (read from the encrypted secret)."""
	from cago.utils.secrets import get_secret

	return _check_init_data(init_data, get_secret("Company", _company(), "cago_telegram_bot_token"))


@frappe.whitelist(allow_guest=True)
def miniapp_login(init_data=None):
	"""One-tap login from inside the Telegram Mini App. The WebApp passes Telegram's signed `init_data`;
	we verify its HMAC against the bot token (un-forgeable) and start a real session for the Cago user
	linked to that Telegram id — no password. Returns {ok:false, reason} (→ the app shows the normal
	login form) when the signature is bad/stale, the bot isn't configured, or the account isn't linked
	yet. Only a LINKED Telegram account logs in, so this can't impersonate an arbitrary user."""
	try:
		ok, tg_user, reason = _verify_init_data(init_data)
		if not ok:
			return {"ok": False, "reason": reason}
		tg_id = str(tg_user.get("id") or "")
		user = frappe.db.get_value("User", {"cago_telegram_id": tg_id}, "name") if tg_id else None
		if not user:
			return {"ok": False, "reason": "not_linked"}
		if not frappe.db.get_value("User", user, "enabled"):
			return {"ok": False, "reason": "disabled"}
		# Establish a real Frappe session (sets the sid cookie) for the linked user.
		frappe.local.login_manager.user = user
		frappe.local.login_manager.post_login()
		frappe.db.commit()
		return {"ok": True, "user": user}
	except Exception:  # noqa: BLE001 — always return JSON so the app falls back to the password form
		frappe.log_error(title="Cago miniapp_login failed", message=frappe.get_traceback())
		return {"ok": False, "reason": "error"}


@frappe.whitelist()
def link_start():
	"""Owner/staff self-link: mint a one-time, short-lived code + a t.me deep link. Tapping it opens the
	bot, which binds the sender's Telegram id to THIS user (see _consume_link). Rate-limited (anti-abuse);
	the code is high-entropy + single-use + 10-min TTL."""
	ensure_internal()
	from cago.utils.ratelimit import rate_guard

	rate_guard("tg_link_start", limit=6, seconds=60)
	user = frappe.session.user
	code = frappe.generate_hash(length=24)  # ~high entropy bearer code (single-use, short TTL)
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
	"""Current user's link state for the 'Liên kết / Huỷ' UI: whether linked (+ masked handle & when),
	and whether an owner-tier confirmation is PENDING (step-up flow)."""
	ensure_internal()
	user = frappe.session.user
	tg = frappe.db.get_value("User", user, ["cago_telegram_id", "cago_telegram_linked_at"], as_dict=True) or {}
	pending = frappe.cache().get_value(_pending_key(user))
	return {
		"linked": bool(tg.get("cago_telegram_id")),
		"handle": _mask_tg(tg.get("cago_telegram_id")) if tg.get("cago_telegram_id") else "",
		"linked_at": str(tg.get("cago_telegram_linked_at") or "")[:16],
		"pending": _mask_tg(pending) if pending else "",
	}


@frappe.whitelist()
def confirm_link():
	"""Owner-tier step-up: finish a PENDING Telegram link from inside the logged-in app. Only the account
	holder (this session) can do this, so a leaked code redeemed by a stranger's Telegram can't complete."""
	ensure_internal()
	user = frappe.session.user
	pending = frappe.cache().get_value(_pending_key(user))
	if not pending:
		frappe.throw(_("Không có yêu cầu liên kết nào đang chờ (có thể đã hết hạn). Hãy bấm Liên kết lại."))
	frappe.cache().delete_value(_pending_key(user))
	_bind_telegram(user, pending)
	return link_status()


@frappe.whitelist()
def link_current_telegram(init_data=None):
	"""Link the CURRENT Telegram (Mini App) to the LOGGED-IN account — the strongest, simplest path: the
	signed initData proves the Telegram identity (HMAC) and the authenticated session proves account
	ownership, both held at once in one trusted context, so NO bearer code / step-up is needed (the
	password login IS the step-up). Used by the post-login 'liên kết Telegram này?' prompt in the Mini App."""
	ensure_internal()
	ok, tg_user, reason = _verify_init_data(init_data)
	if not ok:
		frappe.throw(_("Không xác thực được Telegram ({0}). Thử lại trong app Telegram.").format(reason))
	tg_id = str(tg_user.get("id") or "")
	if not tg_id:
		frappe.throw(_("Không đọc được tài khoản Telegram."))
	_bind_telegram(frappe.session.user, tg_id)
	return link_status()


@frappe.whitelist()
def reject_link():
	"""Owner-tier step-up: reject/clear a pending Telegram link request (it wasn't me)."""
	ensure_internal()
	user = frappe.session.user
	if frappe.cache().get_value(_pending_key(user)):
		frappe.cache().delete_value(_pending_key(user))
		_audit_link(user, "Từ chối yêu cầu liên kết Telegram")
	return link_status()


@frappe.whitelist()
def unlink():
	"""Detach the current user's Telegram link (and clear any pending request)."""
	ensure_internal()
	user = frappe.session.user
	# NULL, not "" — cago_telegram_id is UNIQUE and MySQL rejects a second "" (see _bind_telegram).
	frappe.db.set_value("User", user, "cago_telegram_id", None)
	frappe.db.set_value("User", user, "cago_telegram_linked_at", None)
	frappe.cache().delete_value(_pending_key(user))
	_audit_link(user, "Gỡ liên kết Telegram")
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
			# callback_query = inline buttons (menu/order actions); inline_query = "@bot cám" tra-giá in any chat.
			json={"url": hook, "secret_token": secret, "allowed_updates": ["message", "callback_query", "inline_query"]},
			timeout=10,
		)
		body = r.json()
	except Exception as e:  # noqa: BLE001
		frappe.throw(f"Không gọi được Telegram: {str(e)[:120]}")
	if not body.get("ok"):
		frappe.throw(f"Telegram từ chối: {body.get('description', 'lỗi không rõ')}")
	set_secret("Company", c, "cago_telegram_webhook_secret", secret)
	frappe.db.commit()
	_set_bot_commands()  # populate the "/" command menu + Menu button so users don't have to memorise
	return {"ok": True, "url": hook, "result": body.get("description", "")}


def _set_bot_commands():
	"""Register the bot's command list with Telegram so users get the "/" menu + a tappable Menu
	button. The list is general (all commands shown); the per-role gating is still enforced on use."""
	_tg_api("setMyCommands", {"commands": [
		{"command": "menu", "description": "☰ Menu nhanh (bấm nút)"},
		{"command": "doanhthu", "description": "💰 Doanh thu"},
		{"command": "no", "description": "📒 Khách còn nợ"},
		{"command": "tonkho", "description": "📦 Hàng sắp/đang hết"},
		{"command": "viec", "description": "🗓 Việc hôm nay"},
		{"command": "myid", "description": "🆔 Telegram ID của tôi"},
	]})


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
