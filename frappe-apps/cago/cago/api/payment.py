# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""VietQR payment QR.

Shows a QR the customer scans in their banking app to transfer the exact amount (debt
repayment / kiosk basket). Display-only — it does NOT record the payment (the owner
still confirms via 'Khách trả nợ'). Uses VietQR's public image endpoint; the store's
bank account is configured by the owner.
"""

import urllib.parse

import frappe

from cago.utils.permissions import ensure_owner, ensure_staff
from frappe.utils import cint, flt


def _company():
	return frappe.defaults.get_global_default("company") or (frappe.get_all("Company", pluck="name") or [None])[0]


def _bank():
	c = _company()
	if not c:
		return {"bin": "", "account": "", "name": ""}
	return {
		"bin": frappe.db.get_value("Company", c, "cago_bank_bin") or "",
		"account": frappe.db.get_value("Company", c, "cago_bank_account") or "",
		"name": frappe.db.get_value("Company", c, "cago_bank_account_name") or "",
	}


@frappe.whitelist()
def get_bank():
	"""Owner: current store bank config."""
	ensure_owner()
	b = _bank()
	b["configured"] = bool(b["bin"] and b["account"])
	return b


@frappe.whitelist()
def save_bank(bank_bin=None, account=None, account_name=None):
	"""Owner: set the store bank account for VietQR."""
	ensure_owner()
	c = _company()
	frappe.db.set_value(
		"Company",
		c,
		{
			"cago_bank_bin": (bank_bin or "").strip(),
			"cago_bank_account": (account or "").strip(),
			"cago_bank_account_name": (account_name or "").strip(),
		},
	)
	frappe.db.commit()
	return get_bank()


@frappe.whitelist()
def vietqr(amount=None, info=None):
	"""Staff/owner: VietQR image URL for an amount (or open QR if amount omitted)."""
	ensure_staff()
	b = _bank()
	if not (b["bin"] and b["account"]):
		return {"configured": False, "url": None}
	params = {}
	amt = cint(flt(amount))
	if amt > 0:
		params["amount"] = amt
	if info:
		params["addInfo"] = info
	if b["name"]:
		params["accountName"] = b["name"]
	url = f"https://img.vietqr.io/image/{b['bin']}-{b['account']}-compact2.png"
	if params:
		url += "?" + urllib.parse.urlencode(params)
	return {"configured": True, "url": url, "account": b["account"], "name": b["name"]}
