# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Customer-facing display (CFD) relay.

So the customer screen can run on a SEPARATE device (not just a 2nd window of the cashier's browser),
the till pushes the current cart/total/QR to the server (set_state, sell cap) and the public display
polls it (get_state, guest). State lives in the cache (Redis) — ephemeral, no DB writes. Only what
the customer already sees is exposed (item names + selling line totals + grand total + QR); never cost,
and the customer name is NOT sent here (kept to the same-machine BroadcastChannel path).
"""

from __future__ import annotations

import json

import frappe

from cago.utils.permissions import ensure_cap

_KEY = "cago_cfd_state"
_IDLE = {"type": "idle"}


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
def get_state():
	"""Public: the current display state for the customer screen. Idle when nothing is set."""
	raw = frappe.cache().get_value(_KEY)
	if not raw:
		return _IDLE
	try:
		return json.loads(raw)
	except Exception:
		return _IDLE
