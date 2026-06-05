# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Guard the custom-field sources. cago_ fields come from TWO complementary places — the fixture
(product/display fields) and setup/custom_fields.py (operational fields). They must stay DISJOINT
so they can never drift (a field edited in one source but not the other). See the
custom-fields-dual-source note.

Run: bench --site <site> run-tests --app cago --module cago.tests.test_custom_fields
"""

import json
import os
import re

import frappe
from frappe.tests.utils import FrappeTestCase


class TestCustomFieldSources(FrappeTestCase):
	def test_fixture_and_imperative_are_disjoint(self):
		app = frappe.get_app_path("cago")
		with open(os.path.join(app, "fixtures", "custom_field.json")) as f:
			fixture = {d["fieldname"] for d in json.load(f) if str(d.get("fieldname", "")).startswith("cago_")}
		with open(os.path.join(app, "setup", "custom_fields.py")) as f:
			imperative = set(re.findall(r'"fieldname":\s*"(cago_[a-z_]+)"', f.read()))
		overlap = fixture & imperative
		self.assertEqual(
			overlap,
			set(),
			f"cago_ field(s) defined in BOTH the fixture AND setup/custom_fields.py (drift risk): {sorted(overlap)}",
		)
