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

TARGET = "cago.setup.sample_data.import_sample_products"


def main():
	parser = argparse.ArgumentParser(description="Import Cago sample products.")
	parser.add_argument("--site", required=True, help="Frappe site name")
	parser.add_argument("--csv", help="Absolute path to a products CSV (optional)")
	parser.add_argument("--bench", default=".", help="Path to frappe-bench dir (default: cwd)")
	args = parser.parse_args()

	cmd = ["bench", "--site", args.site, "execute", TARGET]
	if args.csv:
		cmd += ["--kwargs", "{'csv_path': '%s'}" % args.csv]

	print("Running:", " ".join(cmd))
	sys.exit(subprocess.call(cmd, cwd=args.bench))


if __name__ == "__main__":
	main()
