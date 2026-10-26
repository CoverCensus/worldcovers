"""Keys and queries for deciding whether two Markings are "the same".

One home for the rules that T47's duplicate report (Trello T47,
``report_duplicate_markings``) and T48's submission-time "similar Entries"
lookup (``MarkingViewSet.similar``) must share, so neither invents a second
notion of sameness. DECISIONS.md "Report Duplicate Markings, Never Merge Them"
records the rules; this module is their code.

Rows are ``.values()`` dicts carrying at least ``SCAN_FIELDS`` plus the two
``primary_region_subquery`` annotations ``state_code`` and ``state_abbrev``.

Imports only Django and ``common.models``: never ``views`` or
``contribution_apply``, both of which import from here.
"""
from __future__ import annotations

import re
from decimal import Decimal

from django.db.models import F, OuterRef, Subquery

from common.models import PostOfficeRegion, Region

SIZE_TOLERANCE_MM = Decimal("0.5")

# Every Marking column except code, catalog_txt, audit, review and cache
# columns. Mirrors the munger's "all emitted attributes agree" rule.
EXACT_FIELDS = (
    "post_office_id", "type", "inscription_txt", "desc", "is_manuscript",
    "shape_id", "lettering_id", "color_id", "is_irreg", "width", "height",
    "date_fmt", "impression", "rate_val",
)
# Built on EXACT_FIELDS on purpose: exact_key() reads every EXACT field from
# the scanned row, so the scan must fetch at least those. The last two names
# are not columns: the queryset must annotate state_abbrev and state_code with
# primary_region_subquery() before .values(*SCAN_FIELDS), or Django raises
# FieldError.
SCAN_FIELDS = EXACT_FIELDS + (
    "id", "code", "shape__name", "color__name", "post_office__name",
    "earliest_seen", "latest_seen", "state_abbrev", "state_code",
)


# --------------------------------------------------------------- queries

def primary_region_subquery(field):
    """A marking's primary-jurisdiction Region `field`, as a scalar subquery.

    Deliberately a correlated subquery and NOT a join. Ordering across the
    post_office_regions junction multiplies rows -- Django's own order_by()
    docs warn that a multi-valued field "could return more items than you were
    working on to begin with" -- and since the VPHC ingest gave every VA/WV
    town a county link alongside its state, that is exactly what happened:
    502 markings emitted twice and 502 different ones pushed off the end by
    LIMIT/OFFSET, while count() stayed correct because Django strips ordering
    when it counts (issue #103, LEFT_OFF.md B2).

    .distinct() does not fix it. Ordering by a related field puts that field in
    the SELECT list, so the Virginia row and the Accomack row of the same
    marking are not duplicates to DISTINCT -- measured live on woco.dev, where
    ?state=VA already had .distinct() and still returned 2,309 rows for 1,947
    markings. It is also the slow path: the issue #59 load test measured 723 of
    11,493 temp tables spilling to disk at 4,000 rows.

    The ordering mirrors PostOffice.region's tie-break exactly so the sort key
    and the displayed state can never disagree.

    Cost, measured (EXPLAIN + timings, 3,155 local markings / 1,569 county
    links): the subquery is `ref` on the unique post_office_region index plus
    an `eq_ref` PK lookup -- two bounded index lookups per candidate row, so
    O(1) per row, not a scan. A deep-offset page costs ~17.5 ms against
    ~15.0 ms for the old (wrong) junction sort. Paying ~2.5 ms for pages that
    are actually complete. The planned denormalized state_region_id column
    removes even that; this is its no-migration precursor.
    """
    return Subquery(
        PostOfficeRegion.objects
        .filter(post_office_id=OuterRef("post_office_id"))
        .exclude(region__region_tier__in=Region.SUBREGION_TIERS)
        .order_by(
            F("region__defunct_date").desc(nulls_first=True),
            F("region__established_date").desc(nulls_last=True),
        )
        .values(f"region__{field}")[:1]
    )


# ------------------------------------------------------------------ keys

def town_match_key(name: str) -> str:
    """Comparison key for a town name: blind to case, spacing and punctuation.

    "ACCOMACK C.H.", "Accomack C. H." and "ACCOMACK CH" are one town; iexact
    matching treated them as three. Letters and digits only, uppercased.
    """
    return re.sub(r"[^A-Z0-9]+", "", name.upper())


def inscription_key(text: str | None) -> str:
    """Case, spacing and punctuation blind; word boundaries kept."""
    return " ".join(re.sub(r"[^A-Z0-9]+", " ", (text or "").upper()).split())


def color_key(name: str | None) -> str | None:
    """Colour family: BLUE BLACK == BLACK-BLUE == blue black; GRAY == GREY."""
    if name is None:
        return None
    words = ("GREY" if w == "GRAY" else w
             for w in name.upper().replace("-", " ").split())
    return " ".join(sorted(words))


def related_key(row: dict) -> tuple:
    """Same town and inscription: the part of near_key that names the device.

    Everything NEAR adds (shape, colour family, size) describes how the device
    looks; this is what T48 calls RELATED when those differ.
    """
    return (
        row["state_code"],
        town_match_key(row["post_office__name"] or ""),
        row["type"],
        inscription_key(row["inscription_txt"]),
    )


def near_key(row: dict) -> tuple:
    return related_key(row) + (row["shape_id"], color_key(row["color__name"]))


def exact_key(row: dict) -> tuple:
    return tuple(row[field] for field in EXACT_FIELDS)


def sizes_compatible(a: dict, b: dict) -> bool:
    """Unknown on either side is not evidence of a difference."""
    for field in ("width", "height"):
        x, y = a[field], b[field]
        if x is not None and y is not None and abs(x - y) > SIZE_TOLERANCE_MM:
            return False
    return True
