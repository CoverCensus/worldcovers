import re
import pandas as pd


def extract_town_root(inscription):
    """Town root = everything before the first '/', or whole string if no '/'."""
    if inscription is None or (isinstance(inscription, float) and pd.isna(inscription)):
        return ''
    if '/' in inscription:
        return inscription.split('/')[0]
    return inscription

def resolve_relationships(listings_df):
    """Walk listings in catalog order, resolve inheritance.

    Modifies listings_df in place, adding:
      parent_idx, prev_sibling_idx, resolved_inscription, resolved_town,
      s7_warnings

    parent_idx points at the most recent independent (parent) entry.
    prev_sibling_idx points at the carry-forward source for attribute
    inheritance: the immediately preceding sibling under the same
    parent, or (for the first child) the parent itself. None for
    independent and orphan-rel entries.
    """
    n = len(listings_df)
    parent_idx = [None] * n
    prev_sibling_idx = [None] * n
    resolved_inscription = [None] * n
    resolved_town = [None] * n
    s7_warnings = [[] for _ in range(n)]

    # Track the most recent independent entry by iteration position
    current_parent_pos = None
    # Track most recent child position per parent, for sibling-walk inheritance
    last_child_pos_by_parent = {}

    for pos in range(n):
        row = listings_df.iloc[pos]
        warnings = []

        if pd.isna(row['head_rel_type']) or row['head_rel_type'] is None:
            # --- Independent entry ---
            inscription = row['head_name_body']
            if inscription is None or (isinstance(inscription, float) and pd.isna(inscription)):
                warnings.append('independent_no_name')
                inscription = ''

            town = extract_town_root(inscription)

            parent_idx[pos] = None
            prev_sibling_idx[pos] = None
            resolved_inscription[pos] = inscription
            resolved_town[pos] = town
            current_parent_pos = pos
            last_child_pos_by_parent[pos] = None

        else:
            # --- Relationship entry ---
            if current_parent_pos is None:
                warnings.append('orphan_rel')
                # Best-effort: use own name body if any
                _nb = row['head_name_body']
                fallback = '' if (_nb is None or (isinstance(_nb, float) and pd.isna(_nb))) else (_nb or '')
                parent_idx[pos] = None
                prev_sibling_idx[pos] = None
                resolved_inscription[pos] = fallback
                resolved_town[pos] = extract_town_root(fallback) if fallback else ''
            else:
                parent_idx[pos] = listings_df.index[current_parent_pos]
                prev_child_pos = last_child_pos_by_parent.get(current_parent_pos)
                if prev_child_pos is None:
                    # First child: carry-forward source is the parent.
                    prev_sibling_idx[pos] = listings_df.index[current_parent_pos]
                else:
                    prev_sibling_idx[pos] = listings_df.index[prev_child_pos]
                last_child_pos_by_parent[current_parent_pos] = pos
                p_inscription = resolved_inscription[current_parent_pos]
                p_town = resolved_town[current_parent_pos]

                rel = row['head_rel_type']
                name_body = row['head_name_body']

                if rel == 'Same' and pd.notna(name_body):
                    # Different device, same town: reconstruct inscription.
                    # When name_body does not start with '/' the source had
                    # a literal space between 'Same' and the name body
                    # (e.g. 'Same C.H./Va.') that parse_head stripped; put
                    # one space back to avoid 'ACCOMACKC.H./VA.'.
                    if not name_body.startswith('/'):
                        warnings.append('same_name_body_no_slash')
                        sep = ' '
                    else:
                        sep = ''
                    resolved_inscription[pos] = p_town + sep + name_body
                    resolved_town[pos] = p_town
                else:
                    # Same device (Same w/o name, (L), (E)): inherit
                    resolved_inscription[pos] = p_inscription
                    resolved_town[pos] = p_town

                # Cross-section check
                parent_row = listings_df.iloc[current_parent_pos]
                if row.get('Default Shape') != parent_row.get('Default Shape'):
                    warnings.append('cross_section_parent')

        s7_warnings[pos] = warnings

    listings_df['parent_idx'] = parent_idx
    listings_df['prev_sibling_idx'] = prev_sibling_idx
    listings_df['resolved_inscription'] = resolved_inscription
    listings_df['resolved_town'] = resolved_town
    listings_df['s7_warnings'] = s7_warnings
    return listings_df

def roll_up_catalog_text(listings_df):
    """Populate listings_df['rolled_catalog_text'].

    For independent listings (parent_idx is None): just own clean_text.
    For child listings (parent_idx set): parent clean_text + every prior
    sibling's clean_text (same parent, earlier catalog position) + own
    clean_text, newline-joined in catalog order.

    Must run after resolve_relationships(). Mutates listings_df in place
    and returns it.
    """
    def _txt(v):
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return ''
        return str(v)

    n = len(listings_df)
    rolled = [None] * n
    prior_siblings = {}  # parent_pos -> list of own clean_text seen so far

    for pos in range(n):
        row = listings_df.iloc[pos]
        own = _txt(row.get('clean_text'))
        pidx = row.get('parent_idx')
        if pidx is None or (isinstance(pidx, float) and pd.isna(pidx)):
            rolled[pos] = own
            prior_siblings[pos] = []
        else:
            parent_text = _txt(listings_df.loc[pidx, 'clean_text'])
            parent_pos = listings_df.index.get_loc(pidx)
            sibs = prior_siblings.setdefault(parent_pos, [])
            rolled[pos] = '\n'.join([parent_text] + list(sibs) + [own])
            sibs.append(own)

    listings_df['rolled_catalog_text'] = rolled
    return listings_df

def _norm_for_alias(s):
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return None
    return re.sub(r"[.,\s]+$", "", str(s).strip()).upper() or None

def _is_abbrev_of(short, long):
    """Conservative: short shares first letter with long, is at least 3
    characters, at most half long's length, and short's letters appear
    as a subsequence in long. Catches FREDG -> FREDERICKSBURG, CULPE ->
    CULPEPER, CHS -> CHARLES; rejects CHARLE -> CHARLESTON (length
    ratio too high)."""
    if not short or not long or short[0] != long[0]:
        return False
    if len(short) < 3 or len(short) * 2 > len(long):
        return False
    j = 0
    for ch in long:
        if j < len(short) and ch == short[j]:
            j += 1
    return j == len(short)

OR_ALIAS_RE = re.compile(r"^\s*(.+?)\s+OR\s+(.+?)\s*$", re.IGNORECASE)

TOWN_HEADING_RE = re.compile(r"^[A-Za-z][A-Za-z .\-]{2,40}$")
