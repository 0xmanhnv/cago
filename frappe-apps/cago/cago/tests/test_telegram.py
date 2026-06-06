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
		frappe.db.set_value("User", "Administrator", "cago_telegram_id", None)
		frappe.db.set_value("User", "Guest", "cago_telegram_id", None)
		frappe.cache().delete_value(telegram._pending_key("Administrator"))
		frappe.db.commit()  # the code under test commits, so the cleanup must too (else it rolls back)

	def _mint(self, user):
		code = frappe.generate_hash(length=10)
		frappe.cache().set_value(telegram._link_key(code), user, expires_in_sec=600)
		return code

	def test_owner_link_requires_in_app_confirmation(self):
		"""Step-up for owner-tier accounts: redeeming the code does NOT bind — it's held PENDING until
		confirmed from the logged-in app, so a stranger who intercepted the code can't finish the link."""
		msg = telegram._consume_link(self._mint("Administrator"), "777888")  # Administrator = owner-tier
		self.assertIn("xác nhận", msg.lower())
		self.assertFalse(frappe.db.get_value("User", "Administrator", "cago_telegram_id"))  # NOT bound
		self.assertEqual(frappe.cache().get_value(telegram._pending_key("Administrator")), "777888")
		# confirm from the app (session.user == Administrator in tests) → now bound
		telegram.confirm_link()
		self.assertEqual(frappe.db.get_value("User", "Administrator", "cago_telegram_id"), "777888")

	def test_reject_clears_pending_without_binding(self):
		telegram._consume_link(self._mint("Administrator"), "777888")
		telegram.reject_link()
		self.assertFalse(frappe.cache().get_value(telegram._pending_key("Administrator")))
		self.assertFalse(frappe.db.get_value("User", "Administrator", "cago_telegram_id"))

	def test_link_code_is_single_use(self):
		code = self._mint("Administrator")
		telegram._consume_link(code, "777888")
		self.assertIn("không hợp lệ", telegram._consume_link(code, "777888").lower())

	def test_invalid_code_rejected(self):
		self.assertIn("không hợp lệ", telegram._consume_link("nope-not-real", "123").lower())

	def test_bind_moves_telegram_to_new_account(self):
		"""The low-level bind (staff immediate-link / owner confirm): a Telegram id already on account A
		MOVES to B (A auto-detached to NULL — "" would collide on the UNIQUE index). One id ↔ one account."""
		telegram._bind_telegram("Administrator", "313131")
		self.assertEqual(frappe.db.get_value("User", "Administrator", "cago_telegram_id"), "313131")
		telegram._bind_telegram("Guest", "313131")
		self.assertEqual(frappe.db.get_value("User", "Guest", "cago_telegram_id"), "313131")
		self.assertFalse(frappe.db.get_value("User", "Administrator", "cago_telegram_id"))

	def test_bind_keeps_one_id_per_account(self):
		telegram._bind_telegram("Administrator", "111aaa")
		telegram._bind_telegram("Administrator", "222bbb")  # overwrites
		self.assertEqual(frappe.db.get_value("User", "Administrator", "cago_telegram_id"), "222bbb")
		self.assertFalse(frappe.db.get_value("User", {"cago_telegram_id": "111aaa"}, "name"))


class TestTelegramOrderCallback(FrappeTestCase):
	def _make_order(self):
		wl = frappe.new_doc("Cago Wanted List")
		wl.status = "New"
		wl.append("items", {"item_code": "DC-XENG", "qty": 1})
		wl.insert(ignore_permissions=True)
		frappe.db.commit()
		return wl

	def test_action_button_updates_status_and_gates(self):
		"""Order actions require a LINKED INTERNAL user — a stranger (or a linked non-staff) can't act;
		raw ops-group membership is no longer enough."""
		from cago.api.debt import _company

		company = _company()
		wl = self._make_order()
		frappe.db.set_value("Company", company, "cago_telegram_chat_id", "TESTGRP")
		frappe.db.set_value("User", "Administrator", "cago_telegram_id", "tgstaff1")
		try:
			# from a stranger (Telegram id not linked to any user), even in the ops group → rejected
			telegram._handle_callback({"id": "c0", "from": {"id": "99"}, "message": {"chat": {"id": "TESTGRP"}, "message_id": 1, "text": "x"}, "data": f"wl:confirm:{wl.code}"})
			self.assertEqual(frappe.db.get_value("Cago Wanted List", wl.name, "status"), "New")
			# from a LINKED internal user (Administrator = System Manager) → confirmed
			telegram._handle_callback({"id": "c1", "from": {"id": "tgstaff1"}, "message": {"chat": {"id": "TESTGRP"}, "message_id": 1, "text": "x"}, "data": f"wl:confirm:{wl.code}"})
			self.assertEqual(frappe.db.get_value("Cago Wanted List", wl.name, "status"), "Confirmed")
			# done
			telegram._handle_callback({"id": "c2", "from": {"id": "tgstaff1"}, "message": {"chat": {"id": "TESTGRP"}, "message_id": 1, "text": "x"}, "data": f"wl:done:{wl.code}"})
			self.assertEqual(frappe.db.get_value("Cago Wanted List", wl.name, "status"), "Completed")
		finally:
			frappe.db.set_value("Company", company, "cago_telegram_chat_id", "")
			frappe.db.set_value("User", "Administrator", "cago_telegram_id", None)
			frappe.delete_doc("Cago Wanted List", wl.name, force=1, ignore_permissions=True)

	def test_is_internal_user_gate(self):
		"""The order-action gate helper: only an enabled staff/owner user counts as internal."""
		self.assertTrue(telegram._is_internal_user("Administrator"))  # System Manager
		self.assertFalse(telegram._is_internal_user("Guest"))  # no Cago role
		self.assertFalse(telegram._is_internal_user(None))
		self.assertFalse(telegram._is_internal_user("nobody@nowhere.invalid"))


class TestTelegramAccessGate(FrappeTestCase):
	"""The bot reveals store data ONLY to a recognized sender (a linked Cago user or an owner-listed id).
	An un-linked person — even sitting in the ops group — is asked to link first; group membership alone
	must not expose stock / nhập-hàng / figures. /myid always works (it's the bootstrap to get linked).
	These cases mutate nothing committed, so they roll back cleanly (unlike the commit-heavy classes)."""

	def setUp(self):
		from cago.api.debt import _company

		self.company = _company()
		self._prev_chat = frappe.db.get_value("Company", self.company, "cago_telegram_chat_id")
		self._prev_ids = frappe.db.get_value("Company", self.company, "cago_telegram_owner_ids")
		frappe.db.set_value("Company", self.company, "cago_telegram_chat_id", "OPSGRP")
		frappe.db.set_value("Company", self.company, "cago_telegram_owner_ids", "")
		frappe.db.set_value("User", "Administrator", "cago_telegram_id", None)

	def tearDown(self):
		frappe.db.set_value("Company", self.company, "cago_telegram_chat_id", self._prev_chat or "")
		frappe.db.set_value("Company", self.company, "cago_telegram_owner_ids", self._prev_ids or "")
		frappe.db.set_value("User", "Administrator", "cago_telegram_id", None)

	def test_unlinked_group_member_is_asked_to_link(self):
		reply, _b = telegram._route("/tonkho", "/tonkho", "55", "OPSGRP")
		self.assertIn("chưa liên kết", reply.lower())

	def test_linked_user_in_group_gets_data(self):
		frappe.db.set_value("User", "Administrator", "cago_telegram_id", "55")
		reply, _b = telegram._route("/tonkho", "/tonkho", "55", "OPSGRP")
		self.assertIsNotNone(reply)
		self.assertNotIn("chưa liên kết", reply.lower())

	def test_myid_works_before_recognition(self):
		# A brand-new person in a private chat (unrecognized) can still get their id to link / be added.
		reply, _b = telegram._route("/myid", "/myid", "9999", "9999")
		self.assertIn("9999", reply)

	def test_unrecognized_private_chat_is_silent(self):
		reply, _b = telegram._route("/no", "/no", "9999", "9999")
		self.assertIsNone(reply)


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


class TestTelegramSupportAction(FrappeTestCase):
	"""'🙋 Tôi xử lý' / '✅ Đã xong' on a call-staff alert claims/resolves the request AS the linked
	staff member; a stranger (no linked internal account) cannot."""

	def setUp(self):
		frappe.db.set_value("User", "Administrator", "cago_telegram_id", "tgsup1")
		doc = frappe.new_doc("Cago Support Request")
		doc.status = "pending"
		doc.reason = "Cần tư vấn"
		doc.kiosk_label = "Kệ A"
		doc.insert(ignore_permissions=True)
		self.req = doc.name
		frappe.db.commit()

	def tearDown(self):
		frappe.db.set_value("User", "Administrator", "cago_telegram_id", None)
		frappe.delete_doc("Cago Support Request", self.req, force=1, ignore_permissions=True)

	def _cb(self, from_id, data):
		return {"id": "x", "from": {"id": from_id}, "message": {"chat": {"id": "g"}, "message_id": 1, "text": "Khách cần hỗ trợ"}, "data": data}

	def test_stranger_cannot_claim(self):
		telegram._handle_callback(self._cb("99999", f"sup:accept:{self.req}"))
		self.assertEqual(frappe.db.get_value("Cago Support Request", self.req, "status"), "pending")

	def test_linked_staff_claims_and_resolves(self):
		telegram._handle_callback(self._cb("tgsup1", f"sup:accept:{self.req}"))
		self.assertEqual(frappe.db.get_value("Cago Support Request", self.req, "status"), "accepted")
		telegram._handle_callback(self._cb("tgsup1", f"sup:resolve:{self.req}"))
		self.assertEqual(frappe.db.get_value("Cago Support Request", self.req, "status"), "resolved")


class TestOwnerTelegramTargets(FrappeTestCase):
	"""Sensitive pushes (shift close) go to each OWNER's private chat — the allowlist + linked owner
	users — and never the shared staff group."""

	def test_owner_chats_include_allowlist_and_linked_owner(self):
		from cago.api import notify
		from cago.api.debt import _company

		company = _company()
		prev = frappe.db.get_value("Company", company, "cago_telegram_owner_ids")
		frappe.db.set_value("Company", company, "cago_telegram_owner_ids", "55501")
		frappe.db.set_value("User", "Administrator", "cago_telegram_id", "55502")  # owner-role user
		try:
			chats = notify._owner_telegram_chats()
			self.assertIn("55501", chats)  # manual allowlist
			self.assertIn("55502", chats)  # linked owner user
		finally:
			frappe.db.set_value("Company", company, "cago_telegram_owner_ids", prev or "")
			frappe.db.set_value("User", "Administrator", "cago_telegram_id", None)


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

	def test_signature_field_excluded_from_check(self):
		"""A newer Telegram `signature` field (Ed25519 3rd-party validation) must be excluded from the
		HMAC data-check like `hash` — otherwise a client that sends it would fail verification."""
		import time

		bot = "123456:TEST-BOT-TOKEN"
		fields = {"auth_date": str(int(time.time())), "user": '{"id":7}'}
		init = self._signed(bot, fields) + "&signature=Zm9vYmFy"  # hash signed over auth_date+user only
		ok, user, reason = telegram._check_init_data(init, bot)
		self.assertTrue(ok, reason)
		self.assertEqual(str(user.get("id")), "7")


class TestTelegramMiniAppLink(FrappeTestCase):
	"""In-app link: while in the Telegram Mini App and signed in, link the CURRENT Telegram to the
	logged-in account — the strongest path (verified initData + authenticated session, no bearer code)."""

	def setUp(self):
		from cago.api.debt import _company
		from cago.utils.secrets import set_secret

		self.company = _company()
		self.bot = "999:MINIAPP-LINK-TEST"
		frappe.db.set_value("User", "Administrator", "cago_telegram_id", None)  # clean start
		set_secret("Company", self.company, "cago_telegram_bot_token", self.bot)
		frappe.db.commit()

	def tearDown(self):
		from cago.utils.secrets import set_secret

		frappe.db.set_value("User", "Administrator", "cago_telegram_id", None)
		set_secret("Company", self.company, "cago_telegram_bot_token", "")
		frappe.db.commit()

	def _signed(self, fields):
		import hashlib
		import hmac
		from urllib.parse import urlencode

		dc = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
		secret = hmac.new(b"WebAppData", self.bot.encode(), hashlib.sha256).digest()
		h = hmac.new(secret, dc.encode(), hashlib.sha256).hexdigest()
		return urlencode({**fields, "hash": h})

	def test_valid_initdata_links_session_user(self):
		import time

		init = self._signed({"auth_date": str(int(time.time())), "user": '{"id":424299}'})
		telegram.link_current_telegram(init)  # session.user == Administrator in tests
		self.assertEqual(frappe.db.get_value("User", "Administrator", "cago_telegram_id"), "424299")

	def test_bad_signature_is_rejected(self):
		import time
		from urllib.parse import urlencode

		bad = urlencode({"auth_date": str(int(time.time())), "user": '{"id":1}', "hash": "deadbeef"})
		with self.assertRaises(Exception):
			telegram.link_current_telegram(bad)
		self.assertFalse(frappe.db.get_value("User", "Administrator", "cago_telegram_id"))
