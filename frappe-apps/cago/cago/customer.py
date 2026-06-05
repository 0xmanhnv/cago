# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Customer helpers — a stable URL slug per customer.

Customer docnames can be raw Vietnamese (e.g. "Cô Ba Test"), which is fragile in a URL.
Each customer gets a `cago_slug` (slugified name + a numeric suffix to stay unique). Links
use the slug; debt APIs resolve it back to the docname via `resolve_customer`. See docs/27.
"""

import frappe

from cago.utils.slug import slugify


def _unique_slug(base, exclude=None):
	"""A slug not already taken by another Customer. Appends -2, -3, … on collision."""
	base = base or "khach"
	candidate = base
	i = 1
	while True:
		clash = frappe.db.get_value("Customer", {"cago_slug": candidate}, "name")
		if not clash or clash == exclude:
			return candidate
		i += 1
		candidate = f"{base}-{i}"


def set_slug(doc, method=None):
	"""Customer hook (before_insert/validate): fill `cago_slug` once, keep it stable after."""
	if doc.get("cago_slug"):
		return
	doc.cago_slug = _unique_slug(slugify(doc.customer_name or doc.name), exclude=doc.name)


def resolve_customer(value):
	"""Map a URL handle back to the Customer docname. Accepts either the slug or the docname
	(backward compatible) — returns the docname, or the original value if nothing matches."""
	if not value:
		return value
	# Docname is the canonical key — match it FIRST so a real docname can never be shadowed by some
	# other customer whose slug happens to equal it. Fall back to slug lookup for URL handles.
	if frappe.db.exists("Customer", value):
		return value
	return frappe.db.get_value("Customer", {"cago_slug": value}, "name") or value


def backfill_slugs():
	"""Give every existing customer a slug (idempotent — only fills the empty ones)."""
	rows = frappe.get_all(
		"Customer",
		filters={"cago_slug": ["in", ["", None]]},
		fields=["name", "customer_name"],
	)
	for r in rows:
		slug = _unique_slug(slugify(r.customer_name or r.name), exclude=r.name)
		frappe.db.set_value("Customer", r.name, "cago_slug", slug, update_modified=False)
	if rows:
		frappe.db.commit()
	return len(rows)
