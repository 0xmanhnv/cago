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
import shutil

import frappe
from frappe.utils import get_site_path
from frappe.utils.backups import new_backup

KEEP = 7  # daily backup sets to retain locally


def daily():
	"""Scheduler entry: take a DB+files backup, prune old sets, optionally copy offsite."""
	new_backup(ignore_files=False, force=True)
	prune(KEEP)
	_copy_offsite()
	frappe.logger().info("cago: daily backup taken")


def _offsite_dir():
	"""Where to mirror backups (a mounted volume / NAS path), or None. Owner-configured via
	env CAGO_BACKUP_OFFSITE_DIR or site_config cago_backup_offsite_dir — unset = local only."""
	return (os.environ.get("CAGO_BACKUP_OFFSITE_DIR") or frappe.conf.get("cago_backup_offsite_dir") or "").strip() or None


def _copy_offsite():
	"""Mirror the NEWEST backup set to the configured offsite dir, if any (best-effort, never fatal)."""
	dest = _offsite_dir()
	if not dest:
		return
	bdir = get_site_path("private", "backups")
	if not os.path.isdir(bdir) or not os.path.isdir(dest):
		frappe.logger().warning(f"cago: offsite backup dir missing ({dest}); skipped")
		return
	files = [f for f in os.listdir(bdir) if "-" in f]
	stamps = sorted({f.split("-", 1)[0] for f in files}, reverse=True)
	if not stamps:
		return
	newest = stamps[0]
	for f in files:
		if f.split("-", 1)[0] == newest:
			try:
				shutil.copy2(os.path.join(bdir, f), os.path.join(dest, f))
			except OSError as e:
				frappe.logger().warning(f"cago: offsite copy failed for {f}: {e}")


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
