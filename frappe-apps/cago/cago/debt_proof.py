# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Debt acknowledgement proof (số nợ số hoá).

In rural shops a customer signs the paper debt ledger to acknowledge a debt. On a touchscreen they
can't, so we capture the same acknowledgement digitally — a finger signature / điểm chỉ, an optional
photo, and a witness name — and store it as a `Cago Debt Proof` linked to the debt/repayment voucher,
viewable later in the customer's ledger. The owner configures whether it's off / optional / required
and a money threshold, separately for taking on debt and for collecting repayment.
"""

import base64

import frappe
from frappe.utils import flt, now_datetime


def _company():
	from cago.api.debt import _company as c

	return c()


def proof_policy():
	"""Owner settings for the bootstrap so the UI knows when to ask for a confirmation.
	mode ∈ off|optional|required; min = only REQUIRED at/above this amount (0 = always)."""
	co = _company()

	def _get(field, default="off"):
		return (co and frappe.db.get_value("Company", co, field)) or default

	return {
		"debt": {"mode": _get("cago_debt_confirm"), "min": flt(_get("cago_debt_confirm_min", 0))},
		"repay": {"mode": _get("cago_repay_confirm"), "min": flt(_get("cago_repay_confirm_min", 0))},
	}


def _save_dataurl_image(dataurl, prefix, proof_name):
	"""Persist a base64 data: URL (signature canvas / camera photo) as a private File attached to the
	proof, return its file_url. Returns None for empty/invalid input."""
	if not dataurl or "," not in dataurl or not dataurl.startswith("data:"):
		return None
	header, b64 = dataurl.split(",", 1)
	ext = "png" if "png" in header else ("jpeg" if ("jpeg" in header or "jpg" in header) else "png")
	try:
		content = base64.b64decode(b64)
	except Exception:
		return None
	f = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": f"{prefix}-{proof_name}.{ext}",
			"is_private": 1,
			"content": content,
			"attached_to_doctype": "Cago Debt Proof",
			"attached_to_name": proof_name,
		}
	).insert(ignore_permissions=True)
	return f.file_url


def save_proof(customer, kind, amount, voucher_type=None, voucher_no=None, signature=None, photo=None, witness=None, cashier=None):
	"""Create a Cago Debt Proof for a debt (kind='debt') or repayment (kind='repay'). No-op when no
	acknowledgement was captured (nothing to store). Best-effort: never blocks the sale/debt itself."""
	signature = (signature or "").strip()
	photo = (photo or "").strip()
	witness = (witness or "").strip()
	if not (signature or photo or witness):
		return None
	try:
		proof = frappe.get_doc(
			{
				"doctype": "Cago Debt Proof",
				"customer": customer,
				"kind": "repay" if kind == "repay" else "debt",
				"amount": flt(amount),
				"voucher_type": voucher_type,
				"voucher_no": voucher_no,
				"posted_at": now_datetime(),
				"cashier": cashier or frappe.session.user,
				"witness": witness or None,
				"method": ",".join(m for m, on in (("signature", signature), ("photo", photo), ("witness", witness)) if on),
			}
		).insert(ignore_permissions=True)
		sig_url = _save_dataurl_image(signature, "sign", proof.name)
		photo_url = _save_dataurl_image(photo, "photo", proof.name)
		if sig_url or photo_url:
			if sig_url:
				proof.signature = sig_url
			if photo_url:
				proof.photo = photo_url
			proof.save(ignore_permissions=True)
		return proof.name
	except Exception:
		frappe.log_error(title="cago.debt_proof.save_proof")
		return None


@frappe.whitelist()
def proofs_for(voucher_no):
	"""Proofs attached to a voucher (for the customer ledger detail view)."""
	from cago.utils.permissions import ensure_cap

	ensure_cap("debt_view")
	return frappe.get_all(
		"Cago Debt Proof",
		filters={"voucher_no": voucher_no},
		fields=["name", "kind", "amount", "signature", "photo", "witness", "method", "posted_at", "cashier"],
		order_by="creation desc",
	)
