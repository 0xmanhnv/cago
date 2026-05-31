# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Tests for Phase 1: lô hàng + hạn sử dụng (batch + expiry).

Run: bench --site <site> run-tests --app cago --module cago.tests.test_inventory
"""

import json

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from cago.api import inventory
from cago.utils import dto

CHEM_ITEM = "THUOC-CHUOT-A-GOI"
NONBATCH_ITEM = "CAM-GA-CON-25KG"


class TestExpiryHelpers(FrappeTestCase):
	def test_expiry_status(self):
		self.assertEqual(dto.expiry_status(None), "ok")
		self.assertEqual(dto.expiry_status(add_days(nowdate(), -1)), "expired")
		self.assertEqual(dto.expiry_status(add_days(nowdate(), 10)), "near")
		self.assertEqual(dto.expiry_status(add_days(nowdate(), 999)), "ok")


class TestAutoStockStatus(FrappeTestCase):
	def test_status_logic(self):
		from frappe import _dict

		manual = _dict({"cago_stock_auto": 0, "cago_stock_status_manual": "Còn hàng"})
		self.assertEqual(dto.stock_status_for(manual, 0), "Còn hàng")  # manual ignores qty
		auto = _dict({"cago_stock_auto": 1, "cago_reorder_level": 5})
		self.assertEqual(dto.stock_status_for(auto, 0), "Hết hàng")
		self.assertEqual(dto.stock_status_for(auto, 3), "Còn ít")
		self.assertEqual(dto.stock_status_for(auto, 10), "Còn hàng")


class TestMinPriceGuard(FrappeTestCase):
	def setUp(self):
		if not frappe.db.exists("Item", NONBATCH_ITEM):
			self.skipTest("sample item missing")
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None
		self._orig_min = frappe.db.get_value("Item", NONBATCH_ITEM, "cago_min_price")
		frappe.db.set_value("Item", NONBATCH_ITEM, "cago_min_price", 300000)

	def tearDown(self):
		frappe.db.set_value("Item", NONBATCH_ITEM, "cago_min_price", self._orig_min)
		frappe.db.commit = self._commit

	def test_below_floor_rejected(self):
		from cago.api import owner

		with self.assertRaises(frappe.ValidationError):
			owner.update_product(NONBATCH_ITEM, json.dumps({"selling_price": 100000}))

	def test_at_or_above_floor_ok(self):
		from cago.api import owner

		owner.update_product(NONBATCH_ITEM, json.dumps({"selling_price": 350000}))
		self.assertEqual(dto.get_selling_price(NONBATCH_ITEM), 350000)


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


class TestSaleUnits(FrappeTestCase):
	def setUp(self):
		if not frappe.db.exists("Item", CHEM_ITEM):
			self.skipTest("sample chemical item missing")
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None

	def tearDown(self):
		frappe.db.commit = self._commit

	def test_add_retail_unit_keeps_stock_price(self):
		from cago.api import units

		stock_price = dto.get_selling_price(CHEM_ITEM)
		units.save_unit(CHEM_ITEM, "Kg", 25, 12000)
		# stock-unit price must NOT be overwritten by the per-UOM retail price
		self.assertEqual(dto.get_selling_price(CHEM_ITEM), stock_price)
		uoms = {u["uom"] for u in units.get_units(CHEM_ITEM)["units"]}
		self.assertIn("Kg", uoms)

	def test_public_sale_units_gated_by_flag(self):
		from cago.api import units

		units.save_unit(CHEM_ITEM, "Kg", 25, 12000)
		units.set_retail_visible(CHEM_ITEM, 0)
		self.assertNotIn("sale_units", dto.public_dto(frappe.get_doc("Item", CHEM_ITEM)))
		units.set_retail_visible(CHEM_ITEM, 1)
		d = dto.public_dto(frappe.get_doc("Item", CHEM_ITEM))
		self.assertIn("sale_units", d)
		self.assertTrue(any(u["uom"] == "Kg" for u in d["sale_units"]))

	def test_staff_dto_always_has_sale_units(self):
		d = dto.staff_dto(frappe.get_doc("Item", CHEM_ITEM))
		self.assertIn("sale_units", d)


class TestReceiveStock(FrappeTestCase):
	def setUp(self):
		if not frappe.db.exists("Item", NONBATCH_ITEM):
			self.skipTest("sample item missing")
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None

	def tearDown(self):
		frappe.db.commit = self._commit

	def test_receive_increases_real_qty(self):
		from cago.api import purchasing

		before = purchasing.get_stock(NONBATCH_ITEM)["qty"]
		r = purchasing.receive_stock(NONBATCH_ITEM, 3, cost_rate=1000)
		self.assertAlmostEqual(r["qty"], before + 3, places=2)

	def test_batch_item_requires_batch(self):
		from cago.api import purchasing

		if not frappe.db.exists("Item", CHEM_ITEM):
			self.skipTest("chem item missing")
		with self.assertRaises(frappe.ValidationError):
			purchasing.receive_stock(CHEM_ITEM, 1)  # batch-tracked → must pass batch_no
