# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""In-store "call staff" support requests.

A customer at the kiosk taps "Gọi nhân viên", picks a reason, and a support request is created
with everything staff need to help fast: which kiosk, what they need, the product they were
viewing and WHERE it sits in the shop (store-map aisle), plus the chatbot question when the bot
couldn't answer. Staff see it live in /pos (realtime event + a polled queue) and Accept / Resolve;
the kiosk polls its own request to show "đang đến". A scheduled job expires stale requests and
pings the owner. Guest-creatable (kiosk has no login); staff actions need the sell capability.
See docs/27 and the store map (cago.api.storemap)."""

import frappe
from frappe import _
from frappe.utils import now_datetime

from cago.utils.permissions import ensure_cap

_DT = "Cago Support Request"
# Minutes a pending request waits before it auto-expires and the owner is pinged.
EXPIRE_AFTER_MIN = 3
# Reasons offered at the kiosk (the UI sends the label; we accept any non-empty string).
REASONS = ("Tư vấn sản phẩm", "Xem / lấy hàng", "Hỏi giá / thanh toán", "Ghi nợ / công nợ", "Trợ lý chưa trả lời được", "Khác")


def _location_for(item_code):
	"""Human aisle/zone text so staff know where to go, e.g. 'Tầng 1, khu Cám gà, kệ A2'."""
	if not item_code:
		return ""
	try:
		from cago.chatbot import storefacts

		loc = storefacts.locate(item_code)
	except Exception:
		loc = None
	if not loc:
		return ""
	parts = []
	if loc.get("floor"):
		parts.append(str(loc["floor"]))
	if loc.get("zone"):
		parts.append(f"khu {loc['zone']}")
	if loc.get("shelf"):
		parts.append(f"kệ {loc['shelf']}")
	return ", ".join(parts)


def _public_view(doc):
	"""Minimal status the kiosk may see (no internal fields)."""
	return {
		"name": doc.name,
		"status": doc.status,
		"assigned_name": doc.assigned_name or "",
		"reason": doc.reason or "",
	}


def _broadcast(doc, event="cago_support"):
	"""Push a realtime event to logged-in staff (/pos listens) + refresh the counter."""
	try:
		frappe.publish_realtime(
			event,
			{"name": doc.name, "status": doc.status, "reason": doc.reason, "kiosk": doc.kiosk_label},
			after_commit=True,
		)
	except Exception:
		pass


@frappe.whitelist(allow_guest=True)
def create_request(reason, note=None, kiosk_label=None, focus_item=None, focus_name=None,
		question=None, session_id=None, customer_name=None, customer_phone=None):
	"""Kiosk creates a support request. No login required — speed matters in-store; name/phone are
	OPTIONAL. One OPEN request per session: a customer re-tapping (or changing their need) UPDATES
	their existing pending/accepted request instead of piling up a new one — so the staff queue isn't
	spammed by one person. Distinct customers each get their own."""
	from cago.utils.ratelimit import rate_guard

	rate_guard("support", limit=20, seconds=60)
	reason = (reason or "").strip()[:140] or "Khác"
	if focus_item and not frappe.db.exists("Item", focus_item):
		focus_item = None
	session_id = (session_id or "")[:120] or None

	# Reuse this session's still-open request (dedupe), else create a new one.
	existing = None
	if session_id:
		existing = frappe.db.get_value(_DT, {"session_id": session_id, "status": ["in", ["pending", "accepted"]]}, "name")
	doc = frappe.get_doc(_DT, existing) if existing else frappe.new_doc(_DT)
	is_new = not existing
	if is_new:
		doc.status = "pending"
		doc.session_id = session_id
	doc.reason = reason
	doc.note = (note or "").strip()[:500] or None
	doc.kiosk_label = (kiosk_label or "Kiosk").strip()[:80]
	doc.question = (question or "").strip()[:1000] or None
	doc.customer_name = (customer_name or "").strip()[:80] or None
	doc.customer_phone = (customer_phone or "").strip()[:20] or None
	if focus_item:
		doc.focus_item = focus_item
		doc.focus_item_name = focus_name or frappe.db.get_value("Item", focus_item, "item_name")
		doc.location_text = _location_for(focus_item)
	doc.save(ignore_permissions=True) if existing else doc.insert(ignore_permissions=True)
	frappe.db.commit()
	if is_new:
		_broadcast(doc, "cago_support_new")
		_notify_staff(doc)
	return _public_view(doc)


def _notify_staff(doc):
	"""Best-effort Zalo/SMS to the owner so someone is alerted even if no /pos is open."""
	try:
		from cago.api import notify

		who = doc.customer_name or "Khách"
		if doc.customer_phone:
			who += f" · {doc.customer_phone}"
		bits = [f"🔔 {who} cần hỗ trợ ({doc.kiosk_label})", f"❓ {doc.reason}"]
		if doc.focus_item_name:
			where = f" — {doc.location_text}" if doc.location_text else ""
			bits.append(f"🛒 Đang xem: {doc.focus_item_name}{where}")
		if doc.question:
			bits.append(f"💬 {doc.question}")
		if doc.note:
			bits.append(f"📝 {doc.note}")
		# Tap-to-act on Telegram: a staff member claims ("Tôi xử lý") / closes ("Đã xong") the request
		# right from the chat (callbacks handled in cago.api.telegram). The "Mở" link needs the public URL.
		buttons = [
			{"text": "🙋 Tôi xử lý", "cb": f"sup:accept:{doc.name}"},
			{"text": "✅ Đã xong", "cb": f"sup:resolve:{doc.name}"},
		]
		try:
			from cago.api.integrations import public_url

			base = public_url()
			if base:
				buttons.append({"text": "📋 Mở", "url": f"{base}/pos/support"})
		except Exception:  # noqa: BLE001
			pass
		notify.notify_ops("\n".join(bits), buttons=buttons)
	except Exception:
		pass


@frappe.whitelist(allow_guest=True)
def request_status(name, session_id=None):
	"""Kiosk polls its OWN request (the session that created it) for status changes. Requests are named
	with a sequential series, so a guest must NOT be able to enumerate ids and read staff names/reasons:
	only the matching session sees the detail; anyone else gets a bare status."""
	from cago.utils.ratelimit import rate_guard

	rate_guard("support_poll", limit=120, seconds=60)
	if not frappe.db.exists(_DT, name):
		return {"name": name, "status": "cancelled", "assigned_name": "", "reason": ""}
	doc = frappe.get_doc(_DT, name)
	if doc.session_id and session_id != doc.session_id:
		return {"name": doc.name, "status": doc.status, "assigned_name": "", "reason": ""}
	return _public_view(doc)


@frappe.whitelist(allow_guest=True)
def cancel_request(name, session_id=None):
	"""Customer cancels (only while still open, and only their own session's request)."""
	from cago.utils.ratelimit import rate_guard

	rate_guard("support_poll", limit=120, seconds=60)
	if not frappe.db.exists(_DT, name):
		return {"ok": True}
	doc = frappe.get_doc(_DT, name)
	# Require a session match whenever the request HAS a session — omitting session_id must not bypass
	# the check and let a guest cancel someone else's request (queue-clearing via sequential ids).
	if doc.session_id and session_id != doc.session_id:
		return _public_view(doc)
	if doc.status in ("pending", "accepted"):
		doc.status = "cancelled"
		doc.cancelled_at = now_datetime()
		doc.save(ignore_permissions=True)
		frappe.db.commit()
		_broadcast(doc)
	return _public_view(doc)


@frappe.whitelist()
def list_requests(include_done=0):
	"""Staff queue: open requests (pending+accepted) newest first; optionally recent resolved.
	Carries who/where/when so staff can help fast. Viewing the queue marks it seen (clears the badge)."""
	ensure_cap("sell")
	from frappe.utils import cint

	statuses = ["pending", "accepted"] + (["resolved", "expired"] if cint(include_done) else [])
	rows = frappe.get_all(
		_DT,
		filters={"status": ["in", statuses]},
		fields=["name", "status", "reason", "kiosk_label", "focus_item_name", "location_text",
			"question", "note", "customer_name", "customer_phone", "assigned_name", "creation", "accepted_at"],
		order_by="creation desc",
		limit=60,
	)
	return rows


def _seen_at():
	return frappe.db.get_value("User", frappe.session.user, "cago_support_seen_at")


@frappe.whitelist()
def mark_seen():
	"""Mark the queue as read for THIS user → the 'new' badge clears until the next call arrives."""
	ensure_cap("sell")
	frappe.db.set_value("User", frappe.session.user, "cago_support_seen_at", now_datetime(), update_modified=False)
	frappe.db.commit()
	return {"ok": True}


@frappe.whitelist()
def unread_count():
	"""Badge count — NEW pending requests this user hasn't seen yet (notify-style: clears on view,
	reappears only when a newer call comes in). Falls back to all pending if never viewed."""
	ensure_cap("sell")
	seen = _seen_at()
	filters = {"status": "pending"}
	if seen:
		filters["creation"] = [">", seen]
	return frappe.db.count(_DT, filters)


# Back-compat: some clients may still poll pending_count.
@frappe.whitelist()
def pending_count():
	ensure_cap("sell")
	return frappe.db.count(_DT, {"status": "pending"})


@frappe.whitelist()
def resolve_all():
	"""Bulk-clear: mark every OPEN (pending+accepted) request resolved. For end-of-rush cleanup when
	staff has physically helped everyone. Confirmed on the client. Returns how many were closed."""
	ensure_cap("sell")
	names = frappe.get_all(_DT, filters={"status": ["in", ["pending", "accepted"]]}, pluck="name")
	for name in names:
		doc = frappe.get_doc(_DT, name)
		doc.status = "resolved"
		doc.resolved_at = now_datetime()
		doc.save(ignore_permissions=True)
		_broadcast(doc)
	frappe.db.commit()
	return {"resolved": len(names)}


@frappe.whitelist()
def accept_request(name):
	"""Staff claims a request → kiosk shows 'nhân viên đang đến'."""
	ensure_cap("sell")
	# Atomic claim: only the FIRST staffer to tap "tôi đến" wins. A guarded UPDATE (status flips only
	# while still pending) prevents two staff who both read 'pending' from both claiming it.
	user = frappe.session.user
	frappe.db.sql(
		"""update `tabCago Support Request`
		set status='accepted', assigned_to=%s, assigned_name=%s, accepted_at=%s
		where name=%s and status='pending'""",
		(user, frappe.utils.get_fullname(user), now_datetime(), name),
	)
	if frappe.db.sql("select row_count()")[0][0]:
		frappe.db.commit()
		_broadcast(frappe.get_doc(_DT, name))
	return _public_view(frappe.get_doc(_DT, name))


@frappe.whitelist()
def resolve_request(name):
	"""Staff marks a request handled → kiosk view closes."""
	ensure_cap("sell")
	doc = frappe.get_doc(_DT, name)
	if doc.status in ("pending", "accepted"):
		doc.status = "resolved"
		doc.resolved_at = now_datetime()
		doc.save(ignore_permissions=True)
		frappe.db.commit()
		_broadcast(doc)
	return _public_view(doc)


def expire_stale_requests():
	"""Scheduled: a pending request nobody accepts within EXPIRE_AFTER_MIN is expired and the owner
	is pinged (minimal escalation — right-sized for a single shop)."""
	from frappe.utils import add_to_date

	cutoff = add_to_date(now_datetime(), minutes=-EXPIRE_AFTER_MIN)
	stale = frappe.get_all(_DT, filters={"status": "pending", "creation": ["<", cutoff]}, pluck="name")
	if not stale:
		return
	from cago.api import notify

	for name in stale:
		doc = frappe.get_doc(_DT, name)
		doc.status = "expired"
		doc.save(ignore_permissions=True)
		_broadcast(doc)
		notify.notify_ops(f"⚠️ Khách gọi nhân viên ở {doc.kiosk_label} chưa ai xử lý ({doc.reason}). Nhờ cô xem giúp ạ.")
	frappe.db.commit()
