# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Tests for Phase 1: lô hàng + hạn sử dụng (batch + expiry).

Run: bench --site <site> run-tests --app cago --module cago.tests.test_inventory
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from cago.api import inventory
from cago.utils import dto

CHEM_ITEM = "THUOC-CHUOT-A-GOI"


class TestExpiryHelpers(FrappeTestCase):
	def test_expiry_status(self):
		self.assertEqual(dto.expiry_status(None), "ok")
		self.assertEqual(dto.expiry_status(add_days(nowdate(), -1)), "expired")
		self.assertEqual(dto.expiry_status(add_days(nowdate(), 10)), "near")
		self.assertEqual(dto.expiry_status(add_days(nowdate(), 999)), "ok")


class TestInventoryBatch(FrappeTestCase):
	def setUp(self):
		if not frappe.db.exists("Item", CHEM_ITEM):
			self.skipTest("sample chemical item missing")
		# Mute commit so add_batch() doesn't break test rollback isolation.
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None

	def tearDown(self):
		frappe.db.commit = self._commit

	def _ensure(self, batch_id, days):
		if not frappe.db.exists("Batch", {"batch_id": batch_id, "item": CHEM_ITEM}):
			inventory.add_batch(CHEM_ITEM, batch_id, expiry_date=add_days(nowdate(), days))

	def test_add_and_list_batch(self):
		self._ensure("TEST-BATCH-NEAR", 10)
		rows = inventory.list_batches(CHEM_ITEM)
		row = next((r for r in rows if r["batch_id"] == "TEST-BATCH-NEAR"), None)
		self.assertIsNotNone(row)
		self.assertEqual(row["expiry_status"], "near")

	def test_expiring_soon_includes_near_excludes_far(self):
		self._ensure("TEST-BATCH-SOON", 5)
		self._ensure("TEST-BATCH-FAR", 800)
		ids = [r["batch_id"] for r in inventory.expiring_soon(days=30)]
		self.assertIn("TEST-BATCH-SOON", ids)
		self.assertNotIn("TEST-BATCH-FAR", ids)

	def test_duplicate_batch_rejected(self):
		self._ensure("TEST-BATCH-DUP", 20)
		with self.assertRaises(frappe.ValidationError):
			inventory.add_batch(CHEM_ITEM, "TEST-BATCH-DUP", expiry_date=add_days(nowdate(), 20))

	def test_public_dto_has_expiry_fields(self):
		d = dto.public_dto(frappe.get_doc("Item", CHEM_ITEM))
		self.assertIn("expiry_status", d)
		self.assertIn("nearest_expiry", d)
		self.assertIn("expiry_text", d)
