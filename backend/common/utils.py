"""
Helpers for common app (e.g. canonical list of locations from CSV).
"""
import csv
import os
from django.conf import settings

# Paths to try for tblStates.csv (relative to backend or repo root)
DEFAULT_IMPORT_DIRS = ('imports',)


def get_canonical_location_reference_codes():
    """
    Return a frozenset of reference codes (e.g. US-VA, US-NY) from tblStates.csv,
    deduplicated so the CSV is the single source of truth. Returns None if the
    file is not found (caller can show all locations).
    """
    base_dir = getattr(settings, 'BASE_DIR', None)
    repo_root = getattr(settings, 'REPO_ROOT', None)
    candidates = []
    if base_dir:
        candidates.append(os.path.join(str(base_dir), 'imports', 'tblStates.csv'))
    if repo_root:
        candidates.append(os.path.join(str(repo_root), 'imports', 'tblStates.csv'))
    path = None
    for p in candidates:
        if os.path.isfile(p):
            path = p
            break
    if not path:
        return None
    codes = set()
    with open(path, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            abv = (row.get('txtStateAbv') or '').strip().upper()
            if not abv:
                continue
            codes.add(f'US-{abv}')
    return frozenset(codes)
