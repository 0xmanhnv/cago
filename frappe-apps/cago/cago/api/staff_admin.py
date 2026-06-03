# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Staff & permissions admin (owner-only).

Permissions are organised as reusable **chức danh** (Cago Job Role) — named bundles of
capabilities. The owner assigns one or more chức danh to each employee (many-to-many); the union
is compiled into the Frappe capability roles by cago.utils.permissions.sync_user_caps. Per-staff
selling limits (allow price edit, max discount %) stay on the User. Owner-only so no self-elevation.
See docs/27 and the /pos plan.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt

from cago.utils.permissions import CAP_ROLES, caps_for_user_roles, ensure_owner, is_owner_roles, sync_user_caps
from cago.utils.privileged import as_user

_INTERNAL_ROLES = list(set(CAP_ROLES.values()) | {"Cago Owner"})


def _job_roles_of(user):
	names = frappe.get_all("Cago User Job Role", filters={"parent": user, "parenttype": "User"}, pluck="job_role")
	titles = {r.name: r.title for r in frappe.get_all("Cago Job Role", filters={"name": ["in", names or [""]]}, fields=["name", "title"])}
	return [{"name": n, "title": titles.get(n, n)} for n in names]


def _row(user):
	info = frappe.db.get_value(
		"User", user, ["full_name", "enabled", "cago_allow_price_edit", "cago_max_discount_pct", "cago_blind_shift_close"], as_dict=True
	)
	roles = set(frappe.get_roles(user))
	owner = is_owner_roles(roles)
	return {
		"user": user,
		"full_name": info.full_name or user,
		"enabled": bool(info.enabled),
		"is_owner": owner,
		"job_roles": [] if owner else _job_roles_of(user),
		"caps": list(CAP_ROLES.keys()) if owner else sorted(caps_for_user_roles(roles)),
		"allow_price_edit": bool(info.cago_allow_price_edit),
		"max_discount_pct": flt(info.cago_max_discount_pct),
		"blind_shift_close": bool(info.cago_blind_shift_close),
	}


# --------------------------------------------------------------------------- #
# Employees
# --------------------------------------------------------------------------- #
@frappe.whitelist()
def list_staff():
	ensure_owner()
	rows = frappe.get_all("Has Role", filters={"role": ["in", _INTERNAL_ROLES]}, fields=["parent"], distinct=True)
	users = {r.parent for r in rows}
	# Also include accounts that were created with a job role assigned but no cap-role granted yet
	# (and any capability-less staff) so a just-created account never vanishes from this screen.
	users |= set(frappe.get_all("Cago User Job Role", filters={"parenttype": "User"}, pluck="parent", distinct=True))
	return [_row(u) for u in sorted(users - {"Administrator", "Guest"})]


@frappe.whitelist()
def get_staff(user):
	ensure_owner()
	if not frappe.db.exists("User", user):
		frappe.throw(_("Không tìm thấy tài khoản."))
	return _row(user)


@frappe.whitelist()
def save_staff(user, job_roles, allow_price_edit=0, max_discount_pct=0, blind_shift_close=0):
	"""Assign chức danh (job roles) + per-staff limits to an employee, then compile cap-roles."""
	ensure_owner()
	if user in ("Administrator", "Guest") or not frappe.db.exists("User", user):
		frappe.throw(_("Tài khoản không hợp lệ."))
	doc = frappe.get_doc("User", user)
	if is_owner_roles({r.role for r in doc.roles}):
		frappe.throw(_("Không chỉnh quyền của chủ cửa hàng ở đây."))

	names = frappe.parse_json(job_roles) if isinstance(job_roles, str) else (job_roles or [])
	valid = [n for n in names if frappe.db.exists("Cago Job Role", n)]
	doc.set("cago_job_roles", [{"job_role": n} for n in valid])
	doc.cago_allow_price_edit = 1 if cint(allow_price_edit) else 0
	doc.cago_max_discount_pct = max(0.0, min(100.0, flt(max_discount_pct)))
	doc.cago_blind_shift_close = 1 if cint(blind_shift_close) else 0
	doc.save(ignore_permissions=True)
	sync_user_caps(user)  # union of the assigned chức danh → Frappe cap-roles
	frappe.db.commit()
	return _row(user)


@frappe.whitelist()
def create_staff(email, full_name, password=None, job_roles=None, allow_price_edit=0, max_discount_pct=0, blind_shift_close=0):
	"""Owner: create a new staff login (email + tên + mật khẩu) and assign chức danh + limits."""
	ensure_owner()
	email = (email or "").strip().lower()
	if "@" not in email or "." not in email.rsplit("@", 1)[-1]:
		frappe.throw(_("Email không hợp lệ (vd: nhanvien@cuahang.com)."))
	if frappe.db.exists("User", email):
		frappe.throw(_("Đã có tài khoản với email này."))
	name = (full_name or "").strip() or email.split("@")[0]
	with as_user("Administrator"):
		doc = frappe.get_doc(
			{"doctype": "User", "email": email, "first_name": name, "user_type": "System User", "enabled": 1, "send_welcome_email": 0}
		)
		doc.insert(ignore_permissions=True)
	save_staff(email, job_roles or [], allow_price_edit, max_discount_pct, blind_shift_close)  # caps + limits + commit
	if password:
		from frappe.utils.password import update_password

		update_password(email, password)
		frappe.db.commit()
	return _row(email)


@frappe.whitelist()
def set_staff_account(user, full_name=None, enabled=None, new_password=None):
	"""Owner: edit a staff account — đổi tên, bật/tắt, đặt lại mật khẩu. Owner's own account is off-limits."""
	ensure_owner()
	if user in ("Administrator", "Guest") or not frappe.db.exists("User", user):
		frappe.throw(_("Tài khoản không hợp lệ."))
	doc = frappe.get_doc("User", user)
	if is_owner_roles({r.role for r in doc.roles}):
		frappe.throw(_("Không chỉnh tài khoản của chủ cửa hàng ở đây."))
	if full_name is not None and full_name.strip():
		doc.first_name = full_name.strip()
		doc.last_name = ""
	if enabled is not None:
		doc.enabled = 1 if cint(enabled) else 0
	doc.save(ignore_permissions=True)
	if new_password:
		from frappe.utils.password import update_password

		update_password(user, new_password)
	frappe.db.commit()
	return _row(user)


# --------------------------------------------------------------------------- #
# Chức danh (Cago Job Role)
# --------------------------------------------------------------------------- #
def _caps_of(name):
	return frappe.get_all("Cago Job Role Cap", filters={"parent": name, "parenttype": "Cago Job Role"}, pluck="capability")


def _member_count(name):
	return len(frappe.get_all("Cago User Job Role", filters={"job_role": name, "parenttype": "User"}, pluck="parent", distinct=True))


@frappe.whitelist()
def list_job_roles():
	ensure_owner()
	out = []
	for r in frappe.get_all("Cago Job Role", fields=["name", "title", "description"], order_by="title asc"):
		out.append({"name": r.name, "title": r.title, "description": r.description, "caps": _caps_of(r.name), "members": _member_count(r.name)})
	return out


@frappe.whitelist()
def save_job_role(title, caps, name=None, description=None):
	"""Create or update a chức danh. On update the on_update hook re-compiles members' cap-roles."""
	ensure_owner()
	title = (title or "").strip()
	if not title:
		frappe.throw(_("Nhập tên chức danh."))
	keys = frappe.parse_json(caps) if isinstance(caps, str) else (caps or [])
	rows = [{"capability": c} for c in keys if c in CAP_ROLES]
	if name and frappe.db.exists("Cago Job Role", name):
		if title != name:  # title is the docname → rename (cascades to assignments)
			frappe.rename_doc("Cago Job Role", name, title, ignore_permissions=True)
			name = title
		doc = frappe.get_doc("Cago Job Role", name)
		doc.description = description
		doc.set("capabilities", rows)
		doc.save(ignore_permissions=True)
	else:
		if frappe.db.exists("Cago Job Role", title):
			frappe.throw(_("Đã có chức danh tên này."))
		doc = frappe.new_doc("Cago Job Role")
		doc.title = title
		doc.description = description
		doc.set("capabilities", rows)
		doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return list_job_roles()


@frappe.whitelist()
def delete_job_role(name):
	ensure_owner()
	if frappe.db.exists("Cago Job Role", name):
		frappe.delete_doc("Cago Job Role", name, ignore_permissions=True)  # on_trash blocks if in use
		frappe.db.commit()
	return list_job_roles()
