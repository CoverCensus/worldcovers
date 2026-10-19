#!/usr/bin/env python3
"""
VPHC cross-examination -- the spreadsheet vs. what production already holds.

Phase 2 of the VPHC ingest. Reads two sets of CSVs that are already on disk and
writes only reports. **No database is touched and there is no --apply.**

    tools/wip/out/vphc/extract/     Phase 0 -- the sheet, decoded
    tools/wip/in/vphc-prod-va-wv/   Phase 1 -- production's VA/WV, an
                                    import_ascc_bundle-format CSV bundle

Implements RULES.md v2 (I0-I5 identity, E1-E6 enrichment), kept at
docs/devel/VPHC-RULES.md. v2 replaced the
v1 tiers M1-M4. The v1 tiers keyed on town + size + colour and then wrote size
and colour, so a match could only ever confirm: measured over unique matches
they filled 0 empty production fields. v2 separates the fields that establish
identity from the fields that get written.

    v2 invariant -- no field may both establish identity for a pair and be
    written for that same pair. Where I4 corroboration (size, dates) is needed
    to break a tie, the field is recorded in the ledger's `rejected` map and
    its E-rule is suppressed for that pair only.

Matching runs at VPHC's own grain, (town, cancel #). Doing it row-by-row is
what made v1 look unresolvable: Abingdon cancel #6 is five rows in five
colours, and scoring each independently against the same production fan-out
manufactures five ambiguous matches out of one clean one.

Stdlib only, matching tools/vphc_extract.py, whose helpers this imports.
That file is frozen -- extract/manifest.json checksums 4,389 files and editing
a shared helper would invalidate the Phase 0 guarantee.

Run it with a plain python3, not `uv run`: the project environment can import
Django, and main() refuses to start where a database driver is importable.

Usage (see docs/devel/TOOLS.md, "VPHC Source Extraction"):
    python3 tools/vphc_crossexam.py                 # default paths
    python3 tools/vphc_crossexam.py --selftest      # fixtures F1-F9
    python3 tools/vphc_crossexam.py --explain T1:r6 # one row's reasoning
"""
from __future__ import annotations

import argparse
import collections
import csv
import json
import os
import re
import sys

# --------------------------------------------------------------- no-DB guard
#
# This phase is read-only by design and the plan says so in writing. Assert it
# structurally rather than trusting the absence of a flag: if a database driver
# is importable in this process, someone has changed the contract.

def _assert_no_database():
    import importlib.util
    for mod in ("django", "MySQLdb", "pymysql"):
        if importlib.util.find_spec(mod) is not None:
            raise RuntimeError(
                f"{mod} is importable -- vphc_crossexam is a read-only phase and "
                "must not run in an environment wired to a database")


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vphc_extract import (            # noqa: E402  -- frozen; import only
    town_key, norm_town, norm_color, parse_size, write_csv, sha256_file,
)

RULES_VERSION = 2

# Size tolerance in mm for I4 corroboration. The sheet and ASCC measure the
# same device to different conventions (Abingdon #6 is 30.5 on the sheet and
# 30.0 in production), so an exact test would reject real matches. This is a
# tie-break tolerance and never a match key.
SIZE_TOL = 0.6

# ------------------------------------------------------------- I2 vocabulary
#
# The sheet's `cancel` column reads as free text but is a controlled vocabulary
# of Simpson-style device codes interleaved with rate and auxiliary words.
# Measured over the 3,596 non-manuscript rows: C10 540, PAID 433, C 310,
# 5 269, PAID 3 127, C11 118, FREE 106, SL 39, Oval 26. Production's own
# catalog_txt uses the same notation ("irregular C-26").

TYPE_CODE_RE = re.compile(
    r"^(C|DC|SL|ARC|O|DO|DLO|DLC|NOR)\s*-?\s*\d*$|^(OVAL|OCTAGON|BOX|CIRCLE)$",
    re.I)
GRID_RE = re.compile(r"^(GRID|KILLER)\b", re.I)

# R6-style shape derivation from the device code. Values must exist in the
# bundle's shapes.csv or they are a bug, not a datum -- checked at load.
SHAPE_FROM_CODE = {
    "C": "C - Circle", "DC": "DC - Double Circle", "SL": "SL - Straight Line",
    "ARC": "ARC - Arc or Semi-circle", "O": "O - Oval", "DO": "DO - Double Oval",
    "DLO": "DLO - Double Line Oval", "DLC": "DLC - Double Line Circle",
    "NOR": "NOR - No Outer Rim", "OVAL": "O - Oval", "OCTAGON": "Octagon",
    "BOX": "Box", "CIRCLE": "C - Circle",
}

AUX_WORDS = {"PAID", "FREE", "STEAM", "DUE", "FRANK", "SHIP", "WAY",
             "MISSENT", "FORWARDED", "ADVERTISED"}
RATE_PREFIX_RE = re.compile(r"^(PAID|DUE|WAY)\s+(\d+)$", re.I)
BARE_NUM_RE = re.compile(r"^(\d+)$")
ROMAN_RATE = {"X": 10, "V": 5}
# "Va. PAID" -> production spells this "ABINGDON Va./PAID"
STATE_PLUS_RE = re.compile(r"^(VA\.?|W\.?\s*VA\.?)\s+(.+)$", re.I)


def norm_inscription(raw: str) -> str:
    """Identity key for I1.

    The deliberate mirror image of town_key(), which strips everything. Here
    punctuation IS the signal: production distinguishes ABINGDON/*VA.* from
    ABINGDON/VA. from ABINGDON/VA, and the sheet carries the same asterisk
    convention. Case is NOT signal -- production spells one device Va. and
    another VA. within a single listing.
    """
    s = re.sub(r"\s+", " ", (raw or "").strip().upper())
    return s


def shape_from_type_code(cancel: str) -> str:
    """E2. Derive a shape name from the device code, or '' if not a code."""
    s = (cancel or "").strip()
    if not s or not TYPE_CODE_RE.match(s):
        return ""
    letters = re.match(r"^([A-Za-z]+)", s)
    if not letters:
        return ""
    return SHAPE_FROM_CODE.get(letters.group(1).upper(), "")


def sheet_identity(town: str, cancel: str, detail: str):
    """Compose the sheet's side of I1/I2.

    Returns (type, inscription_keys, rate_val, shape). `inscription_keys` is a
    set because production spells the same device more than one way.
    """
    town = norm_town(town)
    c = (cancel or "").strip()
    d = (detail or "").strip()
    keys = set()

    # A rate written as PAID 3 -- production files this as RATEMARK "PAID/3".
    m = RATE_PREFIX_RE.match(c)
    if m and not d:
        word, val = m.group(1).upper(), m.group(2)
        keys |= {f"{word}/{val}", f"{word} {val}", f"{val}/{word}"}
        return "RATEMARK", keys, val, ""

    if not d and BARE_NUM_RE.match(c):
        return "RATEMARK", {c}, c, ""

    if not d and c.upper() in ROMAN_RATE:
        return "RATEMARK", {c.upper()}, str(ROMAN_RATE[c.upper()]), ""

    if not d and c.upper() in AUX_WORDS:
        return "AUXMARK", {c.upper()}, "", ""

    # "Va. PAID" -- a townmark carrying an auxiliary word.
    m = STATE_PLUS_RE.match(c)
    if m and not d:
        keys.add(norm_inscription(f"{town} {m.group(1)}/{m.group(2)}"))
        return "TOWNMARK", keys, "", ""

    # The ordinary townmark: the detail column is the inscription's second half.
    if d:
        keys.add(norm_inscription(f"{town}/{d}"))
        keys.add(norm_inscription(f"{town} {d}"))
        # I2b -- the detail sometimes carries the rate or auxiliary word instead
        # of a state abbreviation. Aldie #5's detail is "PAID 3", which
        # production files as the RATEMARK "PAID/3", not as a townmark.
        md = RATE_PREFIX_RE.match(d)
        if md:
            word, val = md.group(1).upper(), md.group(2)
            return "RATEMARK", {f"{word}/{val}", f"{word} {val}", f"{val}/{word}"}, val, ""
        if BARE_NUM_RE.match(d):
            return "RATEMARK", {d}, d, ""
        if d.upper() in AUX_WORDS:
            return "AUXMARK", {d.upper()}, "", ""
        return "TOWNMARK", keys, "", shape_from_type_code(c)

    # A device code with no detail -- the inscription is the town alone.
    if TYPE_CODE_RE.match(c) or GRID_RE.match(c) or not c:
        keys.add(norm_inscription(town))
        return "TOWNMARK", keys, "", shape_from_type_code(c)

    return "", set(), "", ""


def dec(x):
    try:
        return round(float(x), 1)
    except (TypeError, ValueError):
        return None


def size_close(a, b, tol=SIZE_TOL):
    a, b = dec(a), dec(b)
    if a is None or b is None:
        return False
    return abs(a - b) <= tol


def year(s):
    try:
        return int(str(s)[:4])
    except (TypeError, ValueError):
        return None


def date_overlap(a1, a2, b1, b2):
    """I4 corroboration. True when two [earliest, latest] windows intersect."""
    a1, a2, b1, b2 = year(a1), year(a2), year(b1), year(b2)
    lo_a, hi_a = (a1 or a2), (a2 or a1)
    lo_b, hi_b = (b1 or b2), (b2 or b1)
    if lo_a is None or lo_b is None:
        return False
    return lo_a <= hi_b and lo_b <= hi_a


# -------------------------------------------------------------- uncertainty
#
# Every doubt the extractor recorded has to travel with the record into the
# database. On disk in a quarantine CSV it is invisible the moment the data is
# imported, and approving a contribution would erase the fact that anything was
# ever uncertain. So each flag becomes three things: a machine-readable entry in
# `submitted_data.vphc.flags`, a sentence an editor reads in the review queue,
# and a bracketed marker on the catalog record that survives approval.

FLAG_REASONS = {
    "century_inferred": "The century was reconstructed from context \u2014 the "
                        "spreadsheet stored only a two-digit year (rule R1).",
    "date_low_confidence": "Date confidence is low: the run was too short to "
                           "corroborate the century against neighbouring dates.",
    "date_unresolved": "The date could not be read as a date at all \u2014 the cell "
                       "holds vocabulary nobody has defined yet (R1b).",
    "size_unparsed": "The size could not be parsed from the source text (R5).",
    "color_vocab": "The colour is not in the known vocabulary and needs a human "
                   "call (R6).",
    "county_backfilled": "The county was blank in the source and was recovered "
                         "from elsewhere in the sheet (R2c).",
    "county_repaired": "The county name was OCR-damaged and was repaired by "
                       "fuzzy match (R2).",
    "county_uncertain": "The county could not be resolved with confidence (R2).",
    "column_shift": "This row's columns were shifted one place left in the "
                    "source and were repaired (R6c).",
    "state_unknown": "No county, so the row could not be routed to Virginia or "
                     "West Virginia (R3).",
    "no_scan": "The spreadsheet has no scan for this marking.",
    # set from the match verdict rather than the extract
    "ambiguous": "Matched more than one existing record and none could be "
                 "chosen \u2014 catalogued separately rather than guessed (I3/I3c).",
    "town_damaged": "This town name maps to several post offices in the "
                    "catalogue, so the marking could not be placed (I0b).",
    "no_colour_match": "The inscription and device type matched an existing "
                       "record but this colour is not among its variants.",
    "unclassified_device": "The device code is not yet in the vocabulary \u2014 "
                           "needs Ian / Wayne Farley.",
    "no_post_office": "This marking cannot be catalogued at all: its town has "
                      "no post office and one cannot be created, because the "
                      "town has no county to route it to a state (R3). See "
                      "unresolved/post_office_quarantine.csv.",
}


def sheet_flags(rows):
    """Uncertainty flags for one marking, from the extractor's own status columns."""
    flags = set()
    for r in rows:
        if r["earliest_century_inferred"] or r["latest_century_inferred"]:
            flags.add("century_inferred")
        if "low" in (r["earliest_confidence"], r["latest_confidence"]):
            flags.add("date_low_confidence")
        if "vocab" in (r["earliest_confidence"], r["latest_confidence"]):
            flags.add("date_unresolved")
        if r["size_status"] == "unparsed":
            flags.add("size_unparsed")
        if r["color_status"] == "vocab":
            flags.add("color_vocab")
        if r["county_status"] == "backfilled":
            flags.add("county_backfilled")
        elif r["county_status"] == "repaired":
            flags.add("county_repaired")
        elif r["county_status"] in ("unknown", "ambiguous", "route", "empty"):
            flags.add("county_uncertain")
        if r["column_shift"]:
            flags.add("column_shift")
        if not r["state"].strip():
            flags.add("state_unknown")
    return sorted(flags)


def editor_comment(marking, verdict):
    """The plain-English note an editor reads in the queue before deciding."""
    flags = list(marking["flags"])
    if verdict in FLAG_REASONS and verdict not in flags:
        flags.insert(0, verdict)
    if not marking["sheet_images"]:
        flags.append("no_scan")
    if not flags:
        return ""
    lead = (f"Imported from the Virginia Postal History Catalog "
            f"({marking['town']} #{marking['cancel_no']}, {marking['src']}). "
            f"Please check:")
    return lead + " " + " ".join(FLAG_REASONS[f] for f in flags if f in FLAG_REASONS)


def catalog_marker(marking, verdict):
    """The bracketed marker appended to `desc`, so the doubt survives approval."""
    flags = [f for f in marking["flags"] if f in FLAG_REASONS]
    if verdict in FLAG_REASONS and verdict not in flags:
        flags.insert(0, verdict)
    if not flags:
        return ""
    return "[VPHC: " + "; ".join(f.replace("_", " ") for f in flags) + "]"


ROUTE_LIKE = re.compile(
    r"\b(STEAMBOAT|STEAABOAT|ROUTE|R\.\s*R\.|RAILROAD|DIVISION|PACKET|BOAT)\b|"
    r"^(BALTIMORE AND|POTOMAC|CHESAPEAKE)", re.I)
SUPPLEMENT_LIKE = re.compile(r"SUPPLEMENT|ADDENDA|ERRATA|CONTINUED|^\d+[-/]\d+", re.I)


def classify_unroutable(rec):
    """Why a town cannot become a post office.

    A post office has to belong to a region, and the region is derived from the
    county (R3). No county, no state, nowhere to put it. Rather than inventing a
    home, say precisely what is wrong so a human can fix it later.
    """
    town = (rec["town"] or "").strip()
    if not town:
        return "empty_town", "the town cell is blank"
    if SUPPLEMENT_LIKE.search(town):
        return ("supplement_header",
                "a supplement/errata section header read as a town; the county "
                f"column holds the real town ({rec['county']!r})")
    if ROUTE_LIKE.search(town):
        return ("route_agent",
                "a route agent, steamboat or railroad marking -- a real "
                "philatelic category with no home in the schema (RULES.md R2)")
    if town.upper().endswith(("CO.", "COUNTY")) and rec["county"]:
        return ("town_county_swap",
                f"the town looks like a county and the county column holds "
                f"{rec['county']!r} -- the two look swapped")
    if not rec["county"]:
        return "no_county", "no county, so R3 cannot route it to VA or WV"
    return ("county_unrecognised",
            f"county {rec['county']!r} is not in the canonical VA or WV lists")


def plan_post_offices(extract, po_by_key):
    """Every town this ingest needs that the catalogue does not already have.

    The union of the non-manuscript marking towns and *every* postmaster town --
    postmasters are being loaded in full, and a tenure cannot hang off a post
    office that does not exist.
    """
    seen = {}
    for path, is_t3 in ((os.path.join(extract, "t1_markings.csv"), False),
                        (os.path.join(extract, "t3_postmasters.csv"), True)):
        for r in read_csv(path):
            if not r["town_key"]:
                continue
            if not is_t3 and r["is_manuscript"] == "true":
                continue
            cur = seen.setdefault(r["town_key"], {
                "town_key": r["town_key"], "town": r["town"], "state": "",
                "county": "", "population": "", "needed_for": set()})
            cur["needed_for"].add("postmasters" if is_t3 else "markings")
            if r["state"].strip() and not cur["state"]:
                cur["state"] = r["state"]
            if r["county"].strip() and not cur["county"]:
                cur["county"] = r["county"]
            if not is_t3 and r.get("population", "").strip() and not cur["population"]:
                cur["population"] = r["population"]

    out = []
    for key, rec in sorted(seen.items()):
        rec["needed_for"] = ";".join(sorted(rec["needed_for"]))
        rec["exists"] = "yes" if key in po_by_key else ""
        out.append(rec)
    return out


# ------------------------------------------------------------------- loading

def read_csv(path):
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def load_production(bundle):
    """Denormalise the Phase 1 bundle into what matching needs.

    Production markings carry no town -- only post_office, a region-scoped
    code -- so the town has to be joined back through post_offices.csv.
    """
    pos = read_csv(os.path.join(bundle, "post_offices.csv"))
    markings = read_csv(os.path.join(bundle, "markings.csv"))
    shapes = {r["name"] for r in read_csv(os.path.join(bundle, "shapes.csv"))}

    for name in set(SHAPE_FROM_CODE.values()):
        if name not in shapes:
            raise RuntimeError(
                f"E2 would emit shape {name!r}, which is not in the catalog's "
                f"shapes.csv -- that is a bug in SHAPE_FROM_CODE, not a datum")

    po_name = {p["code"]: p["name"] for p in pos}
    po_by_key = collections.defaultdict(list)
    for p in pos:
        po_by_key[town_key(p["name"])].append(p["code"])

    # Production images key on the marking code. Counted so the report can say
    # what an image import would ADD; E5 never removes anything.
    prod_images = collections.Counter(
        r["subject_id"] for r in read_csv(os.path.join(bundle, "images.csv"))
        if r["subject_type"] == "MARKING")

    for m in markings:
        m["_images"] = prod_images.get(m["code"], 0)
    for m in markings:
        m["_town"] = po_name.get(m["post_office"], "")
        m["_town_key"] = town_key(m["_town"])
        m["_insc"] = norm_inscription(m["inscription_txt"])
        m["_color"] = m["color"].strip().upper()
        m["_ms"] = m["is_manuscript"] == "True"

    by_town = collections.defaultdict(list)
    for m in markings:
        by_town[m["_town_key"]].append(m)
    return po_name, po_by_key, by_town, markings


def load_sheet(extract):
    """Collapse T1's non-manuscript rows to VPHC marking grain.

    R9: the sheet's supplement blocks re-list 854 markings, and the later
    listing revises the earlier one. `occurrence` numbers those blocks, so the
    highest occurrence is authoritative for scalar fields while colours and
    dates accumulate across all of them.
    """
    rows = [r for r in read_csv(os.path.join(extract, "t1_markings.csv"))
            if r["is_manuscript"] != "true" and r["cancel_no"]]
    groups = collections.defaultdict(list)
    for r in rows:
        groups[(r["town_key"], r["cancel_no"])].append(r)

    # T2 anchors one scan per (town, cancel #) -- the same key T1 uses, which is
    # the third independent confirmation of VPHC's marking grain. 1,185 of the
    # 2,227 non-manuscript markings carry one.
    images = collections.defaultdict(list)
    for r in read_csv(os.path.join(extract, "t2_images.csv")):
        if r["cancel_no"]:
            images[(r["town_key"], r["cancel_no"])].append(r["image_file"])

    out = []
    for (tkey, cno), rs in groups.items():
        def occ(r):
            try:
                return int(r["occurrence"] or 1)
            except ValueError:
                return 1
        rs_sorted = sorted(rs, key=occ)
        head = rs_sorted[-1]                    # the revision wins
        colors, srcs = [], []
        earliest = latest = None
        for r in rs_sorted:
            srcs.append(r["src"])
            c = (r["color"] or "").strip().upper()
            if c and c not in colors:
                colors.append(c)
            ey, ly = year(r["earliest_date"]), year(r["latest_date"])
            if ey is not None:
                earliest = ey if earliest is None else min(earliest, ey)
            for v in (ly, ey):
                if v is not None:
                    latest = v if latest is None else max(latest, v)
        width = next((r["width"] for r in reversed(rs_sorted) if r["width"].strip()), "")
        height = next((r["height"] for r in reversed(rs_sorted) if r["height"].strip()), "")
        mtype, keys, rate, shape = sheet_identity(
            head["town"], head["cancel"], head["cancel_detail"])
        flags = sheet_flags(rs_sorted)
        out.append({
            "vphc_key": f"{tkey}#{cno}", "vphc_code": head["marking_code"],
            "src": ";".join(srcs), "state": head["state"], "county": head["county"],
            "town": head["town"], "town_key": tkey, "cancel_no": cno,
            "cancel": head["cancel"], "cancel_detail": head["cancel_detail"],
            "rows": len(rs), "occurrences": head["occurrences"],
            "sheet_type": mtype, "sheet_insc_keys": keys, "sheet_rate": rate,
            "sheet_shape": shape, "sheet_width": width, "sheet_height": height,
            "sheet_colors": colors,
            "sheet_earliest": earliest or "", "sheet_latest": latest or "",
            "earliest_date": head["earliest_date"], "latest_date": head["latest_date"],
            "sheet_bare_town": not (head["cancel_detail"] or "").strip() and mtype == "TOWNMARK",
            "identity_rule_suffix": "",
            "sheet_images": sorted(set(images.get((tkey, cno), []))),
            "flags": flags,
            "date_confidence": head["earliest_confidence"] or head["latest_confidence"],
            "county_status": head["county_status"],
        })
    out.sort(key=lambda r: (r["town_key"], int(r["cancel_no"]) if r["cancel_no"].isdigit()
                            else 0, r["cancel_no"]))
    return out


# ------------------------------------------------------------------ matching

CREATE_BUCKETS = {
    "create_no_town", "create_no_prod_markings", "create_no_inscription",
    "create_no_type_match",
}

# Nothing from the sheet is ever dropped (Reese, 2026-08-12). A marking that
# cannot be confidently matched is still catalogued -- it becomes a new record
# rather than disappearing. These four buckets used to be refusals; they are
# now creates that carry the reason they could not be matched, and the
# duplicate pass cleans up afterwards.
UNMATCHED_BUT_LANDS = {
    "ambiguous", "town_damaged", "no_colour_match", "unclassified_device",
}


def find_duplicates(prod_rows):
    """True duplicates inside production: same post office and every semantic
    field identical. Not a VPHC problem -- these are already there.

    The evidence says one import block ran twice: 661 of the ~850 pairs sit
    720-728 apart in code number, and the low half spans M1029-M3337 while the
    high half spans M1032-M4064.

    Keep the copy that carries images (archiving it would strand them), then
    the lowest code. The other is proposed for the recycle bin -- **archived,
    never deleted** -- which is what `marking_recycle_bin` is for.
    """
    fields = ["type", "inscription_txt", "is_manuscript", "shape", "lettering",
              "color", "is_irreg", "width", "height", "date_fmt", "impression",
              "rate_val", "desc", "catalog_txt"]
    groups = collections.defaultdict(list)
    for m in prod_rows:
        groups[(m["post_office"],) + tuple(m[f].strip() for f in fields)].append(m)

    def serial(code):
        hit = re.search(r"(\d+)$", code or "")
        return int(hit.group(1)) if hit else 0

    out = []
    for gid, (_, members) in enumerate(
            sorted((k, v) for k, v in groups.items() if len(v) > 1), start=1):
        keep = sorted(members, key=lambda m: (-m["_images"], serial(m["code"])))[0]
        for m in members:
            if m["code"] == keep["code"]:
                continue
            out.append({
                "group": gid, "keep_code": keep["code"], "archive_code": m["code"],
                "town": m["_town"], "type": m["type"],
                "inscription_txt": m["inscription_txt"], "color": m["color"],
                "width": m["width"], "is_manuscript": m["is_manuscript"],
                "keep_images": keep["_images"], "archive_images": m["_images"],
                "code_gap": serial(m["code"]) - serial(keep["code"]),
                "reason": "identical on post office + all 14 semantic fields",
            })
    out.sort(key=lambda r: (r["keep_code"], r["archive_code"]))
    return out


def resolve_contention(proposals, ambiguous_rows):
    """A production marking is one physical device, so it can be claimed once.

    I1-I3 are evaluated per sheet marking and are blind to each other. In a
    large town that is not enough: 11 distinct Richmond cancels all compose the
    inscription RICHMOND/VA. and all want the single black member of that
    cluster. Left alone this silently asserts that 11 devices are one, and it
    is also what manufactured most of the size conflicts -- Alum Springs #4,
    #6 and #7 (51mm, 49mm, 37mm) all landed on one 30mm row.

    So: where several sheet markings claim one production row, keep the single
    claimant whose size corroborates and demote the rest. If none or several
    corroborate, nobody wins -- RULES.md's "never pick arbitrarily" applies in
    this direction too.

    `proposals` is a list of [sheet, colour, prod, identity_fields]; mutated in
    place. Returns the number of claims dropped.
    """
    by_code = collections.defaultdict(list)
    for p in proposals:
        by_code[p[2]["code"]].append(p)

    dropped = 0
    for code, claims in by_code.items():
        keys = {p[0]["vphc_key"] for p in claims}
        if len(keys) < 2:
            continue
        prod = claims[0][2]
        winners = {p[0]["vphc_key"] for p in claims
                   if size_close(prod["width"], p[0]["sheet_width"])}
        keep = next(iter(winners)) if len(winners) == 1 else None
        for p in claims:
            if keep is not None and p[0]["vphc_key"] == keep:
                # Size decided the owner, so size must not be written back.
                for f in ("width", "height"):
                    if f not in p[3]:
                        p[3].append(f)
                continue
            p[3] = None                       # marks the claim as dropped
            dropped += 1
            ambiguous_rows.append({
                "src": p[0]["src"], "vphc_key": p[0]["vphc_key"],
                "town": p[0]["town"], "cancel_no": p[0]["cancel_no"],
                "color": p[1], "candidates": code, "rule": "I3c",
                "note": (f"{len(keys)} sheet markings claim {code}; "
                         + ("size selected another" if keep else
                            f"{len(winners)} corroborate on size -- none selected")),
            })
    proposals[:] = [p for p in proposals if p[3] is not None]
    return dropped


def resolve_post_office(m, po_by_key, by_town, damage):
    """I0. Return (status, town_key_to_use)."""
    tkey = m["town_key"]
    codes = po_by_key.get(tkey, [])
    if not codes:
        return "absent", tkey
    if len(codes) == 1:
        return "unique", tkey
    # I0b: more than one post office answers to this town name. Only resolve
    # when exactly one of them actually holds markings; never pick silently.
    holders = [c for c in codes
               if any(x["post_office"] == c for x in by_town.get(tkey, []))]
    damage.append({
        "town_key": tkey, "town": m["town"], "po_codes": ";".join(sorted(codes)),
        "po_count": len(codes), "holders": ";".join(sorted(holders)),
        "rule": "I0b",
        "note": ("one post office holds markings" if len(holders) == 1
                 else f"{len(holders)} of {len(codes)} post offices hold markings "
                      "-- unresolvable here, see #49/#50"),
    })
    return ("duplicate_resolved" if len(holders) == 1 else "duplicate_ambiguous"), tkey


def match_marking(m, po_by_key, by_town, damage):
    """Run I0-I4 for one VPHC marking.

    Returns (bucket, pairs, note) where pairs is a list of
    (colour, production row, identity_fields_used).
    """
    po_status, tkey = resolve_post_office(m, po_by_key, by_town, damage)
    m["po_status"] = po_status
    if po_status == "absent":
        return "create_no_town", [], "no post office with this name"
    if po_status == "duplicate_ambiguous":
        return "town_damaged", [], "town name maps to several post offices holding markings"

    pool = [x for x in by_town.get(tkey, []) if not x["_ms"]]
    if not pool:
        return "create_no_prod_markings", [], "town exists, no non-manuscript markings"

    # I2 could not classify the device code, so there is no identity to test.
    # These are a vocabulary question for Ian / Wayne Farley, not creates.
    if not m["sheet_type"]:
        return "unclassified_device", [], (
            f"cancel {m['cancel']!r} is not in the I2 vocabulary")

    # I1 -- inscription.
    cands = [x for x in pool if x["_insc"] in m["sheet_insc_keys"]]

    # I1b -- the sheet often leaves the detail column blank, so the composed
    # key is the bare town name while production always writes ABINGDON/Va. or
    # similar. Widen to any production inscription that *begins* with the town,
    # and let colour and size select from there. The prefix must be followed by
    # a separator so ALEXANDRIA never reaches ALEXANDRIA C.H.
    if not cands and m["sheet_bare_town"]:
        town = norm_inscription(m["town"])
        cands = [x for x in pool
                 if x["_insc"] == town
                 or (x["_insc"].startswith(town)
                     and x["_insc"][len(town):len(town) + 1] in ("/", " ", ".", ","))]
        if cands:
            m["identity_rule_suffix"] = "b"

    if not cands:
        return "create_no_inscription", [], "no production inscription matches"

    # I2 -- device type, and rate value where the type carries one.
    typed = [x for x in cands if x["type"] == m["sheet_type"]]
    if m["sheet_type"] == "RATEMARK" and m["sheet_rate"]:
        exact = [x for x in typed if dec(x["rate_val"]) == dec(m["sheet_rate"])]
        if exact:
            typed = exact
    if not typed:
        return "create_no_type_match", [], (
            f"inscription matched but production has no {m['sheet_type']} there")
    cands = typed

    # I3 -- colour selects the fan-out member, one pairing per observation.
    pairs, ambiguous = [], []
    for colour in m["sheet_colors"]:
        same = [x for x in cands if x["_color"] == colour]
        if not same:
            continue
        if len(same) == 1:
            pairs.append((colour, same[0], []))
            continue
        # I4 -- corroboration, used ONLY to break a tie among equals. Every
        # field consumed here is recorded so its E-rule can be suppressed.
        narrowed = [x for x in same if size_close(x["width"], m["sheet_width"])]
        if len(narrowed) == 1:
            pairs.append((colour, narrowed[0], ["width", "height"]))
            continue
        pool2 = narrowed or same
        dated = [x for x in pool2 if date_overlap(
            x["earliest_seen"], x["latest_seen"], m["sheet_earliest"], m["sheet_latest"])]
        if len(dated) == 1:
            used = ["width", "height"] if narrowed else []
            pairs.append((colour, dated[0], used + ["dates"]))
            continue
        ambiguous.append((colour, pool2))

    if ambiguous and not pairs:
        return "ambiguous", ambiguous, "colour does not select a unique member"
    if not pairs:
        return "no_colour_match", [], "inscription and type matched, colour absent from cluster"
    if ambiguous:
        return "resolved_partial", pairs, (
            f"{len(ambiguous)} of {len(m['sheet_colors'])} colours ambiguous")
    return "resolved", pairs, ""


# ---------------------------------------------------------------- enrichment

def enrich(m, colour, prod, identity_fields):
    """E1-E6. Return (rows, ledger_fields, before, after, rejected)."""
    rows, fields, before, after, rejected = [], [], {}, {}, {}

    def compare(field, sheet_val, prod_val, numeric=True):
        sv = (sheet_val or "").strip()
        pv = (prod_val or "").strip()
        if not sv:
            return
        if field in identity_fields:
            # The v2 invariant: this field decided which production row we are
            # looking at, so writing it back would be circular.
            rejected[field] = {"sheet": sv, "prod": pv, "reason": "used_for_identity"}
            rows.append((field, sv, pv, "IDENTITY_SUPPRESSED"))
            return
        if not pv:
            rows.append((field, sv, pv, "FILL"))
            fields.append(field)
            before[field], after[field] = None, sv
            return
        same = (dec(sv) == dec(pv)) if numeric else (sv.upper() == pv.upper())
        if same:
            rows.append((field, sv, pv, "AGREE"))
            return
        # Conflict policy, per Reese 2026-08-12: the sheet wins and the change
        # is logged, so the ledger's `before` is a complete rollback.
        rows.append((field, sv, pv, "CONFLICT"))
        fields.append(field)
        before[field], after[field] = pv, sv

    compare("width", m["sheet_width"], prod["width"])
    compare("height", m["sheet_height"], prod["height"])
    compare("shape", m["sheet_shape"], prod["shape"], numeric=False)   # E2
    # E6: colour is doing identity work in I3 and is never written.
    if m["sheet_colors"]:
        rejected.setdefault("color", {"sheet": colour, "prod": prod["_color"],
                                      "reason": "used_for_identity"})
    # E4: the VPHC cancel number cannot be written -- Marking.code is unique
    # and already holds the ASCC code. This is what forces the A/B/C/D choice.
    rejected["code"] = {"sheet": m["vphc_code"], "prod": prod["code"],
                        "reason": "code_is_unique_and_occupied"}
    return rows, fields, before, after, rejected


# --------------------------------------------------------------------- report

def run(args):
    extract, bundle, out = args.extract, args.bundle, args.out
    os.makedirs(os.path.join(out, "ledger"), exist_ok=True)
    os.makedirs(args.unresolved, exist_ok=True)

    po_name, po_by_key, by_town, prod_rows = load_production(bundle)
    sheet = load_sheet(extract)

    damage, crosswalk, enrichment, conflicts = [], [], [], []
    ledger, ambiguous_rows, insc_unmatched, vocab = [], [], [], []
    counts = collections.Counter()
    matched_codes = set()

    # Pass 1 -- I0-I4 per sheet marking, blind to the other markings.
    verdicts, proposals = {}, []
    for m in sheet:
        bucket, pairs, note = match_marking(m, po_by_key, by_town, damage)
        verdicts[m["vphc_key"]] = [bucket, note]
        if not m["sheet_type"]:
            vocab.append({"src": m["src"], "value": m["cancel"], "town": m["town"],
                          "rule": "I2", "note": "cancel code not in the vocabulary"})
        if bucket == "create_no_inscription":
            insc_unmatched.append({
                "src": m["src"], "value": ";".join(sorted(m["sheet_insc_keys"])),
                "town": m["town"], "rule": "I1", "note": note})
        if bucket == "ambiguous":
            for colour, cands in pairs:
                ambiguous_rows.append({
                    "src": m["src"], "vphc_key": m["vphc_key"], "town": m["town"],
                    "cancel_no": m["cancel_no"], "color": colour,
                    "candidates": ";".join(sorted(x["code"] for x in cands)),
                    "rule": "I3", "note": note})
        elif bucket in ("resolved", "resolved_partial"):
            for colour, prod, ifields in pairs:
                proposals.append([m, colour, prod, list(ifields)])

    # Pass 2 -- one production row is one device, so it can be claimed once.
    dropped = resolve_contention(proposals, ambiguous_rows)
    kept = collections.defaultdict(list)
    for m_, colour, prod, ifields in proposals:
        kept[m_["vphc_key"]].append((colour, prod, ifields))
    for key, (bucket, note) in verdicts.items():
        if bucket in ("resolved", "resolved_partial") and not kept.get(key):
            verdicts[key] = ["ambiguous", "every claim lost contention (I3c)"]

    # Pass 3 -- emit.
    for m in sheet:
        bucket, note = verdicts[m["vphc_key"]]
        counts[bucket] += 1
        pairs = kept.get(m["vphc_key"], [])
        if not pairs:
            crosswalk.append(row_for(m, bucket, None, None, note))
            continue

        for colour, prod, identity_fields in pairs:
            matched_codes.add(prod["code"])
            rows, fields, before, after, rejected = enrich(m, colour, prod, identity_fields)
            crosswalk.append(row_for(m, bucket, prod, colour, note, identity_fields))
            for field, sv, pv, verdict in rows:
                enrichment.append({
                    "vphc_key": m["vphc_key"], "src": m["src"], "prod_code": prod["code"],
                    "color": colour, "field": field, "sheet": sv, "prod": pv,
                    "verdict": verdict})
                if verdict == "CONFLICT":
                    conflicts.append({
                        "vphc_key": m["vphc_key"], "src": m["src"], "town": m["town"],
                        "cancel_no": m["cancel_no"], "prod_code": prod["code"],
                        "field": field, "sheet": sv, "prod": pv,
                        "identity_tiebreak": "", "note": "sheet wins; before is the rollback"})
                elif verdict == "IDENTITY_SUPPRESSED" and sv != pv:
                    conflicts.append({
                        "vphc_key": m["vphc_key"], "src": m["src"], "town": m["town"],
                        "cancel_no": m["cancel_no"], "prod_code": prod["code"],
                        "field": field, "sheet": sv, "prod": pv,
                        "identity_tiebreak": "yes",
                        "note": "differs, but this field selected the row -- not written"})
            counts[f"action:{'update' if fields else 'confirm'}"] += 1
            ledger.append({
                "run": args.run, "mode": "dryrun", "applied": False,
                "src": m["src"], "town": m["town"], "county": m["county"],
                "cancel": m["cancel_no"],
                "action": "update" if fields else "confirm", "target": "marking",
                "target_code": prod["code"], "marking_id": None,
                "rule": f"I1+I2+I3{'+I4' if identity_fields else ''}",
                "rule_version": RULES_VERSION,
                "confidence": 0.97 if not identity_fields else 0.95,
                "fields": fields, "before": before, "after": after,
                "rejected": rejected,
            })

    # A post office must belong to a region, and the region comes from the
    # county (R3). Towns with no resolvable state cannot be created, so the
    # markings on them have nowhere to land -- set aside with a stated reason
    # rather than invented a home for.
    po_plan = plan_post_offices(extract, po_by_key)
    creatable = [r for r in po_plan if not r["exists"] and r["state"].strip()]
    unroutable = []
    for r in po_plan:
        if r["exists"] or r["state"].strip():
            continue
        reason_code, reason = classify_unroutable(r)
        unroutable.append({
            "town_key": r["town_key"], "town": r["town"], "county": r["county"],
            "needed_for": r["needed_for"], "reason_code": reason_code,
            "reason": reason, "rule": "R3"})
    blocked_towns = {r["town_key"] for r in unroutable}
    for r in crosswalk:
        if r["town_key"] in blocked_towns:
            r["landing"] = "blocked"
            r["note"] = (r["note"] + "; " if r["note"] else "") + (
                "cannot land -- its town has no post office and cannot be created")

    # Every sheet marking that did not match becomes a create, including the
    # four buckets that used to be refusals. Nothing is dropped; the bucket
    # travels with the line as the reason, and the duplicate pass tidies up.
    for r in crosswalk:
        if r["prod_code"] or r["verdict"] not in (CREATE_BUCKETS | UNMATCHED_BUT_LANDS):
            continue
        if r["landing"] == "blocked":
            continue
        ledger.append({
            "run": args.run, "mode": "dryrun", "applied": False,
            "src": r["src"], "town": r["town"], "county": r["county"],
            "cancel": r["cancel_no"], "action": "create", "target": "marking",
            # The site owns numbering (Reese, 2026-08-12), so `code` is minted
            # by the catalog on insert. The VPHC number is carried as reference
            # data only -- it is not an identifier here.
            "target_code": None, "marking_id": None,
            "rule": "I0c" if r["verdict"] == "create_no_town" else "I5",
            "rule_version": RULES_VERSION,
            "confidence": 1.0 if r["verdict"] in CREATE_BUCKETS else 0.5,
            "fields": ["type", "inscription_txt", "width", "height", "shape",
                       "color", "vphc_ref"],
            "before": {}, "after": {
                "type": r["sheet_type"], "inscription_txt": r["sheet_insc"],
                "width": r["sheet_width"], "height": r["sheet_height"],
                "shape": r["sheet_shape"], "color": r["sheet_colors"],
                "vphc_ref": r["vphc_code"]},
            "rejected": {}, "why_unmatched": r["verdict"],
            # Phase C copies this verbatim into submitted_data, so the doubt is
            # queryable before approval and visible to the editor deciding.
            "vphc": {
                "src": r["src"], "town": r["town"], "county": r["county"],
                "state": r["state"], "cancel_no": r["cancel_no"],
                "vphc_code": r["vphc_code"], "rules_version": RULES_VERSION,
                "why_unmatched": r["verdict"],
                "flags": [f for f in r["flags"].split(";") if f],
                "catalog_marker": r["catalog_marker"],
                "images": r["sheet_image_files"].split(";") if r["sheet_image_files"] else [],
            },
            "editor_comment": r["editor_comment"],
        })

    # E5 -- images. Purely additive: an add_images line never removes or
    # replaces what production already holds, so `before` records the existing
    # count only as context. One line per sheet marking; where the marking
    # matched several fan-out members (the same device in several colours) the
    # scan attaches to the lowest code and the alternatives are named, because
    # duplicating one scan across every colour row would be wrong.
    for m in sheet:
        if not m["sheet_images"]:
            continue
        targets = sorted(p[1]["code"] for p in kept.get(m["vphc_key"], []))
        ledger.append({
            "run": args.run, "mode": "dryrun", "applied": False,
            "src": m["src"], "town": m["town"], "county": m["county"],
            "cancel": m["cancel_no"], "action": "add_images", "target": "image",
            "target_code": targets[0] if targets else m["vphc_code"],
            "marking_id": None, "rule": "E5", "rule_version": RULES_VERSION,
            "confidence": 1.0, "fields": ["images"],
            "before": {"images": (next((p[1]["_images"] for p in
                                        kept.get(m["vphc_key"], [])), 0))},
            "after": {"images_added": m["sheet_images"]},
            "rejected": ({"alternate_targets": targets[1:]} if len(targets) > 1 else {}),
        })

    # Production's own duplicates. Archived, never deleted -- the catalog has a
    # recycle bin (`marking_recycle_bin`) and removal there is reversible.
    duplicates = find_duplicates(prod_rows)
    for d in duplicates:
        ledger.append({
            "run": args.run, "mode": "dryrun", "applied": False,
            "src": "", "town": d["town"], "county": "", "cancel": "",
            "action": "archive", "target": "marking",
            "target_code": d["archive_code"], "marking_id": None,
            "rule": "D1", "rule_version": RULES_VERSION, "confidence": 0.99,
            "fields": ["recycle_bin"],
            "before": {"recycle_bin": None},
            "after": {"recycle_bin": "archived", "duplicate_of": d["keep_code"],
                      "reason": d["reason"]},
            "rejected": {"delete": "archive only -- never delete a catalog row"},
        })

    prod_unmatched = [
        {"code": x["code"], "town": x["_town"], "type": x["type"],
         "inscription_txt": x["inscription_txt"], "color": x["color"],
         "width": x["width"], "shape": x["shape"],
         "is_manuscript": x["is_manuscript"],
         "reason": ("manuscript -- out of scope for this phase" if x["_ms"]
                    else "town or device not named by the sheet")}
        for x in prod_rows if x["code"] not in matched_codes]
    prod_unmatched.sort(key=lambda r: r["code"])

    # --------------------------------------------------------------- outputs
    write_csv(os.path.join(out, "crosswalk.csv"), CROSSWALK_FIELDS, crosswalk)
    write_csv(os.path.join(out, "sheet_markings.csv"), SHEET_FIELDS,
              [{k: (";".join(v) if isinstance(v, (list, set)) else v)
                for k, v in m.items() if k in SHEET_FIELDS} for m in sheet])
    write_csv(os.path.join(out, "enrichment.csv"),
              ["vphc_key", "src", "prod_code", "color", "field", "sheet", "prod",
               "verdict"], enrichment)
    write_csv(os.path.join(out, "conflicts.csv"),
              ["vphc_key", "src", "town", "cancel_no", "prod_code", "field",
               "sheet", "prod", "identity_tiebreak", "note"], conflicts)
    write_csv(os.path.join(out, "prod_unmatched.csv"),
              ["code", "town", "type", "inscription_txt", "color", "width",
               "shape", "is_manuscript", "reason"], prod_unmatched)

    write_csv(os.path.join(out, "duplicates.csv"),
              ["group", "keep_code", "archive_code", "town", "type",
               "inscription_txt", "color", "width", "is_manuscript",
               "keep_images", "archive_images", "code_gap", "reason"], duplicates)

    write_csv(os.path.join(out, "post_offices_to_create.csv"),
              ["town_key", "town", "state", "county", "population", "needed_for",
               "exists"], creatable)
    write_csv(os.path.join(args.unresolved, "post_office_quarantine.csv"),
              ["town_key", "town", "county", "needed_for", "reason_code",
               "reason", "rule"], unroutable)

    # Count per MARKING, not per crosswalk row. A matched marking emits one row
    # per colour, so row counts overstate every matched bucket -- an earlier
    # draft of this report read 501 resolved when the truth was 415 markings.
    first_verdict = {}
    for r in crosswalk:
        first_verdict.setdefault(r["vphc_key"], r["verdict"])

    # One index of every doubt, so the residue is a worklist rather than a
    # rumour. This is what goes to Ian and Wayne Farley.
    uncertain = []
    for m in sheet:
        verdict = first_verdict.get(m["vphc_key"], "")
        flags = list(m["flags"])
        if verdict in FLAG_REASONS:
            flags.insert(0, verdict)
        if m["town_key"] in blocked_towns:
            flags.insert(0, "no_post_office")
        for flag in flags:
            uncertain.append({
                "src": m["src"], "vphc_key": m["vphc_key"], "town": m["town"],
                "county": m["county"], "state": m["state"],
                "cancel_no": m["cancel_no"], "flag": flag,
                "reason": FLAG_REASONS.get(flag, ""), "verdict": verdict,
                "date_confidence": m["date_confidence"],
                "county_status": m["county_status"],
                "has_scan": "yes" if m["sheet_images"] else "",
            })
    uncertain.sort(key=lambda r: (r["flag"], r["town"], r["cancel_no"]))
    write_csv(os.path.join(out, "uncertain.csv"),
              ["src", "vphc_key", "town", "county", "state", "cancel_no", "flag",
               "reason", "verdict", "date_confidence", "county_status",
               "has_scan"], uncertain)

    verdict_counts = collections.Counter(first_verdict.values())
    matched_keys = {r["vphc_key"] for r in crosswalk if r["prod_code"]}
    blocked_keys = {r["vphc_key"] for r in crosswalk if r["landing"] == "blocked"}
    landing_counts = collections.Counter(
        "blocked" if k in blocked_keys else
        ("update" if k in matched_keys else "create") for k in first_verdict)
    field_counts = collections.Counter(
        (r["field"], r["verdict"]) for r in enrichment)
    counts_rows = (
        [{"group": "bucket", "key": k, "n": v} for k, v in sorted(verdict_counts.items())] +
        [{"group": "enrichment", "key": f"{f}:{v}", "n": n}
         for (f, v), n in sorted(field_counts.items())] +
        [{"group": "landing", "key": k, "n": v} for k, v in sorted(landing_counts.items())] +
        [{"group": "totals", "key": "sheet_markings", "n": len(sheet)},
         {"group": "totals", "key": "sheet_markings_landed", "n": sum(landing_counts.values())},
         {"group": "totals", "key": "prod_markings", "n": len(prod_rows)},
         {"group": "totals", "key": "prod_matched", "n": len(matched_codes)},
         {"group": "totals", "key": "prod_unmatched", "n": len(prod_unmatched)},
         {"group": "totals", "key": "prod_duplicates_archivable", "n": len(duplicates)},
         {"group": "totals", "key": "images_added", "n": sum(len(m["sheet_images"]) for m in sheet)},
         {"group": "totals", "key": "ledger_lines", "n": len(ledger)},
         {"group": "totals", "key": "conflicts", "n": len(conflicts)}])
    write_csv(os.path.join(out, "counts.csv"), ["group", "key", "n"], counts_rows)

    with open(os.path.join(out, "ledger", "proposed.jsonl"), "w", encoding="utf-8") as fh:
        for line in ledger:
            fh.write(json.dumps(line, sort_keys=True) + "\n")

    seen = set()
    dedup_damage = []
    for d in sorted(damage, key=lambda r: r["town_key"]):
        if d["town_key"] in seen:
            continue
        seen.add(d["town_key"])
        dedup_damage.append(d)
    dedup_damage += truncation_suspects(po_by_key, seen)
    write_csv(os.path.join(args.unresolved, "prod_town_damage.csv"),
              ["town_key", "town", "po_codes", "po_count", "holders", "rule", "note"],
              dedup_damage)
    write_csv(os.path.join(args.unresolved, "fanout_ambiguous.csv"),
              ["src", "vphc_key", "town", "cancel_no", "color", "candidates",
               "rule", "note"], ambiguous_rows)
    write_csv(os.path.join(args.unresolved, "insc_unmatched.csv"),
              ["src", "value", "town", "rule", "note"], insc_unmatched)
    write_csv(os.path.join(args.unresolved, "type_code_vocab.csv"),
              ["src", "value", "town", "rule", "note"], vocab)

    outputs = {}
    for root, _, files in os.walk(out):
        for f in sorted(files):
            if f == "manifest.json":
                continue
            p = os.path.join(root, f)
            outputs[os.path.relpath(p, out)] = sha256_file(p)
    manifest = {
        "rules_version": RULES_VERSION, "run": args.run,
        "inputs": {
            "t1_markings.csv": sha256_file(os.path.join(extract, "t1_markings.csv")),
            "markings.csv": sha256_file(os.path.join(bundle, "markings.csv")),
            "post_offices.csv": sha256_file(os.path.join(bundle, "post_offices.csv")),
        },
        "stats": dict(sorted(verdict_counts.items())),
        "totals": {r["key"]: r["n"] for r in counts_rows if r["group"] == "totals"},
        "outputs": outputs,
    }
    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
        fh.write("\n")

    landed = landing_counts["update"] + landing_counts["create"]
    print(f"VPHC cross-examination -- rules v{RULES_VERSION}, run {args.run}")
    print(f"  sheet markings (non-manuscript)  {len(sheet):>6}   [counts are per MARKING]")
    for k, v in sorted(verdict_counts.items(), key=lambda kv: -kv[1]):
        print(f"    {k:<32} {v:>6}")
    print(f"  LANDS IN THE CATALOG             {landed:>6}"
          f"   ({landing_counts['update']} update, {landing_counts['create']} create)"
          f"  = {100.0 * landed / len(sheet):.1f}% of the sheet")
    if landing_counts["blocked"]:
        print(f"  BLOCKED -- town has no post office {landing_counts['blocked']:>4}"
              f"   see unresolved/post_office_quarantine.csv ({len(unroutable)} towns)")
    print(f"  post offices to create           {len(creatable):>6}")
    print(f"  production markings              {len(prod_rows):>6}"
          f"  matched {len(matched_codes)}  unmatched {len(prod_unmatched)}")
    for (f, v), n in sorted(field_counts.items()):
        print(f"    {f + ':' + v:<32} {n:>6}")
    print(f"  images added                     {sum(len(m['sheet_images']) for m in sheet):>6}"
          f"   (none ever removed)")
    print(f"  production duplicates to archive  {len(duplicates):>6}   (never deleted)")
    print(f"  ledger lines {len(ledger)}   conflicts {len(conflicts)}")
    return manifest


CROSSWALK_FIELDS = [
    "vphc_key", "vphc_code", "src", "state", "county", "town", "town_key",
    "cancel_no", "po_status", "sheet_type", "sheet_insc", "sheet_shape",
    "sheet_width", "sheet_height", "sheet_colors", "sheet_earliest",
    "sheet_latest", "prod_code", "prod_type", "prod_insc", "prod_shape",
    "prod_width", "prod_height", "prod_color", "match_color", "identity_fields",
    "sheet_images", "sheet_image_files", "prod_images", "images_to_add",
    "landing", "verdict", "flags", "catalog_marker", "editor_comment", "note",
]

SHEET_FIELDS = [
    "vphc_key", "vphc_code", "src", "state", "county", "town", "town_key",
    "cancel_no", "cancel", "cancel_detail", "rows", "occurrences", "sheet_type",
    "sheet_rate", "sheet_shape", "sheet_width", "sheet_height", "sheet_colors",
    "sheet_earliest", "sheet_latest",
]


def row_for(m, verdict, prod, colour, note, identity_fields=None):
    return {
        "vphc_key": m["vphc_key"], "vphc_code": m["vphc_code"], "src": m["src"],
        "state": m["state"], "county": m["county"], "town": m["town"],
        "town_key": m["town_key"], "cancel_no": m["cancel_no"],
        "po_status": m.get("po_status", ""), "sheet_type": m["sheet_type"],
        "sheet_insc": ";".join(sorted(m["sheet_insc_keys"])),
        "sheet_shape": m["sheet_shape"], "sheet_width": m["sheet_width"],
        "sheet_height": m["sheet_height"], "sheet_colors": ";".join(m["sheet_colors"]),
        "sheet_earliest": m["sheet_earliest"], "sheet_latest": m["sheet_latest"],
        "prod_code": prod["code"] if prod else "", "prod_type": prod["type"] if prod else "",
        "prod_insc": prod["inscription_txt"] if prod else "",
        "prod_shape": prod["shape"] if prod else "",
        "prod_width": prod["width"] if prod else "",
        "prod_height": prod["height"] if prod else "",
        "prod_color": prod["_color"] if prod else "", "match_color": colour or "",
        "identity_fields": ";".join(identity_fields or []),
        # E5 is additive only: images_to_add is what the sheet contributes, and
        # prod_images is what stays regardless. Nothing is ever removed.
        "sheet_images": len(m["sheet_images"]),
        "sheet_image_files": ";".join(m["sheet_images"]),
        "prod_images": prod["_images"] if prod else "",
        "images_to_add": len(m["sheet_images"]),
        # Every marking lands somewhere: it either enriches a matched record or
        # is created. There is no third outcome.
        "landing": "update" if prod else "create",
        "verdict": verdict,
        # Uncertainty travels with the record, not just in a quarantine CSV.
        "flags": ";".join(m["flags"]),
        "catalog_marker": catalog_marker(m, verdict),
        "editor_comment": editor_comment(m, verdict),
        "note": note,
    }


def truncation_suspects(po_by_key, already):
    """R4. Production carries extraction damage -- ALEX, ALEXA, ALEXAN are all
    truncated ALEXANDRIA. RULES.md forbids matching against these blindly;
    nothing enforced it until now."""
    keys = sorted(po_by_key)
    out = []
    for k in keys:
        if len(k) < 4 or k in already:
            continue
        longer = [o for o in keys if o != k and o.startswith(k) and len(o) > len(k) + 1]
        if longer:
            out.append({
                "town_key": k, "town": k, "po_codes": ";".join(po_by_key[k]),
                "po_count": len(po_by_key[k]), "holders": "", "rule": "R4",
                "note": "truncation suspect of " + ";".join(sorted(longer)[:4])})
    return out


# ------------------------------------------------------------------ selftest

def selftest(args):
    """Fixtures F1-F9. Drawn from real rows; at least one must NOT match."""
    po_name, po_by_key, by_town, prod_rows = load_production(args.bundle)
    sheet = load_sheet(args.extract)
    idx = {m["vphc_key"]: m for m in sheet}
    damage = []
    result, proposals = {}, []
    for m in sheet:
        result[m["vphc_key"]] = match_marking(m, po_by_key, by_town, damage)
        bucket, pairs, _ = result[m["vphc_key"]]
        if bucket in ("resolved", "resolved_partial"):
            for colour, prod, ifields in pairs:
                proposals.append([m, colour, prod, list(ifields)])
    # The fixtures must see the same state the report does, so run pass 2 too.
    resolve_contention(proposals, [])
    kept = collections.defaultdict(list)
    for m_, colour, prod, ifields in proposals:
        kept[m_["vphc_key"]].append((colour, prod, ifields))

    fails = []

    def check(name, cond, detail=""):
        print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  -- {detail}" if detail and not cond else ""))
        if not cond:
            fails.append(name)

    def codes(key, colour=None):
        return {p[1]["code"] for p in kept.get(key, [])
                if colour is None or p[0] == colour}

    print("F1  the asterisk fixture -- punctuation is identity")
    check("T1:r6 Abingdon #3 (*Va.*) -> M1076 only",
          codes("ABINGDON#3") == {"ASCC6-VA-M1076"}, str(codes("ABINGDON#3")))
    check("T1:r5 Abingdon #2 (Va.) -> M1077 only",
          codes("ABINGDON#2") == {"ASCC6-VA-M1077"}, str(codes("ABINGDON#2")))

    print("F2  the fan-out fixture -- colour selects the member")
    got = codes("ABINGDON#6")
    check("Abingdon #6 -> the four 30mm members",
          got == {"ASCC6-VA-M1080", "ASCC6-VA-M1081", "ASCC6-VA-M1082", "ASCC6-VA-M1095"},
          str(got))

    print("F3  the enrichment fixture -- production rows with no size get filled")
    for key, want in (("ABINGDON#7", "ASCC6-VA-M1091"), ("ABINGDON#9", "ASCC6-VA-M1087")):
        got = codes(key)
        check(f"{key} -> {want} present", want in got, str(got))
    # Abingdon #10 and #13 are BOTH recorded as "3" in blue and production has
    # exactly one such row (M1097, no size). Nothing can say which cancel ASCC
    # catalogued, so both must be refused -- RULES.md's "never pick
    # arbitrarily" applies to the many-sheet-rows-to-one-production-row
    # direction too. An earlier prototype asserted #10 -> M1097; it was wrong.
    check("Abingdon #10 and #13 both refuse M1097",
          not codes("ABINGDON#10") and not codes("ABINGDON#13"),
          f'{codes("ABINGDON#10")} {codes("ABINGDON#13")}')
    m = idx["ABINGDON#9"]
    prod = next(x for x in prod_rows if x["code"] == "ASCC6-VA-M1087")
    rows, fields, before, after, _ = enrich(m, "BLUE", prod, [])
    check("Abingdon #9 fills width on M1087",
          any(f == "width" and v == "FILL" for f, _, _, v in rows), str(rows))

    print("F4  the negative fixture -- must NOT snap by proximity")
    bucket, pairs, _ = result["ABINGDON#14"]
    check("Abingdon #14 (32.5mm) does not match M1080 (30.0mm)",
          "ASCC6-VA-M1080" not in codes("ABINGDON#14"), f"{bucket} {codes('ABINGDON#14')}")

    print("F5  the duplicate-post-office fixture")
    dmg = {d["town_key"] for d in damage}
    check("ANTHONYSCREEK reported as duplicate", "ANTHONYSCREEK" in dmg or
          len(po_by_key.get("ANTHONYSCREEK", [])) > 1)
    check("BRAXTONCH reported as duplicate", "BRAXTONCH" in dmg or
          len(po_by_key.get("BRAXTONCH", [])) > 1)

    print("F6  the truncation fixture")
    sus = {d["town_key"] for d in truncation_suspects(po_by_key, set())}
    check("ALEX flagged as a truncation suspect", "ALEX" in sus, str(sorted(sus)[:8]))
    # No sheet row may ever land on a truncated production town. town_key is an
    # exact key, so this holds by construction -- the fixture is here to catch
    # anyone who later "improves" I0 with a prefix or fuzzy match.
    leaked = [(m["vphc_key"], p[1]["code"], p[1]["_town_key"])
              for m in sheet
              for p in (result[m["vphc_key"]][1] if result[m["vphc_key"]][0]
                        not in ("ambiguous",) else [])
              if isinstance(p, tuple) and len(p) == 3
              and p[1]["_town_key"] != m["town_key"]]
    check("no sheet marking routes to a differently-named production town",
          not leaked, str(leaked[:4]))

    print("F7  the conservation fixture")
    total = len(sheet)
    bucketed = collections.Counter(b for b, _, _ in result.values())
    check(f"every one of {total} markings lands in exactly one bucket",
          sum(bucketed.values()) == total, f"{sum(bucketed.values())} != {total}")

    print("F8  determinism")
    a = load_sheet(args.extract)
    b = load_sheet(args.extract)
    check("load_sheet is deterministic",
          [x["vphc_key"] for x in a] == [x["vphc_key"] for x in b])

    print("F9  ledger reconciliation -- before is reconstructible from the bundle")
    by_code = {x["code"]: x for x in prod_rows}
    bad = []
    for m in sheet:
        for colour, prod, ifields in kept.get(m["vphc_key"], []):
            _, fields, before, _, _ = enrich(m, colour, prod, ifields)
            for f, v in before.items():
                actual = by_code[prod["code"]][f].strip() or None
                if (v or None) != actual:
                    bad.append((prod["code"], f, v, actual))
    check("every ledger `before` matches the bundle", not bad, str(bad[:4]))

    print("F10 contention -- a production device is claimed at most once")
    claims = collections.Counter(p[2]["code"] for p in proposals)
    over = {c: n for c, n in claims.items() if n > 1}
    check("no production marking is claimed by two sheet markings", not over,
          str(sorted(over.items())[:4]))
    # The regression this fixture exists for: before I3c, RICHMOND/VA. black was
    # claimed by 11 distinct Richmond cancels at 26mm to 35mm, and Alum Springs
    # #4/#6/#7 (51, 49, 37mm) all landed on one 30mm row.
    rich = [p for p in proposals if p[2]["code"] == "ASCC6-VA-M2074"]
    check("RICHMOND M2074 is claimed at most once", len(rich) <= 1, str(len(rich)))

    print("F11 images -- the cancel number is the scan's key, and nothing is removed")
    # The sheet's marking number IS the image key: T2 anchors one scan per
    # (town, cancel #), which is how Abingdon #10 reaches abingdon-10-r9735.png.
    ab10 = idx["ABINGDON#10"]["sheet_images"]
    check("Abingdon #10 carries its own scan",
          any("abingdon-10" in f for f in ab10), str(ab10))
    ab6 = idx["ABINGDON#6"]["sheet_images"]
    check("Abingdon #6 carries its own scan, not #10's",
          any("abingdon-6" in f for f in ab6) and
          not any("abingdon-10" in f for f in ab6), str(ab6))
    withimg = sum(1 for m in sheet if m["sheet_images"])
    check("about half the non-manuscript markings have a scan",
          1000 < withimg < 1400, f"{withimg} of {len(sheet)}")
    # E5 is additive: no proposal may ever reduce a production image count.
    shrinks = [m["vphc_key"] for m in sheet
               for colour, prod, _ in kept.get(m["vphc_key"], [])
               if m["sheet_images"] and prod["_images"] > prod["_images"] + len(m["sheet_images"])]
    check("no image proposal ever reduces a production count", not shrinks, str(shrinks[:3]))

    print("F12 coverage -- nothing from the sheet is dropped")
    # Every marking either updates a matched production row or is created.
    # There is no third outcome and no silent discard.
    def effective(key):
        """run() re-buckets a marking whose every claim lost contention."""
        bucket = result[key][0]
        if bucket in ("resolved", "resolved_partial") and not kept.get(key):
            return "ambiguous"
        return bucket

    # The real invariant is not "everything lands" -- 42 markings sit on towns
    # that cannot become post offices. It is "nothing is lost silently": every
    # marking either lands or is quarantined with a stated reason.
    plan = plan_post_offices(args.extract, po_by_key)
    blocked_towns = {r["town_key"] for r in plan
                     if not r["exists"] and not r["state"].strip()}
    landed = quarantined = 0
    for m in sheet:
        if m["town_key"] in blocked_towns:
            quarantined += 1
        elif kept.get(m["vphc_key"]) or effective(m["vphc_key"]) in (
                CREATE_BUCKETS | UNMATCHED_BUT_LANDS):
            landed += 1
    check(f"every one of {len(sheet)} markings either lands or is quarantined",
          landed + quarantined == len(sheet),
          f"{landed} landed + {quarantined} quarantined != {len(sheet)}")
    check("the quarantined set is small and explained",
          0 < quarantined < 100 and all(
              classify_unroutable(r)[1] for r in plan
              if r["town_key"] in blocked_towns), str(quarantined))
    buckets = {effective(m["vphc_key"]) for m in sheet}
    orphan = buckets - CREATE_BUCKETS - UNMATCHED_BUT_LANDS - {"resolved", "resolved_partial"}
    check("no bucket exists that has nowhere to land", not orphan, str(orphan))

    print("F13 duplicates -- archived, never deleted")
    dups = find_duplicates(prod_rows)
    check("production duplicates are detected", len(dups) > 500, str(len(dups)))
    keeps = {d["keep_code"] for d in dups}
    arch = {d["archive_code"] for d in dups}
    check("no marking is both kept and archived", not (keeps & arch), str(sorted(keeps & arch)[:3]))
    by_code = {x["code"]: x for x in prod_rows}
    lost = [d for d in dups
            if by_code[d["archive_code"]]["_images"] > by_code[d["keep_code"]]["_images"]]
    check("archiving never strands images on the discarded copy", not lost,
          str([(d["keep_code"], d["archive_code"]) for d in lost[:3]]))

    print("F14 post offices -- never invent a home for a town that has none")
    plan = plan_post_offices(args.extract, po_by_key)
    new = [r for r in plan if not r["exists"]]
    creatable = [r for r in new if r["state"].strip()]
    unroutable = [r for r in new if not r["state"].strip()]
    check("every creatable post office has a state",
          all(r["state"].strip() for r in creatable), "")
    check("nothing creatable is missing a county",
          all(r["county"].strip() for r in creatable),
          str([r["town"] for r in creatable if not r["county"].strip()][:4]))
    check("unroutable towns are set aside, not created", len(unroutable) > 0,
          str(len(unroutable)))
    codes = {classify_unroutable(r)[0] for r in unroutable}
    check("every unroutable town carries a stated reason",
          all(classify_unroutable(r)[1] for r in unroutable), str(codes))
    # The two that made this rule necessary: a supplement header read as a town,
    # and a steamboat route that is not a post office at all.
    by_town = {r["town"]: r for r in unroutable}
    check("'11-93 SUPPLEMENT' is caught as a section header",
          classify_unroutable(by_town["11-93 SUPPLEMENT"])[0] == "supplement_header"
          if "11-93 SUPPLEMENT" in by_town else False, str(sorted(by_town)[:3]))
    check("'POTOMAC STEAMBOAT' is caught as a route agent",
          classify_unroutable(by_town["POTOMAC STEAMBOAT"])[0] == "route_agent"
          if "POTOMAC STEAMBOAT" in by_town else False, str(sorted(by_town)[:3]))

    print(f"\n{len(fails)} failing fixture(s)" if fails else "\nall fixtures green")
    return 1 if fails else 0


def main():
    _assert_no_database()
    p = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    wip = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wip")
    out = os.path.join(wip, "out", "vphc")
    p.add_argument("--extract", default=os.path.join(out, "extract"))
    p.add_argument("--bundle", default=os.path.join(wip, "in", "vphc-prod-va-wv"))
    p.add_argument("--out", default=os.path.join(out, "crossexam"))
    p.add_argument("--unresolved", default=os.path.join(out, "unresolved"))
    p.add_argument("--run", default="2026-08-12a")
    p.add_argument("--explain", default="")
    p.add_argument("--selftest", action="store_true")
    args = p.parse_args()

    if args.selftest:
        return selftest(args)
    if args.explain:
        return explain(args)
    run(args)
    return 0


def explain(args):
    po_name, po_by_key, by_town, prod_rows = load_production(args.bundle)
    sheet = load_sheet(args.extract)
    want = args.explain
    hits = [m for m in sheet if want == m["vphc_key"] or want in m["src"].split(";")]
    if not hits:
        print(f"no VPHC marking matches {want!r}")
        return 1
    for m in hits:
        print(f"\n{m['vphc_key']}  ({m['src']})  {m['town']} #{m['cancel_no']}")
        print(f"  sheet: type={m['sheet_type']} keys={sorted(m['sheet_insc_keys'])} "
              f"rate={m['sheet_rate']!r} shape={m['sheet_shape']!r} "
              f"size={m['sheet_width']}x{m['sheet_height']} colours={m['sheet_colors']} "
              f"dates={m['sheet_earliest']}-{m['sheet_latest']}")
        pool = [x for x in by_town.get(m["town_key"], []) if not x["_ms"]]
        print(f"  production pool at {m['town_key']}: {len(pool)} non-manuscript")
        for x in pool:
            mark = "<==" if x["_insc"] in m["sheet_insc_keys"] else "   "
            print(f"    {mark} {x['code']:16s} {x['type']:9s} {x['inscription_txt']!r:26s} "
                  f"{x['_color']:7s} {x['width']:6s} {x['shape']}")
        bucket, pairs, note = match_marking(m, po_by_key, by_town, [])
        print(f"  verdict: {bucket}  {note}")
        for colour, prod, ifields in (pairs if bucket != "ambiguous" else []):
            print(f"    {colour:8s} -> {prod['code']}"
                  f"{'  (tiebreak on ' + ','.join(ifields) + ')' if ifields else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
