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

	def test_menu_is_role_aware_and_report_has_back(self):
		"""Menu = shortcut grid (drill in); a report view = its extras + a ⬅️ Menu back button. (Only
		look at callback buttons — the optional 📲 Mở app URL button depends on public_url config.)"""
		cbs = lambda cmd, o, g: [b["cb"] for b in telegram._buttons_for(cmd, o, g) if b.get("cb")]
		# Owner menu (welcome) → full shortcut grid
		self.assertIn("cmd:no", cbs("/menu", True, False))
		self.assertIn("cmd:doanhthu", cbs("/menu", True, False))
		# Owner revenue view → period switch + Back, NOT the other shortcuts
		dt = cbs("/doanhthu", True, False)
		self.assertIn("cmd:doanhthu:week", dt)
		self.assertIn("cmd:menu", dt)  # ⬅️ Menu back
		self.assertNotIn("cmd:no", dt)
		# Staff menu → only operational shortcuts (no money)
		self.assertEqual(cbs("/menu", False, True), ["cmd:tonkho", "cmd:nhaphang"])
		# Any report view always offers a way back
		self.assertIn("cmd:menu", cbs("/no", True, False))
		self.assertIn("trợ lý", telegram._welcome(True, False).lower())


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


class TestTelegramConfirmActions(FrappeTestCase):
	"""Data-changing buttons (duyệt mua chịu / nhắc nợ) must take TWO taps — the first only shows a
	confirm, the second actually runs it — so a mis-tap can't approve credit or fire a message."""

	def setUp(self):
		from cago.api.debt import _company

		self.company = _company()
		self._prev_owner_ids = frappe.db.get_value("Company", self.company, "cago_telegram_owner_ids")
		# Make Telegram id "9001" an owner so the callback passes the owner gate.
		frappe.db.set_value("Company", self.company, "cago_telegram_owner_ids", "9001")
		cust = frappe.new_doc("Customer")
		cust.customer_name = "KH Tele Confirm Test"
		cust.customer_type = "Individual"
		g = frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
		t = frappe.db.get_value("Territory", {"is_group": 0}, "name")
		if g:
			cust.customer_group = g
		if t:
			cust.territory = t
		cust.cago_unverified = 1
		cust.insert(ignore_permissions=True)
		self.cust = cust.name
		self.slug = frappe.db.get_value("Customer", cust.name, "cago_slug") or cust.name
		frappe.db.commit()

	def tearDown(self):
		frappe.db.set_value("Company", self.company, "cago_telegram_owner_ids", self._prev_owner_ids or "")
		frappe.delete_doc("Customer", self.cust, force=1, ignore_permissions=True)

	def _cb(self, data):
		# A private chat (chat id == sender id) from the owner-listed Telegram id.
		return {"id": "x", "from": {"id": "9001"}, "message": {"chat": {"id": "9001"}, "message_id": 1, "text": "x"}, "data": data}

	def test_verify_requires_explicit_confirm(self):
		# First tap (no "!") = confirm prompt only → lead is still unverified.
		telegram._handle_callback(self._cb(f"lead:verify:{self.slug}"))
		self.assertEqual(frappe.db.get_value("Customer", self.cust, "cago_unverified"), 1)
		# Confirmed tap ("!") = actually approves.
		telegram._handle_callback(self._cb(f"lead:verify!:{self.slug}"))
		self.assertEqual(frappe.db.get_value("Customer", self.cust, "cago_unverified"), 0)

	def test_verify_blocked_for_non_owner(self):
		# A non-owner (Telegram id not in the owner list, not the group) cannot approve.
		cb = {"id": "x", "from": {"id": "7777"}, "message": {"chat": {"id": "7777"}, "message_id": 1, "text": "x"}, "data": f"lead:verify!:{self.slug}"}
		telegram._handle_callback(cb)
		self.assertEqual(frappe.db.get_value("Customer", self.cust, "cago_unverified"), 1)


class TestTelegramMiniAppLogin(FrappeTestCase):
	"""The Mini App one-tap login verifies Telegram's signed initData with the bot token (HMAC). A
	tampered/forged signature must be rejected — only a genuine Telegram signature logs anyone in."""

	def _signed(self, bot, fields):
		import hashlib
		import hmac
		from urllib.parse import urlencode

		data_check = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
		secret = hmac.new(b"WebAppData", bot.encode(), hashlib.sha256).digest()
		h = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
		return urlencode({**fields, "hash": h})

	def test_valid_signature_accepted(self):
		import time

		bot = "123456:TEST-BOT-TOKEN"
		fields = {"auth_date": str(int(time.time())), "query_id": "AAabc", "user": '{"id":424242,"first_name":"Tét"}'}
		ok, user, reason = telegram._check_init_data(self._signed(bot, fields), bot)
		self.assertTrue(ok, reason)
		self.assertEqual(str(user.get("id")), "424242")

	def test_tampered_signature_rejected(self):
		import time
		from urllib.parse import urlencode

		bot = "123456:TEST-BOT-TOKEN"
		fields = {"auth_date": str(int(time.time())), "user": '{"id":1}'}
		forged = urlencode({**fields, "hash": "deadbeefdeadbeef"})
		ok, _user, reason = telegram._check_init_data(forged, bot)
		self.assertFalse(ok)
		self.assertEqual(reason, "bad_sig")

	def test_wrong_token_rejected(self):
		import time

		fields = {"auth_date": str(int(time.time())), "user": '{"id":1}'}
		signed = self._signed("123456:REAL", fields)
		ok, _user, _reason = telegram._check_init_data(signed, "123456:ATTACKER")
		self.assertFalse(ok)

	def test_stale_initdata_rejected(self):
		bot = "123456:TEST-BOT-TOKEN"
		fields = {"auth_date": "1000000000", "user": '{"id":1}'}  # year 2001 → far past the 24h window
		ok, _user, reason = telegram._check_init_data(self._signed(bot, fields), bot)
		self.assertFalse(ok)
		self.assertEqual(reason, "stale")
