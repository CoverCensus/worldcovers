#!/usr/bin/env bash
# Rebuild staging database from scratch: drop DB, recreate, migrate, create admin, run imports.
# Run from repo root. Requires mysql.cnf in repo root and CSV files in backend/imports/.
# Usage: ./scripts/rebuild_staging_db.sh [--no-import]
set -e
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

DB_NAME="${DB_NAME:-woco}"
MYSQL_CNF="${REPO_ROOT}/mysql.cnf"
# Path to CSVs relative to backend/ (e.g. imports or /srv/woco/backend/imports on server)
IMPORT_DIR="${IMPORT_DIR:-imports}"

if [[ "${1:-}" == "--no-import" ]]; then
  SKIP_IMPORT=1
else
  SKIP_IMPORT=0
fi

echo "[1/5] Dropping and recreating database '${DB_NAME}'..."
if [[ ! -f "$MYSQL_CNF" ]]; then
  echo "Error: mysql.cnf not found at $MYSQL_CNF. Create it from mysql.cnf.example." >&2
  exit 1
fi
# Connect to system DB so we can DROP the app database
mysql --defaults-file="$MYSQL_CNF" --database=mysql -e "
  DROP DATABASE IF EXISTS \`${DB_NAME}\`;
  CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
"

echo "[2/5] Running migrations..."
(cd backend && python manage.py migrate --noinput)

echo "[3/5] Ensuring admin user (admin / admin; change password after first login)..."
(cd backend && python manage.py shell -c "
from django.contrib.auth import get_user_model;
User = get_user_model();
u, created = User.objects.get_or_create(username='admin', defaults={'is_superuser': True, 'is_staff': True});
u.set_password('admin');
u.save();
print('Admin user ready.' if not created else 'Admin user created.')
")

echo "[4/5] Creating Site for Django..."
(cd backend && python manage.py shell -c "
from django.contrib.sites.models import Site;
s, _ = Site.objects.get_or_create(pk=1, defaults={'domain': 'example.com', 'name': 'WorldCovers'});
s.domain = 'hellowoco.app';
s.name = 'WorldCovers';
s.save();
print('Site updated.')
")

echo "[5/5] Running full import (reference + legacy + ASCC)..."
if [[ $SKIP_IMPORT -eq 1 ]]; then
  echo "Skipped (--no-import). Run manually: cd backend && python manage.py import_all_legacy_csv --dir imports --user admin"
else
  if ! (cd backend && test -d "$IMPORT_DIR"); then
    echo "Warning: Import dir backend/$IMPORT_DIR not found. Run import manually: cd backend && python manage.py import_all_legacy_csv --dir imports --user admin" >&2
  else
    (cd backend && python manage.py import_all_legacy_csv --dir "$IMPORT_DIR" --user admin)
  fi
fi

echo "Done. Restart the app (e.g. sudo systemctl restart worldcovers)."
