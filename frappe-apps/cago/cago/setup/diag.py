# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""Developer diagnostics — run write APIs as a real (non-admin) role to surface
permission bugs that Administrator would mask.

    bench --site <site> execute cago.setup.diag.check_owner_writes
"""

import frappe


def _try(label, fn, out):
	try:
		out.append((label, "OK", str(fn())))
	except Exception as e:  # noqa: BLE001 - diagnostic
		import traceback
		tb = traceback.format_exc().splitlines()
		# keep the last app/frappe frames to locate the throw
		frames = [l.strip() for l in tb if "/apps/" in l][-3:]
		out.append((label, "FAIL", f"{type(e).__name__}: {str(e)[:80]} | " + " <- ".join(frames)))


def count_search_queries():
	"""Count SQL statements issued by each list endpoint (regression guard for N+1)."""
	from cago.api import kiosk, owner, staff

	def measure(label, fn):
		orig = frappe.db.sql
		n = {"c": 0}

		def counting(*a, **k):
			n["c"] += 1
			return orig(*a, **k)

		frappe.db.sql = counting
		try:
			res = fn()
		finally:
			frappe.db.sql = orig
		print(f"  {label}: items={len(res)} sql_calls={n['c']}")
		return n["c"]

	measure("staff.search_products('')", lambda: staff.search_products(""))
	measure("owner.search_products('')", lambda: owner.search_products(""))
	measure("kiosk.list_products()", lambda: kiosk.list_products())


def check_owner_writes(owner_user="owner@cago.test"):
	"""Exercise owner-only write paths as `owner_user` (default Cago Owner)."""
	from cago.api import debt, owner, reports

	prev = frappe.session.user
	results = []
	try:
		frappe.set_user(owner_user)
		cust = frappe.db.get_value("Customer", {"customer_name": "Bác Lan"}, "name")
		results.append(("user", "INFO", f"{frappe.session.user} roles={frappe.get_roles()}"))
		_try("record_repayment", lambda: debt.record_repayment(cust, 50000)["outstanding_text"], results)
		_try("record_debt", lambda: debt.record_debt(cust, 80000)["outstanding_text"], results)
		_try("update_price", lambda: owner.update_price("NPK-16-16-8-A", 460000)["new_price_text"], results)
		_try("debt_list", lambda: len(reports.debt_list()), results)
	finally:
		frappe.set_user(prev)

	for label, status, detail in results:
		print(f"  [{status}] {label}: {detail}")
	return results
