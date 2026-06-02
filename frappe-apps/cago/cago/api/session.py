# Copyright (c) 2026, 0xManhnv
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
	has_posawesome = "posawesome" in frappe.get_installed_apps()
	# Only surface the POS Awesome URL to users who can actually open its desk page (Sales User
	# etc.) — so mobile staff don't see a button that 404s with "Not permitted".
	pos_url = None
	if has_posawesome and frappe.db.exists("Page", "posapp"):
		page_roles = {r.role for r in frappe.get_doc("Page", "posapp").roles}
		if page_roles & set(frappe.get_roles()):
			pos_url = "/app/posapp"  # version-stable entry; Frappe redirects /app->/desk; Next proxies both
	return {
		"user": frappe.session.user,
		"full_name": (frappe.session.user != "Guest" and frappe.db.get_value("User", frappe.session.user, "full_name")) or "",
		"is_guest": frappe.session.user == "Guest",
		"roles": frappe.get_roles(),
		"csrf_token": frappe.sessions.get_csrf_token(),
		"brand": frappe.db.get_single_value("Website Settings", "app_name") or "Minh Tuyết",
		"persona": chatbot_config.persona(),
		"kiosk_chips": chatbot_config.kiosk_chips(),
		"kiosk_debt_visible": _kiosk_debt_visible(),
		"allow_price_edit": _allow_price_edit(),
		"staff_can_collect_debt": _staff_can_collect_debt(),
		"has_posawesome": has_posawesome,
		# Single source of truth for the POS Awesome desk URL (frontend never hardcodes the
		# desk path), gated to users who can open it. None = hide the button.
		"pos_url": pos_url,
		# Is a store map published? Gate the kiosk "Sơ đồ cửa hàng" tile + product "Xem vị trí".
		"store_map": _store_map_published(),
	}


def _store_map_published():
	# Guarded: bootstrap runs on every page; tolerate the doctype not existing yet (pre-migrate).
	try:
		return bool(frappe.db.get_single_value("Cago Store Map", "is_published"))
	except Exception:
		return False


def _company():
	return frappe.defaults.get_global_default("company") or (frappe.get_all("Company", pluck="name") or [None])[0]


def _kiosk_debt_visible():
	company = _company()
	return bool(company and frappe.db.get_value("Company", company, "cago_kiosk_debt_visible"))


def _allow_price_edit():
	"""Owner toggle: may staff edit the per-line price at the till (mặc cả / bớt giá)?
	UI hint only — the server re-checks this before honouring any rate override in quick_sale."""
	company = _company()
	return bool(company and frappe.db.get_value("Company", company, "cago_allow_price_edit"))


def _staff_can_collect_debt():
	"""Owner toggle: may staff record customer debt repayments? UI hint only — debt.record_repayment
	re-checks via ensure_can_collect_debt."""
	company = _company()
	return bool(company and frappe.db.get_value("Company", company, "cago_staff_can_collect_debt"))
