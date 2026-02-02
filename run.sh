#!/usr/bin/env bash
# Build frontend then run Django. Run this from the project root (worldcovers/).
set -e
cd "$(dirname "$0")"

echo "Building frontend (frontend/dist/)..."
(cd frontend && npm run build)

echo "Starting Django at http://127.0.0.1:8000/ ..."
exec python3.11 manage.py runserver
