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
	"""Save the pinned/ordered home tiles for this user. Each item is {k: tile-key, w: 1|2}
	(w = column span on the 2-col grid). Legacy plain strings are accepted = width 1."""
	user = _ensure_user()
	keys = frappe.parse_json(keys) if isinstance(keys, str) else (keys or [])
	out = []
	for it in keys[:40]:
		if isinstance(it, dict) and it.get("k"):
			out.append({"k": str(it["k"]), "w": 2 if int(it.get("w") or 1) == 2 else 1})
		elif isinstance(it, str) and it:
			out.append({"k": it, "w": 1})
	frappe.db.set_value("User", user, "cago_home_favorites", frappe.as_json(out))
	frappe.db.commit()
	return {"ok": True}
