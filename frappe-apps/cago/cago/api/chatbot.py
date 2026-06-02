# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Role-scoped chatbot endpoints.

The role is decided server-side from the session/endpoint, never from a client field,
so customers/staff can only ever receive data their role allows.
"""

import frappe

from cago.chatbot import orchestrator
from cago.utils.permissions import ensure_internal, ensure_owner


def _history(history):
	if not history:
		return None
	return frappe.parse_json(history) if isinstance(history, str) else history


@frappe.whitelist(allow_guest=True)
def ask_kiosk(message, history=None, session_id=None, phone=None, focus_item=None, focus_category=None):
	"""Public/customer chat — public-safe product data only.

	Rate-limited per IP (guest endpoint + LLM cost protection).

	`session_id` (client-generated) groups a conversation; `phone` is OPTIONAL — used
	only if the customer chooses to leave it so the shop can follow up. `focus_item`/
	`focus_category` are what the customer is viewing, so context-free questions
	("còn hàng không?") resolve against that product/category.
	"""
	from cago.utils.ratelimit import rate_guard

	rate_guard("chat", limit=30, seconds=60)
	return orchestrator.ask(
		"customer", message, _history(history),
		session_id=session_id, customer_phone=phone,
		focus_item=focus_item, focus_category=focus_category,
	)


@frappe.whitelist()
def ask_staff(message, history=None):
	"""Staff chat — staff-safe fields (advice, shelf, alternatives). No buying price."""
	ensure_internal()
	return orchestrator.ask("staff", message, _history(history))


@frappe.whitelist()
def ask_owner(message, history=None):
	"""Owner chat — owner-safe fields. Product Q&A only in v1."""
	ensure_owner()
	return orchestrator.ask("owner", message, _history(history))
