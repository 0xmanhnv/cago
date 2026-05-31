# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Session bootstrap for the decoupled Next.js frontend.

A single call the SPA makes on load (and after login) to learn who the user is,
their roles, a CSRF token for write requests, and the small pieces of branding the
old server-rendered pages used to inject (persona, brand, POS Awesome availability).

The role list is for UI gating only — every owner/staff API still enforces its own
server-side guard (see utils/permissions.py), so a forged client role grants nothing.
"""

import frappe

from cago.chatbot import config as chatbot_config


@frappe.whitelist(allow_guest=True)
def bootstrap():
	"""Everything the frontend needs once per load. Safe for guests (kiosk)."""
	return {
		"user": frappe.session.user,
		"is_guest": frappe.session.user == "Guest",
		"roles": frappe.get_roles(),
		"csrf_token": frappe.sessions.get_csrf_token(),
		"brand": frappe.db.get_single_value("Website Settings", "app_name") or "AgriMate",
		"persona": chatbot_config.persona(),
		"kiosk_chips": chatbot_config.kiosk_chips(),
		"has_posawesome": "posawesome" in frappe.get_installed_apps(),
	}
