# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Debt-acknowledgement proof: storage + policy."""

import frappe
from frappe.tests.utils import FrappeTestCase


class TestDebtProof(FrappeTestCase):
	def setUp(self):
		self._commit = frappe.db.commit
		frappe.db.commit = lambda *a, **k: None

	def tearDown(self):
		frappe.db.commit = self._commit

	def test_save_proof_creates_record(self):
		from cago.api import debt
		from cago.debt_proof import save_proof

		cust = debt.add_customer("KH Proof Test")["customer"]
		# A 1x1 transparent PNG data URL for the signature.
		png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC"
		name = save_proof(cust, "debt", 50000, "Journal Entry", "TEST-JE-1", signature=png, witness="Anh Tư")
		self.assertTrue(name)
		p = frappe.get_doc("Cago Debt Proof", name)
		self.assertEqual(p.customer, cust)
		self.assertEqual(p.kind, "debt")
		self.assertEqual(p.witness, "Anh Tư")
		self.assertTrue(p.signature)  # the data URL was stored as a File and linked
		self.assertIn("signature", p.method)

	def test_save_proof_noop_without_any_capture(self):
		from cago.api import debt
		from cago.debt_proof import save_proof

		cust = debt.add_customer("KH Proof Empty")["customer"]
		self.assertIsNone(save_proof(cust, "debt", 1000, "Journal Entry", "TEST-JE-2"))

	def test_policy_shape(self):
		from cago.debt_proof import proof_policy

		pol = proof_policy()
		self.assertIn("debt", pol)
		self.assertIn("mode", pol["debt"])
		self.assertIn("repay", pol)
