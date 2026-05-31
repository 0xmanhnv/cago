# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class CagoOwnerActionLog(Document):
	def before_insert(self):
		# Stamp who/when automatically so callers only pass the business payload.
		if not self.user:
			self.user = frappe.session.user
		if not self.timestamp:
			self.timestamp = now_datetime()


def record_action(action_type, ref_doctype=None, ref_name=None, old_value=None, new_value=None):
	"""Create an audit log entry for a sensitive owner action.

	Used by owner-facing flows (e.g. price update) in later milestones. Kept here
	so the audit trail lives with the DocType that owns it.
	"""
	doc = frappe.get_doc(
		{
			"doctype": "Cago Owner Action Log",
			"action_type": action_type,
			"ref_doctype": ref_doctype,
			"ref_name": ref_name,
			"old_value": None if old_value is None else str(old_value),
			"new_value": None if new_value is None else str(new_value),
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name
