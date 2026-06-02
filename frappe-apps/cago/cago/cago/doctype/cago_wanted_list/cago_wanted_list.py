# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.model.naming import make_autoname


class CagoWantedList(Document):
	def autoname(self):
		# Generate a short, human-readable code that staff can type/look up,
		# e.g. WL-2026-00042. The document name == the code.
		if not self.code:
			self.code = make_autoname("WL-.YYYY.-.#####")
		self.name = self.code

	def validate(self):
		if not self.status:
			self.status = "New"
