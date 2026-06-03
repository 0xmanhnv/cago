#!/usr/bin/env python3
"""Export cago fixtures (Roles, Custom Fields, Property Setters).

Run after changing custom fields / roles via the Desk UI so the JSON in
`frappe-apps/cago/cago/fixtures/` stays in sync.

Usage (from your frappe-bench directory):

    python scripts/export_fixtures.py --site mysite.local
"""
import argparse
import subprocess
import sys


def main():
	parser = argparse.ArgumentParser(description="Export Cago fixtures.")
	parser.add_argument("--site", required=True, help="Frappe site name")
	parser.add_argument("--bench", default=".", help="Path to frappe-bench dir (default: cwd)")
	args = parser.parse_args()

	cmd = ["bench", "--site", args.site, "export-fixtures", "--app", "cago"]
	print("Running:", " ".join(cmd))
	sys.exit(subprocess.call(cmd, cwd=args.bench))


if __name__ == "__main__":
	main()
