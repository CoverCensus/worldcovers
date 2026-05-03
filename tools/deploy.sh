#!/usr/bin/env bash
# Run this on the server after "git pull" (or in CI). From project root: ./tools/deploy.sh
# Note: privileged operations (unit file install, daemon-reload, service restart) are handled
# by the caller; either the CI workflow or a sysadmin with sudo, not by this script.
set -e
cd "$(dirname "$0")/.."

echo "[1/4] Installing Python dependencies..."
# Pipfile only declares dev/notebook tooling. Runtime deps (Django, DRF,
# drf-spectacular, ...) live in backend/requirements.txt so CI and the
# server install from a single canonical list. We sync Pipfile first, then
# install the runtime requirements into the same pipenv venv.
# --no-deps is intentional: requirements.txt is already a fully-resolved
# pin set, so we skip pip's transitive resolution to avoid version drift.
pipenv install
pipenv run pip install --no-deps -r backend/requirements.txt

echo "[2/4] Running migrations..."
pipenv run manage migrate --noinput

echo "[3/4] Building frontend (creates frontend/dist/)..."
# Load frontend/.env if present (not in git; create on server or set env vars in host dashboard).
if [ -f frontend/.env ]; then set -a; . frontend/.env; set +a; fi
# Clear dist so Vite can recreate it (avoids EACCES if dist was left by another user)
rm -rf frontend/dist
(cd frontend && npm ci && npm run build)

echo "[4/4] Collecting static files (Django)..."
pipenv run manage collectstatic --noinput

echo "Done."
