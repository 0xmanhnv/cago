# Copyright (c) 2026, 0xManhnv
# For license information, please see license.txt
"""Automated daily site backup.

The Docker deployment has no OS-level `bench setup backups` cron, and Frappe core doesn't
schedule one via app hooks — so without this nothing backs the site up. Wired to the daily
scheduler event (hooks.py); creates a DB+files backup and keeps only the last KEEP days so the
disk doesn't grow without bound. Offsite copy is still the owner's responsibility — see
docs/14_OPERATIONS_AND_TRAINING.md and docs/33.
"""

import os

import frappe
from frappe.utils import get_site_path
from frappe.utils.backups import new_backup

KEEP = 7  # daily backup sets to retain locally


def daily():
	"""Scheduler entry: take a DB+files backup, then prune older sets."""
	new_backup(ignore_files=False, force=True)
	prune(KEEP)
	frappe.logger().info("cago: daily backup taken")


def prune(keep=KEEP):
	"""Keep only the newest `keep` backup SETS (a set = all files sharing the YYYYMMDD_HHMMSS prefix)."""
	bdir = get_site_path("private", "backups")
	if not os.path.isdir(bdir):
		return
	files = [f for f in os.listdir(bdir) if "-" in f]
	stamps = sorted({f.split("-", 1)[0] for f in files}, reverse=True)
	keep_stamps = set(stamps[:keep])
	for f in files:
		if f.split("-", 1)[0] not in keep_stamps:
			try:
				os.remove(os.path.join(bdir, f))
			except OSError:
				pass
