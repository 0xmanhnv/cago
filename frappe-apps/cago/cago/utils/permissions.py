# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Server-side role guards.

Frontend hiding is never trusted (docs/18 §4). Every owner/staff API enforces a
role check here. Kiosk APIs are guest-allowed but only ever return public-safe
DTOs built in `dto.py`.
"""

import frappe
from frappe import _

# An owner is anyone who may edit prices / see margins. System Manager included
# so an admin can operate the simplified UI during setup.
OWNER_ROLES = {"Cago Owner", "System Manager"}
# Staff includes owners (an owner can do anything staff can).
STAFF_ROLES = {"Cago Staff"} | OWNER_ROLES


def _roles():
	return set(frappe.get_roles())


def is_owner():
	return bool(_roles() & OWNER_ROLES)


def is_staff():
	return bool(_roles() & STAFF_ROLES)


def ensure_owner():
	if not is_owner():
		frappe.throw(_("Chỉ chủ cửa hàng mới được thực hiện thao tác này."), frappe.PermissionError)


def ensure_staff():
	if not is_staff():
		frappe.throw(_("Bạn không có quyền truy cập chức năng này."), frappe.PermissionError)


def ensure_lang():
	"""Guard against a framework bug where get_locale_value() crashes when
	frappe.local.lang is unset (happens in console / background-job contexts).
	Submitting accounting documents evaluates jinja/date formats, so set a language.
	"""
	if not frappe.local.lang:
		frappe.local.lang = frappe.db.get_default("lang") or "en"
