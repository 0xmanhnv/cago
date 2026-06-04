# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Flat category taxonomy (WordPress-style).

The shop taxonomy used to ride ERPNext's Item Group nested tree (parent_item_group + is_group),
which forbids a "parent" group from holding products directly. To let a category BOTH hold its own
products AND be a parent (and aggregate its children's products), every shop category is now a flat
is_group=0 leaf directly under the root, and the 2-level hierarchy lives in the custom Link field
`cago_parent`. This module migrates an existing site to that shape (idempotent) — fresh installs
are seeded flat by cago.setup.sample_data.
"""

import frappe

ROOT = "All Item Groups"
# ERPNext's built-in groups — left untouched (the shop never assigns products to them).
DEFAULTS = {"Products", "Raw Material", "Services", "Sub Assemblies", "Consumable", ROOT}


def flatten_category_tree():
	"""Move every shop Item Group to a flat is_group=0 leaf under the root, preserving the old
	parent as `cago_parent`. Idempotent: once flat, it only no-ops. Wired to after_migrate."""
	root = frappe.db.get_value("Item Group", {"is_group": 1, "parent_item_group": ["in", ["", None]]}, "name") or ROOT
	groups = frappe.get_all(
		"Item Group",
		filters={"name": ["not in", list(DEFAULTS)]},
		fields=["name", "parent_item_group", "is_group", "cago_parent"],
	)
	# Snapshot the old parent BEFORE any change (flattening erases parent_item_group).
	old_parent = {g.name: g.parent_item_group for g in groups}

	def top_ancestor(name):
		"""The old top-most shop ancestor (the node that sat directly under the root) — so a deeper
		(3+ level) ERPNext tree collapses to the correct 2-level cago_parent, not a mid-chain link."""
		seen = set()
		cur = name
		while cur in old_parent and cur not in seen:
			seen.add(cur)
			p = old_parent[cur]
			if not p or p == root or p in DEFAULTS:
				return cur
			cur = p
		return cur

	changed = False
	for g in groups:
		# 1) Carry the old hierarchy into cago_parent as a 2-level link (point at the TOP ancestor, not
		#    the immediate parent), and only when we haven't already recorded one (don't clobber edits).
		anc = top_ancestor(g.name)
		if not g.cago_parent and anc != g.name:
			frappe.db.set_value("Item Group", g.name, "cago_parent", anc, update_modified=False)
			changed = True
		# 2) Flatten the physical tree: re-parent to root so no node has ERPNext children, which lets
		#    a former parent become a leaf (is_group=0) that can hold products.
		if g.parent_item_group != root:
			doc = frappe.get_doc("Item Group", g.name)
			doc.parent_item_group = root
			doc.save(ignore_permissions=True)  # NestedSet recomputes lft/rgt
			changed = True

	# 3) Now that every node sits under the root (no children), demote former parents to leaves.
	for g in groups:
		if frappe.db.get_value("Item Group", g.name, "is_group"):
			frappe.db.set_value("Item Group", g.name, "is_group", 0, update_modified=False)
			changed = True

	if changed:
		frappe.db.commit()
		try:
			from frappe.utils.nestedset import rebuild_tree

			rebuild_tree("Item Group")
		except Exception:
			pass
		print("Category tree flattened to cago_parent model.")


def children_of(category):
	"""The leaf categories whose cago_parent is `category` (one level)."""
	return frappe.get_all("Item Group", filters={"cago_parent": category}, pluck="name")


def subtree_of(category):
	"""A category + its direct children — the set whose products a parent view aggregates."""
	return [category] + children_of(category)
