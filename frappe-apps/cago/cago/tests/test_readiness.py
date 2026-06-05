# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Tests for the go-live readiness check (cago.api.readiness)."""

from frappe.tests.utils import FrappeTestCase

from cago.api import readiness


class TestReadiness(FrappeTestCase):
	def test_golive_check_shape(self):
		r = readiness.golive_check()  # runs as Administrator (owner) in tests
		self.assertIn("groups", r)
		self.assertIn("ready", r)
		self.assertEqual(len(r["groups"]), 3)
		items = [i for g in r["groups"] for i in g["items"]]
		self.assertTrue(items)
		for i in items:
			self.assertIn(i["status"], ("ok", "warn", "fail"))
			self.assertTrue(i["label"])
		# blockers/warnings are consistent with item statuses
		self.assertEqual(r["blockers"], sum(1 for i in items if i["status"] == "fail"))
		self.assertEqual(r["ready"], r["blockers"] == 0)
