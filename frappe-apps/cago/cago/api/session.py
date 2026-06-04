# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Session bootstrap for the decoupled Next.js frontend.

A single call the SPA makes on load (and after login) to learn who the user is,
their roles, a CSRF token for write requests, and the small pieces of branding the
old server-rendered pages used to inject (persona, brand).

The role list is for UI gating only — every owner/staff API still enforces its own
server-side guard (see utils/permissions.py), so a forged client role grants nothing.
"""

import frappe

from cago.chatbot import config as chatbot_config
from cago.utils.permissions import caps_for_user, has_cap, selling_limits


@frappe.whitelist(allow_guest=True)
def bootstrap():
	"""Everything the frontend needs once per load. Safe for guests (kiosk)."""
	_limits = selling_limits()
	return {
		"user": frappe.session.user,
		"full_name": (frappe.session.user != "Guest" and frappe.db.get_value("User", frappe.session.user, "full_name")) or "",
		"is_guest": frappe.session.user == "Guest",
		"roles": frappe.get_roles(),
		# Capability keys this user holds (owner = all). The /pos UI renders only the tiles a
		# user may use; every API still re-checks server-side (ensure_cap).
		"caps": caps_for_user(),
		"csrf_token": frappe.sessions.get_csrf_token(),
		"brand": frappe.db.get_single_value("Website Settings", "app_name") or "Minh Tuyết",
		"persona": chatbot_config.persona(),
		"kiosk_chips": chatbot_config.kiosk_chips(),
		"kiosk_debt_visible": _kiosk_debt_visible(),
		# Per-staff bargaining allowance (owner = unlimited). The sell screen gates the discount
		# box + per-line edit on these; quick_sale re-checks for the cashier.
		"allow_price_edit": _limits["allow_price_edit"],
		"max_discount_pct": _limits["max_discount_pct"],
		# đồng per loyalty point when redeemed at the till (so the sell UI shows "N điểm = Yđ").
		"loyalty_redeem_vnd": _loyalty_redeem_vnd(),
		"staff_can_collect_debt": _staff_can_collect_debt(),
		# Is a store map published? Gate the kiosk "Sơ đồ cửa hàng" tile + product "Xem vị trí".
		"store_map": _store_map_published(),
		# Shared kiosk+POS device: the POS PIN lock lives in the SERVER SESSION (not localStorage),
		# so editing the URL / clearing storage can't bypass it. Drives the PinLock gate.
		"pos_locked": _is_pos_locked(),
		"has_pos_pin": _has_pos_pin(),
	}


def _store_map_published():
	# Guarded: bootstrap runs on every page; tolerate the doctype not existing yet (pre-migrate).
	try:
		return bool(frappe.db.get_single_value("Cago Store Map", "is_published"))
	except Exception:
		return False


def _company():
	return frappe.defaults.get_global_default("company") or (frappe.get_all("Company", pluck="name") or [None])[0]


def _kiosk_debt_visible():
	company = _company()
	return bool(company and frappe.db.get_value("Company", company, "cago_kiosk_debt_visible"))


def _loyalty_redeem_vnd():
	from cago.loyalty import redeem_value

	return redeem_value()


def _staff_can_collect_debt():
	"""Whether THIS user may record customer debt repayments — now the `debt` capability.
	UI hint only; debt.record_repayment re-checks via ensure_cap('debt')."""
	return has_cap("debt")


# --------------------------------------------------------------------------- #
# POS quick-PIN lock (shared kiosk+POS device)
#
# The lock state lives in the SERVER SESSION (a cache flag keyed by the session id), so a customer
# can't bypass it by editing the URL, reloading, or clearing localStorage — unlike a client-only
# flag. The PIN itself is stored hashed on the User. This is still defence-in-depth on top of the
# OS-level kiosk lockdown (the real boundary); it just makes the web layer non-trivial to bypass.
# --------------------------------------------------------------------------- #
import hashlib  # noqa: E402

from cago.utils.permissions import ensure_internal  # noqa: E402


def _pin_hash(pin):
	return hashlib.sha256(("cago-pos-pin:" + (pin or "")).encode("utf-8")).hexdigest()


def _lock_key():
	return f"cago_pos_locked::{getattr(frappe.session, 'sid', '') or frappe.session.user}"


def _set_pos_locked(on):
	if on:
		frappe.cache().set_value(_lock_key(), "1", expires_in_sec=86400)
	else:
		frappe.cache().delete_value(_lock_key())


def _is_pos_locked():
	return frappe.session.user != "Guest" and bool(frappe.cache().get_value(_lock_key()))


def _has_pos_pin():
	return bool(frappe.session.user != "Guest" and frappe.db.get_value("User", frappe.session.user, "cago_pos_pin"))


@frappe.whitelist()
def set_pos_pin(pin):
	"""Set this user's 4-digit quick-unlock PIN (stored hashed). Used on a shared kiosk+POS device."""
	ensure_internal()
	pin = (pin or "").strip()
	if not (pin.isdigit() and len(pin) == 4):
		frappe.throw("Mã PIN phải là 4 chữ số.")
	frappe.db.set_value("User", frappe.session.user, "cago_pos_pin", _pin_hash(pin))
	return {"ok": True}


@frappe.whitelist()
def clear_pos_pin():
	ensure_internal()
	frappe.db.set_value("User", frappe.session.user, "cago_pos_pin", None)
	_set_pos_locked(False)
	return {"ok": True}


@frappe.whitelist()
def pos_lock():
	"""Lock this device's POS behind the PIN (server-session flag — survives URL edits / reload)."""
	ensure_internal()
	_set_pos_locked(True)
	return {"ok": True}


@frappe.whitelist()
def pos_unlock(pin):
	"""Verify the PIN (server-side, rate-limited) and clear the lock. Wrong PIN throws."""
	ensure_internal()
	fails_key = f"cago_pos_pinfail::{getattr(frappe.session, 'sid', '') or frappe.session.user}"
	from frappe.utils import cint

	if cint(frappe.cache().get_value(fails_key)) >= 5:
		frappe.throw("Nhập sai nhiều lần. Thử lại sau ít phút.")
	stored = frappe.db.get_value("User", frappe.session.user, "cago_pos_pin")
	if not stored or _pin_hash((pin or "").strip()) != stored:
		frappe.cache().set_value(fails_key, cint(frappe.cache().get_value(fails_key)) + 1, expires_in_sec=300)
		frappe.throw("Mã PIN không đúng.")
	frappe.cache().delete_value(fails_key)
	_set_pos_locked(False)
	return {"ok": True}
