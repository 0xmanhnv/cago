#!/usr/bin/env python3
"""Convenience wrapper to import sample products into a Frappe site.

The real import logic lives inside the app at
`cago.setup.sample_data.import_sample_products` so it runs inside the
Frappe context. This script just shells out to `bench execute`.

Usage (run from your frappe-bench directory, or pass --bench):

    python scripts/import_products.py --site mysite.local
    python scripts/import_products.py --site mysite.local --csv /abs/path/products.csv
"""
import argparse
import subprocess
import sys

# Real catalog import = products + prices only (NO demo stock). Demo seeding lives in
# import_sample_products (used by create-site when LOAD_SAMPLE_DATA=1).
TARGET = "cago.setup.sample_data.import_catalog"


def main():
	parser = argparse.ArgumentParser(description="Import a real product catalog into a Cago site (no demo stock).")
	parser.add_argument("--site", required=True, help="Frappe site name")
	parser.add_argument("--csv", help="Absolute path to a products CSV (optional)")
	parser.add_argument("--bench", default=".", help="Path to frappe-bench dir (default: cwd)")
	args = parser.parse_args()

	# Pass the CSV path via env (CAGO_IMPORT_CSV) and call a NO-ARG function — `bench execute
	# --kwargs` is unreliable across bench versions (evals the path without importing the module).
	import os

	env = dict(os.environ)
	if args.csv:
		env["CAGO_IMPORT_CSV"] = args.csv
	cmd = ["bench", "--site", args.site, "execute", TARGET]
	print("Running:", " ".join(cmd), "(CAGO_IMPORT_CSV=%s)" % (args.csv or "<default sample>"))
	sys.exit(subprocess.call(cmd, cwd=args.bench, env=env))


if __name__ == "__main__":
	main()
