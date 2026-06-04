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
def create_request(reason, note=None, kiosk_label=None, focus_item=None, focus_name=None, question=None, session_id=None):
	"""Kiosk creates a support request. No login / phone required — speed matters in-store."""
	from cago.utils.ratelimit import rate_guard

	rate_guard("support", limit=10, seconds=60)
	reason = (reason or "").strip()[:140] or "Khác"
	if focus_item and not frappe.db.exists("Item", focus_item):
		focus_item = None
	doc = frappe.new_doc(_DT)
	doc.status = "pending"
	doc.reason = reason
	doc.note = (note or "").strip()[:500] or None
	doc.kiosk_label = (kiosk_label or "Kiosk").strip()[:80]
	doc.session_id = (session_id or "")[:120] or None
	doc.question = (question or "").strip()[:1000] or None
	if focus_item:
		doc.focus_item = focus_item
		doc.focus_item_name = focus_name or frappe.db.get_value("Item", focus_item, "item_name")
		doc.location_text = _location_for(focus_item)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	_broadcast(doc, "cago_support_new")
	_notify_staff(doc)
	return _public_view(doc)


def _notify_staff(doc):
	"""Best-effort Zalo/SMS to the owner so someone is alerted even if no /pos is open."""
	try:
		from cago.api import notify

		bits = [f"🔔 Khách cần hỗ trợ ({doc.kiosk_label})", f"❓ {doc.reason}"]
		if doc.focus_item_name:
			where = f" — {doc.location_text}" if doc.location_text else ""
			bits.append(f"🛒 Đang xem: {doc.focus_item_name}{where}")
		if doc.question:
			bits.append(f"💬 {doc.question}")
		if doc.note:
			bits.append(f"📝 {doc.note}")
		notify.send_owner("\n".join(bits))
	except Exception:
		pass


@frappe.whitelist(allow_guest=True)
def request_status(name):
	"""Kiosk polls its own request for status changes (pending → accepted → resolved/expired)."""
	if not frappe.db.exists(_DT, name):
		return {"name": name, "status": "cancelled", "assigned_name": ""}
	return _public_view(frappe.get_doc(_DT, name))


@frappe.whitelist(allow_guest=True)
def cancel_request(name, session_id=None):
	"""Customer cancels (only while still open, and only their own session's request)."""
	if not frappe.db.exists(_DT, name):
		return {"ok": True}
	doc = frappe.get_doc(_DT, name)
	if session_id and doc.session_id and session_id != doc.session_id:
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
	"""Staff queue: open requests (pending+accepted) newest first; optionally recent resolved."""
	ensure_cap("sell")
	from frappe.utils import cint

	statuses = ["pending", "accepted"] + (["resolved", "expired"] if cint(include_done) else [])
	rows = frappe.get_all(
		_DT,
		filters={"status": ["in", statuses]},
		fields=["name", "status", "reason", "kiosk_label", "focus_item_name", "location_text",
			"question", "note", "assigned_name", "creation", "accepted_at"],
		order_by="creation desc",
		limit=60,
	)
	return rows


@frappe.whitelist()
def pending_count():
	"""Lightweight badge count for the /pos header poll."""
	ensure_cap("sell")
	return frappe.db.count(_DT, {"status": "pending"})


@frappe.whitelist()
def accept_request(name):
	"""Staff claims a request → kiosk shows 'nhân viên đang đến'."""
	ensure_cap("sell")
	doc = frappe.get_doc(_DT, name)
	if doc.status == "pending":
		doc.status = "accepted"
		doc.assigned_to = frappe.session.user
		doc.assigned_name = frappe.utils.get_fullname(frappe.session.user)
		doc.accepted_at = now_datetime()
		doc.save(ignore_permissions=True)
		frappe.db.commit()
		_broadcast(doc)
	return _public_view(doc)


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
		notify.send_owner(f"⚠️ Khách gọi nhân viên ở {doc.kiosk_label} chưa ai xử lý ({doc.reason}). Nhờ cô xem giúp ạ.")
	frappe.db.commit()
