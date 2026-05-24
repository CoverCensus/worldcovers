#!/usr/bin/env bash
# Wipe user-generated submission data (contributions, drafts, versions, recycle
# bins). Leaves the 14 catalog tables, auth Users, and editor Collection
# assignments untouched.
#
#   ./tools/wipe_user_data.sh              # wipe (prompts for confirmation)
#   ./tools/wipe_user_data.sh --dry-run    # report counts, change nothing
#   ./tools/wipe_user_data.sh --reload     # wipe (no prompt) THEN reload catalog
#
# --reload runs the catalog import (import_ascc_bundle --truncate) afterward so
# you end up with a fresh, catalog-only system in one step.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Run from repo root so 'uv run' finds pyproject.toml and .venv.
cd "$REPO_ROOT"

if [[ "${1:-}" == "--reload" ]]; then
  echo "[1/2] wipe_user_data --no-input"
  uv run python backend/manage.py wipe_user_data --no-input
  echo "[2/2] import_ascc_bundle --truncate"
  uv run python backend/manage.py import_ascc_bundle tools/wip/out --truncate
  echo "Done. Fresh catalog-only system."
else
  uv run python backend/manage.py wipe_user_data "$@"
fi
