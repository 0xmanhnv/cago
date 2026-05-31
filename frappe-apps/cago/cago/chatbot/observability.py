# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Structured logging of chatbot turns.

Logs question/role/sources/provider/model/latency/safety flags — never API keys, never
full customer PII. Logging failures never break the chat response.
"""

from __future__ import annotations

import re

import frappe

_VN_MOBILE = re.compile(r"^0(3|5|7|8|9)\d{8}$")


def clean_phone(p):
	"""Validate/normalize a Vietnamese mobile number. Return '' if not valid.

	Server-side guard so a junk phone (bypassing the UI) is never stored.
	"""
	if not p:
		return ""
	s = re.sub(r"[\s.\-()]", "", str(p))
	if s.startswith("+84"):
		s = "0" + s[3:]
	elif s.startswith("84") and len(s) == 11:
		s = "0" + s[2:]
	return s if _VN_MOBILE.match(s) else ""


def log(question, role, sources, provider, model, latency_ms, safety_flags, needs_staff_help,
        session_id=None, customer_phone=None):
	try:
		frappe.get_doc(
			{
				"doctype": "Cago Chatbot Log",
				"role": role,
				"chat_user": frappe.session.user,
				"session_id": (session_id or "")[:64],
				"customer_phone": clean_phone(customer_phone),
				"question": (question or "")[:240],
				"sources": ", ".join(sources or []),
				"provider": provider,
				"model": model,
				"latency_ms": latency_ms,
				"safety_flags": ", ".join(safety_flags or []),
				"needs_staff_help": 1 if needs_staff_help else 0,
			}
		).insert(ignore_permissions=True)
		frappe.db.commit()
	except Exception:
		# Observability must never break the user-facing response.
		frappe.log_error(title="Cago Chatbot Log failed", message=frappe.get_traceback())
