#!/usr/bin/env bash
# Run this on the server after "git pull" (or in CI). From project root: ./scripts/deploy.sh
# Installs deps, migrates, builds frontend. You then start/restart Django (gunicorn, systemd, etc.).
set -e
cd "$(dirname "$0")/.."

echo "[1/4] Installing Python dependencies..."
pip install -r requirements.txt

echo "[2/4] Running migrations..."
python manage.py migrate --noinput

echo "[3/4] Building frontend (creates frontend/dist/)..."
(cd frontend && npm ci && npm run build)

echo "[4/4] Collecting static files (Django)..."
python manage.py collectstatic --noinput 2>/dev/null || true

echo "Done. Start or restart your app (e.g. gunicorn, systemctl restart worldcovers)."
