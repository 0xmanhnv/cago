# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class CagoCoupon(Document):
	def before_save(self):
		# Codes are case-insensitive for the buyer; store uppercase so lookups are stable.
		if self.coupon_code:
			self.coupon_code = self.coupon_code.strip().upper()
