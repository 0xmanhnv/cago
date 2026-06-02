# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Staff & permissions admin (owner-only).

The owner manages each employee in one place: tick the capability roles they may use (Cago Sell /
Returns / Debt / ...) and set per-staff selling limits (allow price edit, max discount %). Writes
assign/remove the Frappe roles + set the User limit fields. Owner-only so no one can self-elevate.
See docs/27 and the /pos plan.
"""

import frappe
from frappe import _
from frappe.utils import flt

from cago.utils.permissions import ALL_CAP_ROLES, CAP_ROLES, ensure_owner

_INTERNAL_ROLES = list(ALL_CAP_ROLES | {"Cago Owner"})


def _is_owner_user(roles):
	return bool(set(roles) & {"Cago Owner", "System Manager"})


def _row(user):
	info = frappe.db.get_value(
		"User", user, ["full_name", "enabled", "cago_allow_price_edit", "cago_max_discount_pct"], as_dict=True
	)
	roles = set(frappe.get_roles(user))
	owner = _is_owner_user(roles)
	caps = list(CAP_ROLES.keys()) if owner else [c for c, r in CAP_ROLES.items() if r in roles]
	return {
		"user": user,
		"full_name": info.full_name or user,
		"enabled": bool(info.enabled),
		"is_owner": owner,
		"caps": caps,
		"allow_price_edit": bool(info.cago_allow_price_edit),
		"max_discount_pct": flt(info.cago_max_discount_pct),
	}


@frappe.whitelist()
def list_staff():
	"""All back-of-house accounts (anyone holding a Cago role) with their caps + limits."""
	ensure_owner()
	rows = frappe.get_all("Has Role", filters={"role": ["in", _INTERNAL_ROLES]}, fields=["parent"], distinct=True)
	users = sorted({r.parent for r in rows} - {"Administrator", "Guest"})
	return [_row(u) for u in users]


@frappe.whitelist()
def get_staff(user):
	ensure_owner()
	if not frappe.db.exists("User", user):
		frappe.throw(_("Không tìm thấy tài khoản."))
	return _row(user)


@frappe.whitelist()
def save_staff(user, caps, allow_price_edit=0, max_discount_pct=0):
	"""Set a staff's capability roles + per-staff selling limits. Owner-only; owners are not
	editable here (they already have everything)."""
	ensure_owner()
	from frappe.utils import cint

	if user in ("Administrator", "Guest") or not frappe.db.exists("User", user):
		frappe.throw(_("Tài khoản không hợp lệ."))
	doc = frappe.get_doc("User", user)
	if _is_owner_user({r.role for r in doc.roles}):
		frappe.throw(_("Không chỉnh quyền của chủ cửa hàng ở đây."))

	caps = frappe.parse_json(caps) if isinstance(caps, str) else (caps or [])
	want = {CAP_ROLES[c] for c in caps if c in CAP_ROLES}
	# Rebuild only the capability roles, leaving any other roles (e.g. System Manager) untouched.
	kept = [r for r in doc.get("roles") if r.role not in ALL_CAP_ROLES]
	doc.set("roles", kept)
	for role in sorted(want):
		doc.append("roles", {"role": role})

	doc.cago_allow_price_edit = 1 if cint(allow_price_edit) else 0
	pct = flt(max_discount_pct)
	doc.cago_max_discount_pct = max(0.0, min(100.0, pct))
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _row(user)
