#!/usr/bin/env bash
# Local launcher. Run from the project root (worldcovers/).
#
# Behavior is driven by Django's DEBUG setting (settings.py reads it from
# the environment / .env via python-decouple). No flags.
#
#   DEBUG=True  (default):  Vite dev server on :8080 + Django on :8000.
#                           HMR. Open http://localhost:8080
#   DEBUG=False:            Build frontend, serve via Django only.
#                           Open http://127.0.0.1:8000
#
# Ctrl+C kills both processes. Both share this terminal's stdout/stderr.

set -e
cd "$(dirname "$0")"

# uv handles the Python interpreter (from .python-version) and the venv.
# No python3.X hard-coding.

# Ask Django what DEBUG is, using the same settings module the server uses.
DEBUG=$(uv run python -c "
import os, sys
sys.path.insert(0, 'backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'woco.settings')
import django
django.setup()
from django.conf import settings
print('1' if settings.DEBUG else '0')
")

if [[ "$DEBUG" == "0" ]]; then
    echo "DEBUG=False detected. Building frontend (frontend/dist/)..."
    (cd frontend && npm run build)
    echo "Starting Django at http://127.0.0.1:8000/ ..."
    exec uv run python backend/manage.py runserver
fi

# DEBUG=True: run Vite and Django together, kill both on Ctrl+C.
# 'kill 0' signals every process in this script's process group, which
# catches Vite, Django, and anything they spawned.
trap 'echo; echo "Shutting down..."; kill 0' SIGINT SIGTERM EXIT

echo "DEBUG=True. Starting Vite dev server at http://localhost:8080/ (HMR)..."
(cd frontend && npm run dev) &

echo "Starting Django at http://127.0.0.1:8000/ (proxied by Vite)..."
uv run python backend/manage.py runserver &

# If either child dies on its own, the trap fires and tears down the rest.
# 'wait -n' needs bash 4+. macOS stock bash is 3.2; #!/usr/bin/env bash
# picks up Homebrew bash if installed. If you're on stock bash, swap this
# line for plain 'wait' (waits for all children -- trap still fires on Ctrl+C).
wait -n || true
