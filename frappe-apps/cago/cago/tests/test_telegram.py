# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Telegram ops-bot command gating — the sensitive owner data (revenue / debt) must never reach a
staff member: blocked for non-owners, and refused even for the owner when sent in the shared group
(so the reply isn't broadcast to staff). See cago.api.telegram + docs/45."""

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
