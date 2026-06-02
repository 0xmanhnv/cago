# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class CagoProductAlternative(Document):
	def validate(self):
		# A product cannot be an alternative to itself.
		if self.source_item and self.source_item == self.alternative_item:
			frappe.throw(_("Sản phẩm thay thế phải khác sản phẩm gốc."))
