#!/usr/bin/env bash
# Daily backup helper for an Cago site (database + uploaded files/images).
# Run from your frappe-bench directory.
#
#   ./scripts/backup.sh mysite.local
#
# Backups are written to sites/<site>/private/backups/. Copy them offsite per
# docs/14_OPERATIONS_AND_TRAINING.md (daily DB+files, weekly offsite, monthly restore test).
set -euo pipefail

SITE="${1:?Usage: backup.sh <site>}"

echo "Backing up ${SITE} (with files)..."
bench --site "${SITE}" backup --with-files
echo "Done. See sites/${SITE}/private/backups/"
