#!/usr/bin/env bash
# Import one ASCC bundle without clearing existing catalog data.
# Run as wocod: ./tools/refresh_data.sh tools/wip/out/v1_va

set -euo pipefail
cd "$(dirname "$0")/.."

BUNDLE_DIR="${1:-${WOCO_IMPORT_BUNDLE:-}}"
if [[ -z "$BUNDLE_DIR" || $# -gt 1 ]]; then
  echo "Usage: refresh_data.sh tools/wip/out/v1_state" >&2
  exit 2
fi

BUNDLE_DIR="${BUNDLE_DIR%/}"
if [[ "$BUNDLE_DIR" == "tools/wip/out" || ! -d "$BUNDLE_DIR" ]]; then
  echo "refresh_data.sh: pass an existing state bundle directory." >&2
  exit 2
fi

./woco ascc import "$BUNDLE_DIR"
