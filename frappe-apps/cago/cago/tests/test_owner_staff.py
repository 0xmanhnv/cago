# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Tests for owner/staff write features (product create/edit, customer, wanted-list
status, zalo drafts, period reports). db.commit is muted so each test stays isolated."""

import frappe
from frappe.tests.utils import FrappeTestCase

from cago.api import debt, kiosk, owner, reports, staff

SAMPLE = "CAM-GA-CON-25KG"


class TestOwnerStaffFeatures(FrappeTestCase):
	def setUp(self):
		# Keep tests transaction-isolated: the APIs call frappe.db.commit() internally.
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None

	def tearDown(self):
		frappe.db.commit = self._commit

	def _group(self):
		return frappe.db.get_value("Item Group", {"is_group": 0}, "name")

	# ---- product create / edit ----
	def test_create_product(self):
		import json

		r = owner.create_product(json.dumps({
			"cago_display_name": "_Test SP mới", "item_group": self._group(),
			"stock_uom": "Bao", "selling_price": 12345, "cago_is_public_visible": 1,
		}))
		self.assertTrue(r["item_code"].startswith("SP-"))
		self.assertEqual(r["selling_price"], 12345)
		self.assertTrue(frappe.db.exists("Item", r["item_code"]))

	def test_update_product_changes_field(self):
		import json

		owner.update_product(SAMPLE, json.dumps({"cago_shelf_location": "_Kệ test"}))
		self.assertEqual(frappe.db.get_value("Item", SAMPLE, "cago_shelf_location"), "_Kệ test")

	# ---- customer ----
	def test_add_customer_normalizes_phone(self):
		r = debt.add_customer("_Test Khách", "098 765 4321", "Xóm 9")
		self.assertEqual(frappe.db.get_value("Customer", r["customer"], "mobile_no"), "0987654321")

	# ---- zalo drafts ----
	def test_zalo_restock_draft_has_product_and_price(self):
		d = owner.zalo_draft("restock", item_code=SAMPLE)
		self.assertIn("đã về hàng", d["text"])
		self.assertIn("320.000đ", d["text"])

	# ---- wanted-list status (staff) ----
	def test_staff_sets_wanted_list_status(self):
		code = kiosk.create_wanted_list('[{"item_code":"%s","qty":1}]' % SAMPLE)["code"]
		staff.set_wanted_list_status(code, "Completed")
		self.assertEqual(frappe.db.get_value("Cago Wanted List", code, "status"), "Completed")

	def test_staff_rejects_bad_status(self):
		code = kiosk.create_wanted_list('[{"item_code":"%s","qty":1}]' % SAMPLE)["code"]
		with self.assertRaises(frappe.ValidationError):
			staff.set_wanted_list_status(code, "Bogus")

	# ---- period reports ----
	def test_period_summary_shapes(self):
		for p in ("today", "week", "month"):
			r = reports.period_summary(p)
			self.assertEqual(r["period"], p)
			self.assertIn("sales_total_text", r)
