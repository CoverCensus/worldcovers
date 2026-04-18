#!/usr/bin/env bash
# Run this on the server after "git pull" (or in CI). From project root: ./tools/deploy.sh
set -e
cd "$(dirname "$0")/.."

# Sync unit file if it has changed (skipped on macOS/dev where systemd is absent)
if command -v systemctl > /dev/null 2>&1; then
    if ! diff -q tools/worldcovers.service /etc/systemd/system/worldcovers.service > /dev/null 2>&1; then
        echo "Updating systemd unit file..."
        sudo install -m 644 tools/worldcovers.service /etc/systemd/system/worldcovers.service
        sudo systemctl daemon-reload
    fi
fi

echo "[1/4] Installing Python dependencies..."
pipenv install

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

if command -v systemctl > /dev/null 2>&1; then
    echo "Restarting worldcovers service..."
    sudo systemctl restart worldcovers
fi

echo "Done."
