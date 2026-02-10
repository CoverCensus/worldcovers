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
# Load frontend/.env if present (not in git; create on server or set env vars in host dashboard).
if [ -f frontend/.env ]; then set -a; . frontend/.env; set +a; fi
if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_PUBLISHABLE_KEY" ]; then
  echo "WARNING: VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY not set. Frontend will show a config error. Set them in frontend/.env or as environment variables."
fi
(cd frontend && npm ci && npm run build)

echo "[4/4] Collecting static files (Django)..."
python manage.py collectstatic --noinput 2>/dev/null || true

echo "Done. Start or restart your app (e.g. gunicorn, systemctl restart worldcovers)."
