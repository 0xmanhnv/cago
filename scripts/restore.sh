#!/usr/bin/env bash
# Restore an AgriMate site from a database backup. Run from your frappe-bench dir.
#
#   ./scripts/restore.sh mysite.local /path/to/database.sql.gz [/path/to/files.tar] [/path/to/private-files.tar]
#
# WARNING: this overwrites the target site's database. Take a fresh backup first
# and confirm you are pointing at the correct site.
set -euo pipefail

SITE="${1:?Usage: restore.sh <site> <db.sql.gz> [public-files.tar] [private-files.tar]}"
DB="${2:?Path to database .sql.gz is required}"
PUB_FILES="${3:-}"
PRIV_FILES="${4:-}"

CMD=(bench --site "${SITE}" restore "${DB}")
[ -n "${PUB_FILES}" ] && CMD+=(--with-public-files "${PUB_FILES}")
[ -n "${PRIV_FILES}" ] && CMD+=(--with-private-files "${PRIV_FILES}")

echo "Restoring ${SITE} from ${DB} ..."
"${CMD[@]}"
echo "Done. Run: bench --site ${SITE} migrate"
