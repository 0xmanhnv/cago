# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Tests for the in-store 'call staff' support requests (cago.api.support).

Run: bench --site <site> run-tests --app cago --module cago.tests.test_support
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from cago.api import support


class TestSupportRequests(FrappeTestCase):
	def tearDown(self):
		frappe.db.rollback()

	def test_create_then_accept_then_resolve(self):
		r = support.create_request(reason="Tư vấn sản phẩm", note="cần xem cám", kiosk_label="Kiosk T1", session_id="s1")
		name = r["name"]
		self.assertEqual(r["status"], "pending")

		acc = support.accept_request(name)
		self.assertEqual(acc["status"], "accepted")
		self.assertTrue(acc["assigned_name"])  # the claiming staff name is shown to the kiosk

		res = support.resolve_request(name)
		self.assertEqual(res["status"], "resolved")

	def test_customer_can_cancel_own_pending(self):
		r = support.create_request(reason="Khác", session_id="s2")
		out = support.cancel_request(r["name"], session_id="s2")
		self.assertEqual(out["status"], "cancelled")

	def test_cancel_rejects_wrong_session(self):
		r = support.create_request(reason="Khác", session_id="owner-sess")
		out = support.cancel_request(r["name"], session_id="someone-else")
		self.assertEqual(out["status"], "pending")  # not cancelled — different session

	def test_resolve_is_idempotent_after_resolved(self):
		r = support.create_request(reason="Khác", session_id="s3")
		support.resolve_request(r["name"])
		again = support.resolve_request(r["name"])  # no transition, no error
		self.assertEqual(again["status"], "resolved")

	def test_status_of_missing_request_is_safe(self):
		out = support.request_status("SUP-DOES-NOT-EXIST")
		self.assertEqual(out["status"], "cancelled")

	def test_same_session_dedupes_to_one_open_request(self):
		a = support.create_request(reason="Tư vấn sản phẩm", session_id="dup1")
		b = support.create_request(reason="Hỏi giá / thanh toán", note="đổi ý", session_id="dup1")
		self.assertEqual(a["name"], b["name"])  # reused, not piled up
		self.assertEqual(b["reason"], "Hỏi giá / thanh toán")  # latest need wins
		self.assertEqual(frappe.db.count("Cago Support Request", {"session_id": "dup1", "status": "pending"}), 1)

	def test_resolve_all_closes_open(self):
		support.create_request(reason="Khác", session_id="ra1")
		support.create_request(reason="Khác", session_id="ra2")
		out = support.resolve_all()
		self.assertGreaterEqual(out["resolved"], 2)
		self.assertEqual(frappe.db.count("Cago Support Request", {"status": ["in", ["pending", "accepted"]]}), 0)

	def test_mark_seen_clears_unread(self):
		support.create_request(reason="Khác", session_id="u1")
		self.assertGreaterEqual(support.unread_count(), 1)
		support.mark_seen()
		self.assertEqual(support.unread_count(), 0)  # nothing newer than "seen"

	def test_expire_stale_marks_expired(self):
		from frappe.utils import add_to_date, now_datetime

		r = support.create_request(reason="Khác", session_id="s4")
		# Backdate creation beyond the expiry window, then run the scheduled sweep.
		frappe.db.set_value("Cago Support Request", r["name"],
			"creation", add_to_date(now_datetime(), minutes=-(support.EXPIRE_AFTER_MIN + 1)))
		support.expire_stale_requests()
		self.assertEqual(frappe.db.get_value("Cago Support Request", r["name"], "status"), "expired")
