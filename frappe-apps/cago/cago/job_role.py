# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Cago Job Role (chức danh) document hooks.

A job role is a reusable bundle of capabilities. Editing one must propagate to every employee who
holds it (re-compile their Frappe cap-roles), and a job role still assigned to someone can't be
deleted. Wired via doc_events in hooks.py. See docs/27 and the /pos capability plan.
"""

import frappe
from frappe import _

from cago.utils.permissions import sync_user_caps


def _members(job_role):
	"""Users currently assigned this job role."""
	return frappe.get_all(
		"Cago User Job Role",
		filters={"job_role": job_role, "parenttype": "User"},
		pluck="parent",
		distinct=True,
	)


# Default chức danh seeded on install/migrate so the owner has ready bundles to assign.
DEFAULT_JOB_ROLES = {
	"Thu ngân": ["sell", "returns"],
	"Quản lý kho": ["stock", "products"],
	"Kế toán": ["debt", "reports", "cash", "supplier"],
	"Quản lý cửa hàng": ["sell", "returns", "debt", "stock", "products", "reports", "cash", "supplier", "settings"],
}


def seed_defaults():
	"""Create the default chức danh (idempotent — only the missing ones)."""
	for title, caps in DEFAULT_JOB_ROLES.items():
		if frappe.db.exists("Cago Job Role", title):
			continue
		doc = frappe.new_doc("Cago Job Role")
		doc.title = title
		for c in caps:
			doc.append("capabilities", {"capability": c})
		doc.insert(ignore_permissions=True)
	frappe.db.commit()


def on_update(doc, method=None):
	"""Capabilities changed → re-compile cap-roles for everyone holding this chức danh."""
	for user in _members(doc.name):
		sync_user_caps(user)


def on_trash(doc, method=None):
	"""Don't orphan staff: block deleting a chức danh that's still assigned."""
	members = _members(doc.name)
	if members:
		frappe.throw(
			_("Chức danh đang được {0} nhân viên dùng. Hãy gỡ khỏi họ trước khi xoá.").format(len(members)),
			frappe.ValidationError,
		)
