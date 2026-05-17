#!/usr/bin/env bash
#
# Scan the working tree for known malware fingerprints. Exits non-zero on
# any match. Intended to run early in CI (before any install / build step)
# and as a pre-push hook locally.
#
# Signatures below match an obfuscator family observed in the repo. Add a
# new pattern any time a new variant is identified.
#
# Run locally:
#   bash tools/fingerprint.sh
#
# The exit codes match grep's convention so that this can be chained:
#   0 = no fingerprints found
#   1 = at least one fingerprint matched (CI should fail)
#   2 = scanner itself errored
set -euo pipefail

PATTERNS=(
    # Obfuscator activation flag written to global['!']
    "global\\[['\"]!['\"]\\]="
    # Identifier-table function name used by the obfuscator: _$_xxxx=(function...
    "_\\\$_[0-9a-f]{4,}=\\(function"
    # In-band separator trick (DEL char) used by the payload's string shuffler
    "String\\.fromCharCode\\(127\\)"
)

EXCLUDES=(
    --exclude-dir=node_modules
    --exclude-dir=.git
    --exclude-dir=dist
    --exclude-dir=coverage
    --exclude-dir=__pycache__
    --exclude-dir=.venv
    --exclude-dir=.uv
    --exclude-dir=venv
)

ROOT="${1:-.}"

found=0
for pat in "${PATTERNS[@]}"; do
    # grep returns 1 when no match; that is the normal case. Capture matches
    # explicitly so the script does not abort under `set -e`.
    if matches=$(grep -rnE "$pat" "${EXCLUDES[@]}" "$ROOT" 2>/dev/null); then
        echo "MALWARE FINGERPRINT MATCH for pattern: $pat"
        echo "$matches"
        echo ""
        found=1
    fi
done

if [ "$found" -ne 0 ]; then
    echo "FAIL: malware fingerprints detected. Do NOT install, build, or deploy." >&2
    exit 1
fi

echo "OK: no malware fingerprints detected in $ROOT"
