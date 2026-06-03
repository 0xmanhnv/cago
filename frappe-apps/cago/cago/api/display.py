# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Customer-facing display (CFD) relay — token-gated.

The customer screen can run on a SEPARATE device, so it must be reachable without a staff login; but
to keep it from being polled by any device on the network, reads are gated by a per-shop token. The
till (set_state, sell cap) pushes the cart/total/QR; the display at /display?k=<token> polls get_state
with that token. State is cache-only (Redis), ephemeral. Only what the customer already sees is sent
(item names + selling line totals + grand total + QR) — never cost; the customer name is not relayed.
"""

from __future__ import annotations

import json

import frappe

from cago.api.debt import _company
from cago.utils.permissions import ensure_cap

_KEY = "cago_cfd_state"
_IDLE = {"type": "idle"}


def _token():
	"""The shop's CFD pairing token (auto-created once, stored on Company)."""
	company = _company()
	if not company:
		return ""
	tok = frappe.db.get_value("Company", company, "cago_cfd_token")
	if not tok:
		tok = frappe.generate_hash(length=24)
		frappe.db.set_value("Company", company, "cago_cfd_token", tok)
		frappe.db.commit()
	return tok


@frappe.whitelist()
def cfd_token():
	"""Till/owner: the pairing token, to build the /display?k=<token> URL. Needs the sell capability."""
	ensure_cap("sell")
	return {"token": _token()}


@frappe.whitelist()
def set_state(data):
	"""Till pushes the live display state (a JSON CfdMsg). Cache-only; overwrites the single shop state."""
	ensure_cap("sell")
	try:
		parsed = json.loads(data) if isinstance(data, str) else data
	except Exception:
		parsed = _IDLE
	frappe.cache().set_value(_KEY, json.dumps(parsed or _IDLE))
	return {"ok": True}


@frappe.whitelist(allow_guest=True)
def get_state(token=None):
	"""Public-but-token-gated: the current display state for the customer screen. A wrong/absent token
	returns idle (so a random device on the LAN can't read what's being rung up)."""
	if not token or token != _token():
		return _IDLE
	raw = frappe.cache().get_value(_KEY)
	if not raw:
		return _IDLE
	try:
		return json.loads(raw)
	except Exception:
		return _IDLE
