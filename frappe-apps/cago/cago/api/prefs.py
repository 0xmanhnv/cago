# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Per-account UI preferences (so a setting like the owner home layout follows the user across
devices, not just one browser)."""

import frappe
from frappe import _


def _ensure_user():
	if frappe.session.user == "Guest":
		frappe.throw(_("Cần đăng nhập."), frappe.PermissionError)
	return frappe.session.user


@frappe.whitelist()
def get_home_favorites():
	"""Ordered list of owner-home tile keys this user pinned to '⭐ Hay dùng'."""
	user = _ensure_user()
	raw = frappe.db.get_value("User", user, "cago_home_favorites")
	try:
		val = frappe.parse_json(raw) if raw else []
		return val if isinstance(val, list) else []
	except Exception:
		return []


@frappe.whitelist()
def set_home_favorites(keys):
	"""Save the pinned/ordered tile keys for this user."""
	user = _ensure_user()
	keys = frappe.parse_json(keys) if isinstance(keys, str) else (keys or [])
	keys = [str(k) for k in keys if k][:40]
	frappe.db.set_value("User", user, "cago_home_favorites", frappe.as_json(keys))
	frappe.db.commit()
	return {"ok": True}
