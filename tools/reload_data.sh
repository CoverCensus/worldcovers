#!/usr/bin/env bash
# Run the catalog data + image imports on staging. Invoke as the wocod user:
#   sudo -u wocod /srv/woco/tools/reload_data.sh
# Usually triggered remotely by tools/push_data.sh --import.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT/backend"

echo "[1/2] import_v2_data --truncate (from $REPO_ROOT/tools/wip/out)"
pipenv run manage import_v2_data --truncate --dir "$REPO_ROOT/tools/wip/out"

echo "[2/2] import_catalog_images (from MEDIA_ROOT)"
pipenv run manage import_catalog_images

echo "Done."
