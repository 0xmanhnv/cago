# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Repeatable security/safety audit (docs/12, docs/18).

Run after changes / before go-live:

    bench --site <site> execute cago.setup.audit.run_audit

Exits non-zero (raises) if any check fails, so it can gate a deploy.
"""

import frappe

from cago.utils import dto
from cago.utils.permissions import ALL_CAP_ROLES

SENSITIVE_TOKENS = ("valuation", "buying", "last_purchase", "margin", "profit", "cost", "standard_rate")
# No capability role (nor the deprecated Cago Staff / Kiosk) may read raw Item — staff must never
# reach buying price / valuation via the Desk; everything goes through curated DTOs.
SENSITIVE_ROLES = tuple(sorted(ALL_CAP_ROLES)) + ("Cago Staff", "Cago Kiosk")


def _roles_with_item_read():
	roles = set()
	for table in ("DocPerm", "Custom DocPerm"):
		for r in frappe.get_all(table, filters={"parent": "Item", "read": 1}, fields=["role"]):
			roles.add(r.role)
	return roles


def run_audit():
	checks = []

	# 1) Staff/Kiosk roles must NOT have raw read access to Item.
	item_readers = _roles_with_item_read()
	for role in SENSITIVE_ROLES:
		ok = role not in item_readers
		checks.append((f"Role '{role}' has no raw Item read", ok, "" if ok else "role can read Item"))

	# 2) Staff & public DTOs must not carry sensitive keys (test on a chemical item).
	sample = frappe.db.get_value("Item", {"cago_is_chemical": 1}, "name") or frappe.db.get_value(
		"Item", {}, "name"
	)
	if sample:
		item = frappe.get_doc("Item", sample)
		for label, builder in (("staff", dto.staff_dto), ("public", dto.public_dto)):
			leaked = [k for k in builder(item) if any(t in k.lower() for t in SENSITIVE_TOKENS)]
			checks.append((f"{label} DTO has no sensitive keys", not leaked, ", ".join(leaked)))

	# 2b) Offline catalog snapshot (cached on staff devices) must not leak sensitive keys either.
	try:
		from cago.api.staff import catalog_snapshot

		snap = catalog_snapshot()
		leaked = sorted({k for row in snap for k in row if any(t in k.lower() for t in SENSITIVE_TOKENS)})
		checks.append(("Offline catalog snapshot has no sensitive keys", not leaked, ", ".join(leaked)))
	except Exception as exc:
		checks.append(("Offline catalog snapshot has no sensitive keys", False, str(exc)))

	# 3) Every chemical item must produce a non-empty safety warning.
	missing = []
	for code in frappe.get_all("Item", filters={"cago_is_chemical": 1}, pluck="name"):
		if not dto.safety_warning_for(frappe.get_doc("Item", code)):
			missing.append(code)
	checks.append(("All chemical items show a safety warning", not missing, ", ".join(missing)))

	# 4) Owner-only API guard exists for price/debt (sanity: methods are whitelisted).
	for method in (
		"cago.api.owner.update_price",
		"cago.api.debt.record_repayment",
		"cago.api.reports.debt_list",
	):
		fn = frappe.get_attr(method)
		ok = getattr(fn, "__name__", None) is not None
		checks.append((f"Whitelisted method exists: {method}", ok, ""))

	# 4b) …and those guards must actually FIRE: a no-capability caller (Guest) must be rejected with
	# PermissionError. This makes a dropped ensure_cap/ensure_owner fail the deploy gate, not just a
	# unit test. Args are minimal — the guard runs before any of them is used.
	from cago.utils.privileged import as_user

	guarded = [
		("cago.api.owner.update_price", ("_audit_no_item_", 1)),
		("cago.api.debt.record_repayment", ("_audit_no_cust_", 1)),
		("cago.api.purchasing.receive_stock", ("_audit_no_item_", 1)),
		("cago.api.sales.quick_sale", ("[]",)),
	]
	for method, fargs in guarded:
		enforced = False
		try:
			with as_user("Guest"):
				frappe.get_attr(method)(*fargs)
		except frappe.PermissionError:
			enforced = True
		except Exception:
			enforced = False  # threw, but NOT the permission guard → the capability check didn't run first
		checks.append((f"Capability guard rejects no-cap caller: {method}", enforced, "guard missing or runs too late"))

	# 5) Hardening config sanity (go-live).
	signup_off = bool(frappe.db.get_single_value("Website Settings", "disable_signup"))
	checks.append(("Public signup is disabled", signup_off, "enable disable_signup"))
	phone_on = bool(frappe.db.get_single_value("System Settings", "allow_login_using_mobile_number"))
	checks.append(("Login by mobile number enabled", phone_on, "enable allow_login_using_mobile_number"))

	# 6) Phase 1 expiry report is callable and never leaks sensitive keys.
	try:
		from cago.api import inventory

		rows = inventory.expiring_soon(days=3650)
		leaked = [k for r in rows for k in r if any(t in k.lower() for t in SENSITIVE_TOKENS)]
		checks.append(("Expiry report works without sensitive keys", not leaked, ", ".join(leaked)))
	except Exception as exc:
		checks.append(("Expiry report works without sensitive keys", False, str(exc)))

	failed = [c for c in checks if not c[1]]
	print("\n=== Cago security/safety audit ===")
	for name, ok, detail in checks:
		print(f"  {'PASS' if ok else 'FAIL'}  {name}{(' -> ' + detail) if (detail and not ok) else ''}")
	print(f"=== {len(checks) - len(failed)}/{len(checks)} passed ===\n")

	if failed:
		frappe.throw(f"Audit failed: {len(failed)} check(s) failed.")
	return {"passed": len(checks), "failed": 0}
