#!/usr/bin/env bash
# Run this on the server after "git pull" (or in CI). From project root: ./scripts/deploy.sh
# Installs deps, migrates, builds frontend. You then start/restart Django (gunicorn, systemd, etc.).
set -e
cd "$(dirname "$0")/.."

echo "[1/4] Installing Python dependencies..."
pip install -r backend/requirements.txt

echo "[2/4] Running migrations..."
python backend/manage.py migrate --noinput

echo "[3/4] Building frontend (creates frontend/dist/)..."
# Load frontend/.env if present (not in git; create on server or set env vars in host dashboard).
if [ -f frontend/.env ]; then set -a; . frontend/.env; set +a; fi
# Clear dist so Vite can recreate it (avoids EACCES if dist was left by another user)
rm -rf frontend/dist
(cd frontend && npm ci && npm run build)

echo "[4/4] Collecting static files (Django)..."
python backend/manage.py collectstatic --noinput 2>/dev/null || true

echo "Done. Start or restart your app (e.g. gunicorn, systemctl restart worldcovers)."
