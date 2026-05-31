# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""POS handoff — turn a kiosk wanted list into a DRAFT Sales Invoice.

Staff retrieve a customer's kiosk basket by code and create a draft invoice pre-filled
with the items (no re-typing). The invoice is left as a DRAFT — staff opens it in ERPNext
to pick the customer/payment and submit, so no final sale happens without staff confirmation
(docs/04). Native-POS-friendly; no dependency on POS Awesome.
"""

import frappe
from frappe import _
from frappe.utils import nowdate

from cago.api import debt
from cago.api.sales import _warehouse, walkin_customer
from cago.utils import dto
from cago.utils.permissions import ensure_lang, ensure_staff


@frappe.whitelist()
def create_invoice_from_wanted(code):
	"""From a wanted-list code, create a DRAFT Sales Invoice with its items. Staff only."""
	ensure_staff()
	ensure_lang()
	wl = frappe.db.get_value("Cago Wanted List", {"code": code}, "name")
	if not wl:
		frappe.throw(_("Không tìm thấy đơn với mã này."))
	doc = frappe.get_doc("Cago Wanted List", wl)
	items = [{"item_code": i.item_code, "qty": i.qty} for i in doc.items if frappe.db.exists("Item", i.item_code)]
	if not items:
		frappe.throw(_("Đơn không có sản phẩm hợp lệ."))

	company = debt._company()
	actor = frappe.session.user
	try:
		frappe.set_user("Administrator")  # staff lacks Sales Invoice create; draft only, ERPNext validates
		si = frappe.get_doc(
			{
				"doctype": "Sales Invoice",
				"customer": walkin_customer(),
				"company": company,
				"posting_date": nowdate(),
				"due_date": nowdate(),
				"selling_price_list": dto.SELLING_PRICE_LIST,
				"update_stock": 1,
				"set_warehouse": _warehouse(),
				"remarks": f"Từ đơn kiosk {code}",
				"items": items,
			}
		)
		si.flags.ignore_permissions = True
		si.insert(ignore_permissions=True)  # DRAFT — not submitted
	finally:
		frappe.set_user(actor)

	frappe.db.set_value("Cago Wanted List", wl, "status", "Processing")
	frappe.db.commit()
	return {"invoice": si.name, "url": f"/app/sales-invoice/{si.name}", "count": len(items)}
