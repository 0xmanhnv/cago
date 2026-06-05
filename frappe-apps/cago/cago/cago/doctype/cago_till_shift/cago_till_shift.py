# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class CagoTillShift(Document):
	def before_insert(self):
		# Stamp the cashier/open time automatically; callers only pass opening_cash.
		if not self.cashier:
			self.cashier = frappe.session.user
		if not self.opened_at:
			self.opened_at = now_datetime()
		if not self.status:
			self.status = "Open"
