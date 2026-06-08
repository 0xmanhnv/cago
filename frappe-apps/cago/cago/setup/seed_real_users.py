# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Seed the REAL operator accounts of a store — owner, staff, technical admin.

WHY THIS IS SEPARATE FROM test_accounts.py:
    test_accounts.py holds throwaway DEMO logins (…@cago.test / Test@12345) that are safe to keep
    in git. The REAL people who run a live store (their personal email, phone, password) must NEVER
    be committed. So this module carries NO data — it is a generic, idempotent LOADER that reads the
    account list from a JSON file that lives OUTSIDE git (gitignored, e.g. infra/secrets/…).

    Code (this file)  → public, in git, store-agnostic.
    Data (the JSON)   → secret, gitignored, one file per real store.

RUN (see infra/secrets/cago_real_users.example.json for the file shape):
    # copy the secret file into the backend container, then:
    bench --site <site> execute cago.setup.seed_real_users.seed_real_users \
        --kwargs '{"path": "/tmp/cago_real_users.json"}'

    # or point at a default location inside the site dir (sites/<site>/cago_real_users.json):
    bench --site <site> execute cago.setup.seed_real_users.seed_real_users

Idempotent: re-running maps the file onto the database again (creating missing users, updating
roles/limits, and — because a seed is authoritative — resetting each password to the file's value).

MAPPING (the only thing this loader decides):
    tier "admin"  → roles {System Manager, Cago Admin}     (full technical admin; keeps the desk)
    tier "owner"  → role  {Cago Owner}                     (the super-role; managed by hand after)
    tier "staff"  → job_roles[] compiled into cap-roles    (chức danh → caps, confined to /pos)
"""

import json
import os

import frappe

# tier → the tier roles to grant directly (staff get cap-roles from their chức danh instead).
TIER_ROLES = {
	"admin": ["System Manager", "Cago Admin"],
	"owner": ["Cago Owner"],
	"staff": [],
}

DEFAULT_FILENAME = "cago_real_users.json"


def _resolve_path(path=None):
	"""Find the secret JSON: explicit arg → env CAGO_REAL_USERS → sites/<site>/cago_real_users.json."""
	if path:
		return path
	env = os.environ.get("CAGO_REAL_USERS")
	if env:
		return env
	return frappe.get_site_path(DEFAULT_FILENAME)


def seed_real_users(path=None):
	"""Load the real-account list from a gitignored JSON file and apply it idempotently."""
	src = _resolve_path(path)
	if not os.path.exists(src):
		raise FileNotFoundError(
			f"Real-users seed file not found: {src}. Create it from "
			f"infra/secrets/cago_real_users.example.json (and keep it OUT of git)."
		)
	with open(src, encoding="utf-8") as fh:
		accounts = json.load(fh)
	if not isinstance(accounts, list):
		frappe.throw("Seed file must be a JSON array of account objects.")

	for a in accounts:
		_apply_account(a)

	frappe.db.commit()
	print(f"Seeded {len(accounts)} real account(s) from {src}.")


def _apply_account(a):
	tier = (a.get("tier") or "staff").strip()
	if tier not in TIER_ROLES:
		frappe.throw(f"Unknown tier {tier!r} (use admin | owner | staff).")

	mobile = (a.get("mobile") or "").strip() or None
	# phone-only people log in by SĐT; they still need an email primary key — derive a stable one.
	email = (a.get("email") or "").strip() or (f"{mobile}@cago.local" if mobile else "")
	if not email:
		frappe.throw("Each account needs an email or a mobile (to derive the login id).")
	name = (a.get("full_name") or email.split("@")[0]).strip()

	# A phone is a login credential here (unique). Don't let one collide with a DIFFERENT user.
	if mobile:
		clash = frappe.db.get_value("User", {"mobile_no": mobile, "name": ["!=", email]}, "name")
		if clash:
			frappe.throw(f"Mobile {mobile} already belongs to {clash}; fix the seed file.")

	doc = frappe.get_doc("User", email) if frappe.db.exists("User", email) else frappe.new_doc("User")
	doc.update(
		{
			"doctype": "User",
			"email": email,
			"first_name": name,
			"mobile_no": mobile,
			"user_type": "System User",  # internal operator (not a website/customer login)
			"language": "vi",
			"enabled": 1 if a.get("enabled", True) else 0,
			"send_welcome_email": 0,
		}
	)
	if a.get("password"):
		doc.new_password = a["password"]  # a seed is authoritative: (re)set to the file's value
	# per-staff operational limits (optional)
	for f in ("cago_allow_price_edit", "cago_blind_shift_close"):
		k = f.replace("cago_", "")
		if k in a:
			doc.set(f, 1 if a[k] else 0)
	if "max_discount_pct" in a:
		doc.cago_max_discount_pct = a["max_discount_pct"]
	doc.flags.ignore_permissions = True
	doc.save(ignore_permissions=True)

	# tier roles (System Manager/Cago Admin/Cago Owner) — additive, idempotent.
	add = [r for r in TIER_ROLES[tier] if r not in set(frappe.get_roles(email))]
	if add:
		doc.add_roles(*add)

	# staff capabilities come from their chức danh (job roles) → compiled into cap-roles + /pos-confined.
	if tier == "staff":
		from cago.utils.permissions import sync_user_caps

		titles = a.get("job_roles") or []
		valid = [t for t in titles if frappe.db.exists("Cago Job Role", t)]
		missing = set(titles) - set(valid)
		if missing:
			frappe.throw(f"Unknown chức danh {sorted(missing)} for {email}; seed the job roles first.")
		doc.set("cago_job_roles", [{"job_role": t} for t in valid])
		doc.save(ignore_permissions=True)
		sync_user_caps(email)  # compile caps + strip raw-ERPNext desk roles

	roles = TIER_ROLES[tier] or (a.get("job_roles") or [])
	print(f"  {email:32} tier={tier:6} mobile={mobile or '-':12} roles/chức-danh={roles}")
