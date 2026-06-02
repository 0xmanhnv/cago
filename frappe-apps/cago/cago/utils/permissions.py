# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Server-side capability guards.

Frontend hiding is never trusted (docs/18 §4). Every internal API enforces a
capability check here. Access is granular: an account is granted one or more
capability roles (Cago Sell / Returns / Debt / Stock / Products / Reports / Cash /
Supplier / Settings). `Cago Owner` (and System Manager) is a super-role that has
EVERY capability. Kiosk APIs stay guest-allowed and only return public-safe DTOs.
See docs/27 and the unified /pos plan.
"""

import frappe
from frappe import _

# An owner is anyone who may do everything (edit prices / see margins / all caps).
# System Manager included so an admin can operate the simplified UI during setup.
OWNER_ROLES = {"Cago Owner", "System Manager"}

# capability key -> the Frappe role that grants it.
CAP_ROLES = {
	"sell": "Cago Sell",
	"returns": "Cago Returns",
	"debt": "Cago Debt",
	"stock": "Cago Stock",
	"products": "Cago Products",
	"reports": "Cago Reports",
	"cash": "Cago Cash",
	"supplier": "Cago Supplier",
	"settings": "Cago Settings",
}
ALL_CAP_ROLES = set(CAP_ROLES.values())


def _roles():
	return set(frappe.get_roles())


def is_owner():
	return bool(_roles() & OWNER_ROLES)


def is_internal():
	"""Any back-of-house user: the owner, or anyone holding at least one capability role.
	Used to gate the /pos shell and shared read-only utility endpoints."""
	return is_owner() or bool(_roles() & ALL_CAP_ROLES)


def has_cap(cap):
	"""True if the session user can use capability `cap` (owner has every capability)."""
	return is_owner() or (CAP_ROLES.get(cap) in _roles())


def is_owner_roles(roles):
	"""Owner check for an explicit role set (e.g. another user's roles)."""
	return bool(set(roles) & OWNER_ROLES)


def caps_for_user_roles(roles):
	"""Capability keys implied by an explicit role set — owner gets all."""
	if is_owner_roles(roles):
		return set(CAP_ROLES.keys())
	return {cap for cap, role in CAP_ROLES.items() if role in set(roles)}


def caps_for_user():
	"""The capability keys the session user holds — owner gets all. For session.bootstrap
	so the UI can render only the tiles a user may use."""
	return sorted(caps_for_user_roles(frappe.get_roles()))


def ensure_owner():
	if not is_owner():
		frappe.throw(_("Chỉ chủ cửa hàng mới được thực hiện thao tác này."), frappe.PermissionError)


def ensure_cap(cap):
	"""Authorise a specific capability. Owner always passes."""
	if not has_cap(cap):
		frappe.throw(_("Bạn không có quyền dùng chức năng này. Nhờ chủ cửa hàng cấp quyền."), frappe.PermissionError)


def ensure_internal():
	"""Authorise any back-of-house user (shared lookups used by several screens)."""
	if not is_internal():
		frappe.throw(_("Bạn không có quyền truy cập chức năng này."), frappe.PermissionError)


# Backward-compat alias for the legacy Frappe-native www/ fallback pages (the Next.js /pos app
# uses capability checks). "Staff" there just means "any back-of-house user".
is_staff = is_internal


def selling_limits(user=None):
	"""Per-staff bargaining allowance set by the owner. Owner = unlimited. Used by quick_sale
	(for the cashier) and session.bootstrap (for the current user) — replaces the old store-wide
	Company.cago_allow_price_edit flag."""
	user = user or frappe.session.user
	if set(frappe.get_roles(user)) & OWNER_ROLES:
		return {"allow_price_edit": True, "max_discount_pct": 100.0}
	return {
		"allow_price_edit": bool(frappe.db.get_value("User", user, "cago_allow_price_edit")),
		"max_discount_pct": frappe.utils.flt(frappe.db.get_value("User", user, "cago_max_discount_pct")),
	}


def effective_caps_for(user):
	"""The capability KEYS a user gets from the union of their assigned chức danh (Cago Job Role).
	This is the management layer; it is compiled down to the Frappe cap-roles by sync_user_caps."""
	caps = set()
	for r in frappe.get_all("Cago User Job Role", filters={"parent": user, "parenttype": "User"}, pluck="job_role"):
		for c in frappe.get_all("Cago Job Role Cap", filters={"parent": r, "parenttype": "Cago Job Role"}, pluck="capability"):
			if c in CAP_ROLES:
				caps.add(c)
	return caps


def sync_user_caps(user):
	"""Compile a user's job-role assignments into their Frappe capability roles (the enforcement
	source). Adds the cap-roles their chức danh grant and removes cap-roles no longer granted —
	leaving any non-capability roles (System Manager, etc.) untouched. Owners are never touched."""
	if user in ("Administrator", "Guest") or not frappe.db.exists("User", user):
		return
	doc = frappe.get_doc("User", user)
	if set(r.role for r in doc.roles) & OWNER_ROLES:
		return
	want = {CAP_ROLES[c] for c in effective_caps_for(user)}
	have = {r.role for r in doc.roles if r.role in ALL_CAP_ROLES}
	if want == have:
		return
	doc.set("roles", [r for r in doc.get("roles") if r.role not in ALL_CAP_ROLES])
	for role in sorted(want):
		doc.append("roles", {"role": role})
	doc.save(ignore_permissions=True)


def ensure_lang():
	"""Guard against a framework bug where get_locale_value() crashes when
	frappe.local.lang is unset (happens in console / background-job contexts).
	Submitting accounting documents evaluates jinja/date formats, so set a language.
	"""
	if not frappe.local.lang:
		frappe.local.lang = frappe.db.get_default("lang") or "en"
