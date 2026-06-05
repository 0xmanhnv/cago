# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Telegram ops-bot command gating — the sensitive owner data (revenue / debt) must never reach a
staff member: blocked for non-owners, and refused even for the owner when sent in the shared group
(so the reply isn't broadcast to staff). See cago.api.telegram + docs/45."""

import frappe
from frappe.tests.utils import FrappeTestCase

from cago.api import telegram


class TestTelegramCommandGating(FrappeTestCase):
	def test_myid_echoes_sender_id(self):
		r = telegram._handle("/myid", "555111", is_owner=False, in_group=True)
		self.assertIn("555111", r)

	def test_owner_command_blocked_for_non_owner(self):
		"""A staff member (not in the owner list) gets a refusal, never the revenue figure."""
		r = telegram._handle("/doanhthu", "999", is_owner=False, in_group=True)
		self.assertIn("chỉ dành cho chủ", r)
		self.assertNotIn("Doanh thu hôm nay", r)

	def test_owner_command_in_group_refused_to_avoid_leak(self):
		"""Even an owner is refused in the shared group — the reply would leak to staff there."""
		r = telegram._handle("/no", "111", is_owner=True, in_group=True)
		self.assertIn("nhắn RIÊNG", r)
		self.assertNotIn("còn nợ", r)  # no actual debt content

	def test_owner_command_in_private_runs(self):
		"""Owner in a private chat (not the group) gets the real figure."""
		r = telegram._handle("/doanhthu", "111", is_owner=True, in_group=False)
		self.assertIn("Doanh thu hôm nay", r)

	def test_staff_operational_command_runs_in_group(self):
		"""Low-stock is operational — staff in the group may run it (no money data)."""
		r = telegram._handle("/tonkho", "222", is_owner=False, in_group=True)
		self.assertNotIn("chỉ dành cho chủ", r)
		self.assertNotIn("nhắn RIÊNG", r)


class TestTelegramAccountLink(FrappeTestCase):
	def tearDown(self):
		frappe.db.set_value("User", "Administrator", "cago_telegram_id", "")

	def test_link_by_code_maps_telegram_id_to_user(self):
		code = frappe.generate_hash(length=10)
		frappe.cache().set_value(telegram._link_key(code), "Administrator", expires_in_sec=600)
		msg = telegram._consume_link(code, "777888")
		self.assertIn("liên kết", msg.lower())
		self.assertEqual(frappe.db.get_value("User", "Administrator", "cago_telegram_id"), "777888")
		# code is single-use — a replay no longer links
		self.assertIn("không hợp lệ", telegram._consume_link(code, "777888").lower())

	def test_invalid_code_rejected(self):
		self.assertIn("không hợp lệ", telegram._consume_link("nope-not-real", "123").lower())


class TestTelegramOrderCallback(FrappeTestCase):
	def _make_order(self):
		wl = frappe.new_doc("Cago Wanted List")
		wl.status = "New"
		wl.append("items", {"item_code": "DC-XENG", "qty": 1})
		wl.insert(ignore_permissions=True)
		frappe.db.commit()
		return wl

	def test_action_button_updates_status_and_gates(self):
		from cago.api.debt import _company

		company = _company()
		wl = self._make_order()
		frappe.db.set_value("Company", company, "cago_telegram_chat_id", "TESTGRP")
		try:
			# from a stranger chat (not the group, not linked) → rejected, status unchanged
			telegram._handle_callback({"id": "c0", "from": {"id": "1"}, "message": {"chat": {"id": "OTHER"}, "message_id": 1, "text": "x"}, "data": f"wl:confirm:{wl.code}"})
			self.assertEqual(frappe.db.get_value("Cago Wanted List", wl.name, "status"), "New")
			# from the configured ops group → confirmed
			telegram._handle_callback({"id": "c1", "from": {"id": "1"}, "message": {"chat": {"id": "TESTGRP"}, "message_id": 1, "text": "x"}, "data": f"wl:confirm:{wl.code}"})
			self.assertEqual(frappe.db.get_value("Cago Wanted List", wl.name, "status"), "Confirmed")
			# done
			telegram._handle_callback({"id": "c2", "from": {"id": "1"}, "message": {"chat": {"id": "TESTGRP"}, "message_id": 1, "text": "x"}, "data": f"wl:done:{wl.code}"})
			self.assertEqual(frappe.db.get_value("Cago Wanted List", wl.name, "status"), "Completed")
		finally:
			frappe.db.set_value("Company", company, "cago_telegram_chat_id", "")
			frappe.delete_doc("Cago Wanted List", wl.name, force=1, ignore_permissions=True)
