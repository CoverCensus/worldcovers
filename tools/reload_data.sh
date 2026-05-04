#!/usr/bin/env bash
# Run the catalog data + image imports on staging. Invoke as the wocod user:
#   sudo -u wocod /srv/woco/tools/reload_data.sh
# Usually triggered remotely by tools/push_data.sh --import.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Must run from repo root so pipenv finds the [scripts] Pipfile + shared venv
# (there's also a backend/Pipfile without [scripts] — don't let pipenv grab it).
cd "$REPO_ROOT"

echo "[1/1] import_ascc_bundle --truncate"
pipenv run manage import_ascc_bundle tools/wip/out --truncate

#echo "[2/2] import_catalog_images"
#pipenv run manage import_catalog_images

echo "Done."
