# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt

from frappe.model.document import Document


class CagoChatbotSettings(Document):
	def on_update(self):
		# Invalidate the compiled cache so owner edits take effect immediately.
		from cago.chatbot import settings

		settings.clear_cache()
