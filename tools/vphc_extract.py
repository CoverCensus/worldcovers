#!/usr/bin/env python3
"""
VPHC extractor -- VPHS_COMPLETE_BOOK_DONE.xlsx -> canonical CSVs + images.

Phase 0 of the VPHC ingest. Touches no database. Deterministic and re-runnable:
two runs over the same workbook produce byte-identical outputs.

Implements RULES.md v1 (R1-R8), kept at docs/devel/VPHC-RULES.md. Every
emitted row carries a `src` column naming the spreadsheet cells it came from,
so the Phase 3 ledger can point back.

Stdlib only -- openpyxl is not a project dependency and pandas alone cannot
read xlsx. An .xlsx is a zip of XML, which zipfile + ElementTree handle fine.

Usage (see docs/devel/TOOLS.md, "VPHC Source Extraction"):
    python3 tools/vphc_extract.py                     # tools/wip/in -> tools/wip/out/vphc
    python3 tools/vphc_extract.py --xlsx X --out DIR
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime
import difflib
import hashlib
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
XDR = "{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}"
DML = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

RULES_VERSION = 1
# Source and output stay under tools/wip/ (gitignored), as for the FPHC tools.
WIP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wip")
EXCEL_EPOCH = datetime.date(1899, 12, 30)  # 1900 date system

# R1c -- the era window. This is a *stampless* catalog, and both tables show a
# clean cliff: 1867 carries 338 dates, 1868 only 23, 1869 five, then single
# digits. Everything from 1870 on (319 values) is displaced 18th-century
# material -- the 1770-1799 population is 302, almost exactly the same size,
# and the 1780s are otherwise empty. Verified against the scan of Abingdon
# cancel #1, which reads "Abingdon Dec 2. 179-" while the serial alone decodes
# to 1897-12-02.
ERA_MAX = 1869
ERA_MIN = 1700

# ---------------------------------------------------------------- R3 counties

WV_COUNTIES = {
    "BARBOUR", "BERKELEY", "BOONE", "BRAXTON", "BROOKE", "CABELL", "CALHOUN",
    "CLAY", "DODDRIDGE", "FAYETTE", "GILMER", "GRANT", "GREENBRIER",
    "HAMPSHIRE", "HANCOCK", "HARDY", "HARRISON", "JACKSON", "JEFFERSON",
    "KANAWHA", "LEWIS", "LINCOLN", "LOGAN", "MARION", "MARSHALL", "MASON",
    "MCDOWELL", "MERCER", "MINERAL", "MINGO", "MONONGALIA", "MONROE",
    "MORGAN", "NICHOLAS", "OHIO", "PENDLETON", "PLEASANTS", "POCAHONTAS",
    "PRESTON", "PUTNAM", "RALEIGH", "RANDOLPH", "RITCHIE", "ROANE",
    "SUMMERS", "TAYLOR", "TUCKER", "TYLER", "UPSHUR", "WAYNE", "WEBSTER",
    "WETZEL", "WIRT", "WOOD", "WYOMING",
}

VA_COUNTIES = {
    "ACCOMACK", "ALBEMARLE", "ALEXANDRIA", "ALLEGHANY", "AMELIA", "AMHERST",
    "APPOMATTOX", "AUGUSTA", "BATH", "BEDFORD", "BLAND", "BOTETOURT",
    "BRUNSWICK", "BUCHANAN", "BUCKINGHAM", "CAMPBELL", "CAROLINE", "CARROLL",
    "CHARLES CITY", "CHARLOTTE", "CHESTERFIELD", "CLARKE", "CRAIG",
    "CULPEPER", "CUMBERLAND", "DICKENSON", "DINWIDDIE", "ELIZABETH CITY",
    "ESSEX", "FAIRFAX", "FAUQUIER", "FLOYD", "FLUVANNA", "FRANKLIN",
    "FREDERICK", "GILES", "GLOUCESTER", "GOOCHLAND", "GRAYSON", "GREENE",
    "GREENSVILLE", "HALIFAX", "HANOVER", "HENRICO", "HENRY", "HIGHLAND",
    "ISLE OF WIGHT", "JAMES CITY", "KING AND QUEEN", "KING GEORGE",
    "KING WILLIAM", "LANCASTER", "LEE", "LOUDOUN", "LOUISA", "LUNENBURG",
    "MADISON", "MATHEWS", "MECKLENBURG", "MIDDLESEX", "MONTGOMERY",
    "NANSEMOND", "NELSON", "NEW KENT", "NORFOLK", "NORTHAMPTON",
    "NORTHUMBERLAND", "NOTTOWAY", "ORANGE", "PAGE", "PATRICK",
    "PITTSYLVANIA", "POWHATAN", "PRINCE EDWARD", "PRINCE GEORGE",
    "PRINCE WILLIAM", "PRINCESS ANNE", "PULASKI", "RAPPAHANNOCK", "RICHMOND",
    "ROANOKE", "ROCKBRIDGE", "ROCKINGHAM", "RUSSELL", "SCOTT", "SHENANDOAH",
    "SMYTH", "SOUTHAMPTON", "SPOTSYLVANIA", "STAFFORD", "SURRY", "SUSSEX",
    "TAZEWELL", "WARREN", "WARWICK", "WASHINGTON", "WESTMORELAND", "WISE",
    "WYTHE", "YORK",
}

ALL_COUNTIES = WV_COUNTIES | VA_COUNTIES

# R2b -- route agent markings filed under "county". A real philatelic
# category, not an error. Matched on substring after normalisation.
ROUTE_MARKERS = (
    "R. R.", "RAILROAD", "RIVER", " TO ", "BANK'S DIVISION", "RAIL ROAD",
)

# R2 -- names deliberately never auto-repaired (see RULES.md).
NEVER_REPAIR = {"GREENVILLE"}

# ------------------------------------------------------------------ workbook


def col_letters(ref: str) -> str:
    return "".join(c for c in ref if c.isalpha())


def load_sheet(z: zipfile.ZipFile):
    """Return {row_number: {column_letter: value}} for the single worksheet."""
    shared = []
    with z.open("xl/sharedStrings.xml") as fh:
        for _, el in ET.iterparse(fh, events=("end",)):
            if el.tag == NS + "si":
                shared.append("".join(t.text or "" for t in el.iter(NS + "t")))
                el.clear()

    rows = {}
    with z.open("xl/worksheets/sheet1.xml") as fh:
        for _, el in ET.iterparse(fh, events=("end",)):
            if el.tag != NS + "row":
                continue
            cells = {}
            for c in el.findall(NS + "c"):
                v = c.find(NS + "v")
                val = None
                if v is not None and v.text is not None:
                    val = shared[int(v.text)] if c.get("t") == "s" else v.text
                elif c.find(NS + "is") is not None:
                    val = "".join(t.text or "" for t in c.iter(NS + "t"))
                if val is not None:
                    val = str(val).strip()
                    if val:
                        cells[col_letters(c.get("r"))] = val
            if cells:
                rows[int(el.get("r"))] = cells
            el.clear()
    return rows


def find_tables(rows):
    """Locate the three stacked tables by their marker rows.

    Returns [(name, header_row, first_data_row, last_data_row), ...] rather
    than trusting hardcoded line numbers, so a re-issued workbook with rows
    added still extracts correctly.
    """
    markers = []
    for r in sorted(rows):
        a = (rows[r].get("A") or "").strip().lower()
        if re.fullmatch(r"(first|second|third|fourth|fifth) table", a):
            markers.append((r, a))
    if not markers:
        raise SystemExit("no '<n> table' marker rows found -- workbook shape changed")

    last_row = max(rows)
    out = []
    for i, (mrow, name) in enumerate(markers):
        header = mrow + 1
        start = header + 1
        end = markers[i + 1][0] - 1 if i + 1 < len(markers) else last_row
        out.append((name, header, start, end))
    return out


# ------------------------------------------------------------------ R1 dates


def serial_to_parts(raw: str):
    """Excel serial -> (month, day, two_digit_year). None if not a serial."""
    if not re.fullmatch(r"\d{3,6}", raw or ""):
        return None
    try:
        d = EXCEL_EPOCH + datetime.timedelta(days=int(raw))
    except (OverflowError, ValueError):
        return None
    return d.month, d.day, d.year % 100


CIRCA_RE = re.compile(r"^ca\.?\s*(\d{1,2})\s*$", re.I)
BARE_YEAR_RE = re.compile(r"^(\d{1,2})$")


def classify_date(raw: str):
    """R1/R1b. -> dict describing the reading, or None for an empty cell.

    Serial values carry `base_year` (the 1800s reading) and `yy`; the century
    is finalised later by resolve_centuries(), which needs the whole group.
    """
    raw = (raw or "").strip()
    if not raw:
        return None

    parts = serial_to_parts(raw)
    if parts:
        month, day, yy = parts
        return {
            "raw": raw, "kind": "serial", "month": month, "day": day, "yy": yy,
            "granularity": "DAY", "is_circa": False, "confidence": "high",
        }

    m = CIRCA_RE.match(raw)
    if m:
        return {
            "raw": raw, "kind": "circa", "month": None, "day": None,
            "yy": int(m.group(1)), "granularity": "YEAR", "is_circa": True,
            "confidence": "high",
        }

    m = BARE_YEAR_RE.match(raw)
    if m:
        return {
            "raw": raw, "kind": "bare_year", "month": None, "day": None,
            "yy": int(m.group(1)), "granularity": "YEAR", "is_circa": False,
            "confidence": "low",
        }

    return {
        "raw": raw, "kind": "vocab", "month": None, "day": None, "yy": None,
        "granularity": None, "is_circa": False, "confidence": None,
    }


def _as_tuple(year, rd):
    return (year, rd["month"] or 1, rd["day"] or 1)


def contiguous_groups(records, keyfunc):
    """Group records into *runs* of an equal key in source order.

    Grouping by key alone is wrong: several towns appear in more than one
    block of the sheet (Abingdon occupies T3 r15904-15915 and again
    r27075-27077), and merging those blocks produces a sequence that can
    never be monotonic, which defeats R1's century correction entirely.
    """
    out, cur, curkey = [], [], object()
    for rec in records:
        k = keyfunc(rec)
        if k != curkey:
            if cur:
                out.append((curkey, cur))
            cur, curkey = [], k
        cur.append(rec)
    if cur:
        out.append((curkey, cur))
    return out


def resolve_centuries(readings, window=None):
    """R1 step 3. Pick 1800+yy or 1700+yy per reading, keeping the group
    non-decreasing while using as few 1700s readings as possible.

    Small exact DP -- two states per item, so cost is linear and the result
    does not depend on scan direction (a greedy pass does).

    Mutates each reading in place, adding `year` and `century_inferred`.
    Returns True if a consistent assignment exists.
    """
    datable = [r for r in readings if r.get("yy") is not None]
    if not datable:
        return True

    # state 0 = 1800s, state 1 = 1700s. cost = number of 1700s picks, so the
    # 1800s reading wins unless something forces otherwise. R1c makes the
    # 1800s reading illegal past the era cliff; state 1 is always available.
    INF = float("inf")

    def legal(rd, s):
        year = (1700 if s else 1800) + rd["yy"]
        if s == 0 and year > ERA_MAX:          # R1c, hard
            return False
        if window and not (window[0] <= year <= window[1]):   # R1d, relaxable
            return False
        return True

    first = datable[0]
    cur = [(0, None) if legal(first, 0) else (INF, None),
           (1, None) if legal(first, 1) else (INF, None)]
    prev_vals = [_as_tuple(1800 + first["yy"], first), _as_tuple(1700 + first["yy"], first)]
    table = [cur]

    for rd in datable[1:]:
        vals = [_as_tuple(1800 + rd["yy"], rd), _as_tuple(1700 + rd["yy"], rd)]
        nxt = []
        for s in (0, 1):
            bestcost, bestback = INF, None
            if legal(rd, s):
                for p in (0, 1):
                    pcost = cur[p][0]
                    if pcost == INF:
                        continue
                    if prev_vals[p] <= vals[s] and pcost + s < bestcost:
                        bestcost, bestback = pcost + s, p
            nxt.append((bestcost, bestback))
        cur = nxt
        prev_vals = vals
        table.append(cur)

    end = min((0, 1), key=lambda s: cur[s][0])
    if cur[end][0] == INF:
        # No ordering-consistent assignment exists. Drop the *sequence*
        # constraint, never the town window -- the window is the stronger
        # evidence, and a run is usually unsolvable because the source row has
        # earliest and latest reversed (Abingdon #8 reads 1840..1823), not
        # because the window is wrong. Dropping the window instead produced
        # 1740 for that row and 1727 for Alexandria #22, both outside their
        # town's operating life.
        #
        # Precedence: era (hard) > town window > sequence.
        for rd in datable:
            for s in (0, 1):                     # prefer the 1800s reading
                if legal(rd, s):
                    rd["year"] = (1700 if s else 1800) + rd["yy"]
                    rd["century_inferred"] = bool(s)
                    break
            else:                                # window and era disagree
                use_1700 = (1800 + rd["yy"]) > ERA_MAX
                rd["year"] = (1700 if use_1700 else 1800) + rd["yy"]
                rd["century_inferred"] = use_1700
        return False

    picks = [0] * len(datable)
    s = end
    for i in range(len(datable) - 1, -1, -1):
        picks[i] = s
        s = table[i][s][1]
        if s is None:
            break
    for rd, p in zip(datable, picks):
        rd["year"] = (1700 if p else 1800) + rd["yy"]
        rd["century_inferred"] = bool(p)
    return True


def iso_date(rd):
    """Full ISO date when the reading has one, else ''."""
    if rd.get("year") is None or rd["granularity"] != "DAY":
        return ""
    try:
        return datetime.date(rd["year"], rd["month"], rd["day"]).isoformat()
    except ValueError:
        return ""


# ------------------------------------------------------- R2/R3/R4 normalising


def norm_county(raw: str):
    """R2. -> (canonical_name, status). status in
    ok | repaired | route | town_in_county | ambiguous | unknown | empty
    """
    if not raw:
        return "", "empty"
    s = re.sub(r"\s+", " ", raw.strip().upper())

    # The compiler's own county-change notes -- "FLUVANNA CO.  (NOW ALBEMARLE
    # CO.)", "PRESTON CO. (NOW W. VA.)". Strip the parenthetical first; it is
    # evidence for #92 but not part of the name. Must run before the "Co."
    # strip, since the suffix sits inside the note.
    s = re.sub(r"\s*\((?:NOW\b)?[^)]*\)\s*$", "", s).strip()

    # Trailing county suffix, including its OCR variants: CO. CO , CO . COL.
    # CQ. CP. COO GO.
    s = re.sub(r"[.,:;]*\s*[CG][O0][A-Z]?\s*[.,:;]*\s*$", "", s).strip()
    s = re.sub(r"[.,:;\u00b7]+$", "", s).strip()   # \u00b7 = middle dot

    if s in ALL_COUNTIES:
        return s, "ok"

    if any(k in s for k in ROUTE_MARKERS):
        return s, "route"

    # "GRAFTON, TAYLOR" -- a town qualified by its county. Take the county.
    if "," in s:
        tail = s.rsplit(",", 1)[1].strip()
        if tail in ALL_COUNTIES:
            return tail, "repaired"

    if s in NEVER_REPAIR:
        return s, "ambiguous"

    squashed = s.replace(" ", "").replace(".", "").replace("'", "").replace('"', "")
    for canon in ALL_COUNTIES:
        if squashed == canon.replace(" ", ""):
            return canon, "repaired"

    if len(squashed) >= 5:
        hits = difflib.get_close_matches(
            squashed, [c.replace(" ", "") for c in sorted(ALL_COUNTIES)],
            n=2, cutoff=0.85,
        )
        if len(hits) == 1 or (len(hits) == 2 and hits[0] != hits[1]
                              and difflib.SequenceMatcher(None, squashed, hits[0]).ratio()
                              - difflib.SequenceMatcher(None, squashed, hits[1]).ratio() > 0.05):
            for canon in ALL_COUNTIES:
                if canon.replace(" ", "") == hits[0]:
                    return canon, "repaired"
    return s, "unknown"


def build_town_windows(rows, t3_start, t3_end, min_records=3, back=15, fwd=20):
    """R1d. town_key -> (earliest_legal_year, latest_legal_year).

    A town's postmaster appointments bound when its post office could produce
    a marking, which is far better century evidence than sequence order alone.
    Without it the sequence rule over-reaches: Alexandria #22 was pushed to
    1727 though the town's postmasters begin in 1776, and Belmead Mills #2 to
    1761 though the town was only active 1861-1866.

    Resolved here on era + sequence only (markings cannot inform this pass, or
    the two would reason in a circle). Towns with fewer than `min_records`
    appointments are skipped -- too thin to trust as a bound.
    """
    recs = []
    for r in range(t3_start, t3_end + 1):
        c = rows.get(r)
        if not c or not c.get("B"):
            continue
        recs.append((town_key(c["B"]), classify_date(c.get("D"))))

    for _, group in contiguous_groups(recs, lambda x: x[0]):
        seq = [rd for _, rd in group if rd and rd["yy"] is not None]
        resolve_centuries(seq)

    years = collections.defaultdict(list)
    for tk, rd in recs:
        if rd and rd.get("year"):
            years[tk].append(rd["year"])
    return {tk: (min(v) - back, max(v) + fwd)
            for tk, v in years.items() if len(v) >= min_records}


def build_county_index(rows, ranges):
    """R2c. town_key -> the single canonical county it is named with.

    The sheet's supplement/errata blocks re-list towns with the county column
    left blank (T1 r6536+, T3 r27075+), so ~370 rows would otherwise be
    countyless and unroutable. Every one of those towns is named with its
    county in the main block. Towns that appear under two different counties
    are deliberately excluded -- those are #92's boundary-redraw cases and
    must not be silently collapsed.
    """
    seen = collections.defaultdict(set)
    for lo, hi in ranges:
        for r in range(lo, hi + 1):
            c = rows.get(r)
            if not c or not c.get("B"):
                continue
            county, status = norm_county(c.get("A"))
            if status in ("ok", "repaired"):
                seen[town_key(c.get("B"))].add(county)
    return {t: next(iter(v)) for t, v in seen.items() if len(v) == 1}, \
           {t: sorted(v) for t, v in seen.items() if len(v) > 1}


def state_for_county(county: str) -> str:
    """R3. The two canonical lists share no name, so this needs no tie-break."""
    if county in WV_COUNTIES:
        return "WV"
    if county in VA_COUNTIES:
        return "VA"
    return ""


def norm_town(raw: str) -> str:
    """R4 display form: uppercase, whitespace collapsed."""
    return re.sub(r"\s+", " ", (raw or "").strip().upper())


def town_key(raw: str) -> str:
    """R4 match key: punctuation and spacing removed."""
    return re.sub(r"[^A-Z0-9]", "", (raw or "").upper())


def slug(raw: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (raw or "").lower()).strip("-")
    return s or "unknown"


SIZE_CIRCLE = re.compile(r"^(\d+(?:\.\d+)?)\s*mm\.?$", re.I)
SIZE_RECT = re.compile(r"^(\d+(?:\.\d+)?)\s*[x\u00d7]\s*(\d+(?:\.\d+)?)\s*mm\.?$", re.I)  # \u00d7 = multiplication sign


def parse_size(raw: str):
    """R5. -> (width, height, status). status in ok | empty | unparsed."""
    s = re.sub(r"\s+", "", (raw or "")).strip()
    if not s:
        return "", "", "empty"
    m = SIZE_CIRCLE.match(s)
    if m:
        return m.group(1), m.group(1), "ok"
    m = SIZE_RECT.match(s)
    if m:
        return m.group(1), m.group(2), "ok"
    return "", "", "unparsed"


CLEAN_COLORS = {
    "BLACK": "BLACK", "RED": "RED", "BLUE": "BLUE", "GREEN": "GREEN",
    "BROWN": "BROWN", "ORANGE": "ORANGE", "MAGENTA": "MAGENTA",
    "YELLOW": "YELLOW", "VIOLET": "VIOLET", "GRAY": "GRAY", "GREY": "GRAY",
    "PURPLE": "PURPLE",
}

# R6b -- OCR damage on otherwise clean colour names.
COLOR_OCR = {
    "BLAOK": "BLACK", "BLAGK": "BLACK", "YE11OW": "YELLOW", "YELL0W": "YELLOW",
    "ORANG": "ORANGE", "B1ACK": "BLACK", "RE0": "RED", "B1UE": "BLUE",
}


def norm_color(raw: str):
    """R6. -> (canonical, status). status in ok | empty | repaired | vocab."""
    s = re.sub(r"\s+", "", (raw or "")).upper()
    if not s:
        return "", "empty"
    if s in CLEAN_COLORS:
        return CLEAN_COLORS[s], "ok"
    if s in COLOR_OCR:
        return COLOR_OCR[s], "repaired"
    return s, "vocab"


def is_color_like(raw: str) -> bool:
    s = re.sub(r"\s+", "", (raw or "")).upper()
    return s in CLEAN_COLORS or s in COLOR_OCR


def detect_column_shift(cells):
    """R6c. Ten T1 rows have columns G-J shifted one place left: the colour
    sits in Size and a date serial sits in Colour, which silently destroys
    both dates (e.g. T1:r3612 Monterey #6 -- size='Black', colour=22508).

    Detect on the unambiguous signature -- Size holds a colour name AND
    Colour holds a date serial -- and shift back. Returns a corrected
    (size, color, earliest, latest) or None.
    """
    g, h, i, j = (cells.get(k) or "" for k in "GHIJ")
    if is_color_like(g) and serial_to_parts(h):
        return "", g, h, i or j
    return None


MANUSCRIPT_RE = re.compile(r"^\s*ms\b|^\s*ms\.", re.I)
CONTROL_WORDS = {
    "DISCONTINUED": "discontinued",
    "REAPPOINTED": "reappointment",
    "RE-APPOINTED": "reappointment",
    "?": "unknown",
}


# ---------------------------------------------------------------------- write


def write_csv(path, fieldnames, rows):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ----------------------------------------------------------------------- main


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--xlsx", default=os.path.join(WIP, "in", "VPHS_COMPLETE_BOOK_DONE.xlsx"))
    ap.add_argument("--out", default=os.path.join(WIP, "out", "vphc"))
    ap.add_argument("--no-images", action="store_true",
                    help="skip writing the 4,304 PNGs (CSVs and manifest still emitted)")
    args = ap.parse_args()

    extract = os.path.join(args.out, "extract")
    unresolved = os.path.join(args.out, "unresolved")
    media = os.path.join(extract, "media")
    for d in (extract, unresolved, media):
        os.makedirs(d, exist_ok=True)

    z = zipfile.ZipFile(args.xlsx)
    rows = load_sheet(z)
    tables = find_tables(rows)
    if len(tables) != 3:
        print(f"warning: expected 3 tables, found {len(tables)}", file=sys.stderr)
    (_, _, t1_start, t1_end), (_, _, t2_start, t2_end), (_, _, t3_start, t3_end) = tables[:3]

    quarantine = collections.defaultdict(list)   # reason code -> rows
    stats = collections.Counter()

    # R2c -- built across T1 and T3 together so a countyless supplement row in
    # either table can borrow from wherever the town is properly named.
    county_index, county_conflicts = build_county_index(
        rows, [(t1_start, t1_end), (t3_start, t3_end)])
    stats["towns_with_single_county"] = len(county_index)
    stats["towns_with_multiple_counties"] = len(county_conflicts)
    for t, cs in sorted(county_conflicts.items()):
        quarantine["county_conflict"].append(
            {"src": "", "value": " | ".join(cs), "town": t, "rule": "R2c",
             "note": "town named under more than one county -- #92 candidate"})

    def resolve_county(raw, town, quarantine_key_src):
        """-> (county, state, status). Applies R2 then the R2c backfill."""
        county, status = norm_county(raw)
        if status in ("ok", "repaired"):
            return county, state_for_county(county), status
        backfill = county_index.get(town_key(town))
        if backfill:
            return backfill, state_for_county(backfill), "backfilled"
        reason = {"route": "route_agent", "ambiguous": "county_ambiguous"}.get(
            status, "county_unknown")
        if status != "empty" and town_key(raw) in known_town_keys:
            reason = "county_is_town"
        quarantine[reason].append(
            {"src": quarantine_key_src, "value": raw or "", "town": town, "rule": "R2"})
        return county, "", status

    known_town_keys = set()
    for lo, hi in ((t1_start, t1_end), (t3_start, t3_end)):
        for r in range(lo, hi + 1):
            c = rows.get(r)
            if c and c.get("B"):
                known_town_keys.add(town_key(c["B"]))

    # ---------------------------------------------------------------- T1
    t1_raw = []
    for r in range(t1_start, t1_end + 1):
        c = rows.get(r)
        if not c or not (c.get("A") or c.get("B")):
            continue
        town = norm_town(c.get("B"))
        county, state, cstatus = resolve_county(c.get("A"), town, f"T1:r{r}")

        shift = detect_column_shift(c)
        if shift:
            size_raw, color_raw, earliest_raw, latest_raw = shift
            stats["t1_column_shift_repaired"] += 1
            quarantine["column_shift"].append(
                {"src": f"T1:r{r}", "value": f'G={c.get("G")} H={c.get("H")} I={c.get("I")}',
                 "town": town, "rule": "R6c",
                 "note": f"shifted back to size={size_raw!r} color={color_raw!r} "
                         f"earliest={earliest_raw!r} latest={latest_raw!r}"})
        else:
            size_raw = c.get("G") or ""
            color_raw = c.get("H") or ""
            earliest_raw = c.get("I") or ""
            latest_raw = c.get("J") or ""

        width, height, sstatus = parse_size(size_raw)
        color, colstatus = norm_color(color_raw)
        rec = {
            "src": f"T1:r{r}",
            "county_raw": c.get("A") or "", "county": county, "county_status": cstatus,
            "state": state,
            "town_raw": c.get("B") or "", "town": town, "town_key": town_key(town),
            "population": c.get("C") or "",
            "cancel_no": c.get("D") or "",
            "cancel": c.get("E") or "",
            "cancel_detail": c.get("F") or "",
            "size_raw": size_raw, "width": width, "height": height,
            "size_status": sstatus,
            "color_raw": color_raw, "color": color, "color_status": colstatus,
            "is_manuscript": bool(MANUSCRIPT_RE.match(c.get("E") or "")),
            "column_shift": "true" if shift else "",
            "_earliest": classify_date(earliest_raw),
            "_latest": classify_date(latest_raw),
            "earliest_raw": earliest_raw, "latest_raw": latest_raw,
        }
        t1_raw.append(rec)
        stats["t1_rows"] += 1
        stats[f"t1_county_{cstatus}"] += 1
        if sstatus == "unparsed":
            quarantine["size_unparsed"].append(
                {"src": rec["src"], "value": size_raw, "town": town, "rule": "R5"})
        if colstatus == "vocab":
            quarantine["color_vocab"].append(
                {"src": rec["src"], "value": c.get("H"), "town": town, "rule": "R6"})

    # R1 steps 3-4, over contiguous runs of (town, cancel #) in source order,
    # bounded by the town's postmaster window where one is trustworthy.
    town_windows = build_town_windows(rows, t3_start, t3_end)
    stats["towns_with_date_window"] = len(town_windows)
    for key, recs in contiguous_groups(
            t1_raw, lambda r: (r["town_key"], r["cancel_no"])):
        seq = []
        for rec in recs:
            for slot in ("_earliest", "_latest"):
                rd = rec[slot]
                if rd and rd["yy"] is not None:
                    seq.append(rd)
        if not resolve_centuries(seq, town_windows.get(key[0])):
            stats["t1_date_groups_inconsistent"] += 1
            for rec in recs:
                quarantine["dates"].append({
                    "src": rec["src"], "value": f'{rec["earliest_raw"]}|{rec["latest_raw"]}',
                    "town": rec["town"], "rule": "R1",
                    "note": "no consistent century assignment for this cancel group"})
        if len(seq) == 1:
            seq[0]["confidence"] = "low"

    t1_out = []
    for rec in t1_raw:
        e, l = rec.pop("_earliest"), rec.pop("_latest")
        for slot, rd in (("earliest", e), ("latest", l)):
            if rd is None:
                rec[f"{slot}_date"] = ""
                rec[f"{slot}_year"] = ""
                rec[f"{slot}_granularity"] = ""
                rec[f"{slot}_circa"] = ""
                rec[f"{slot}_century_inferred"] = ""
                rec[f"{slot}_confidence"] = ""
                continue
            if rd["kind"] == "vocab":
                rec[f"{slot}_date"] = ""
                rec[f"{slot}_year"] = ""
                rec[f"{slot}_granularity"] = ""
                rec[f"{slot}_circa"] = ""
                rec[f"{slot}_century_inferred"] = ""
                rec[f"{slot}_confidence"] = "vocab"
                quarantine["date_vocab"].append(
                    {"src": rec["src"], "value": rd["raw"], "town": rec["town"], "rule": "R1b"})
                continue
            year = rd.get("year")
            rec[f"{slot}_date"] = iso_date(rd)
            rec[f"{slot}_year"] = year or ""
            rec[f"{slot}_granularity"] = rd["granularity"] or ""
            rec[f"{slot}_circa"] = "true" if rd["is_circa"] else ""
            rec[f"{slot}_century_inferred"] = "true" if rd.get("century_inferred") else ""
            rec[f"{slot}_confidence"] = rd["confidence"] or ""
            if year and not (ERA_MIN <= year <= ERA_MAX):
                quarantine["dates"].append(
                    {"src": rec["src"], "value": rd["raw"], "town": rec["town"],
                     "rule": "R1", "note": f"resolved year {year} outside {ERA_MIN}-{ERA_MAX}"})
            if rd.get("century_inferred"):
                stats["t1_century_inferred"] += 1
        ey, ly = rec.get("earliest_year"), rec.get("latest_year")
        if ey and ly and int(ey) > int(ly):
            stats["t1_earliest_after_latest"] += 1
            quarantine["dates_reversed"].append(
                {"src": rec["src"], "value": f"{rec['earliest_raw']} .. {rec['latest_raw']}",
                 "town": rec["town"], "rule": "R1",
                 "note": f"earliest {ey} is after latest {ly} -- columns I/J look swapped"})
        if rec["state"]:
            stats[f"t1_{rec['state']}"] += 1
        if rec["is_manuscript"]:
            stats["t1_manuscript"] += 1
        rec["is_manuscript"] = "true" if rec["is_manuscript"] else ""
        rec["marking_code"] = (
            f'VPHC-{rec["state"]}-{slug(rec["town"]).upper()}-{rec["cancel_no"]}'
            if rec["state"] and rec["cancel_no"] else ""
        )
        t1_out.append(rec)

    # The sheet's supplement/errata blocks re-list 854 markings that already
    # appear in the main block, and the later listing revises the earlier one
    # (Abingdon #1 gains a later latest-use; #24 has its "CSA" resolved into
    # real dates). Number the occurrences so Phase 3 merges rather than
    # creating a second marking.
    occ_pos = collections.defaultdict(list)
    for i, rec in enumerate(t1_out):
        if rec["cancel_no"]:
            occ_pos[(rec["town_key"], rec["cancel_no"])].append(i)
    for key, idxs in occ_pos.items():
        blocks, prev = [], None
        for i in idxs:                       # collapse contiguous runs
            if prev is None or i != prev + 1:
                blocks.append([])
            blocks[-1].append(i)
            prev = i
        for bno, block in enumerate(blocks, start=1):
            for i in block:
                t1_out[i]["occurrence"] = bno
                t1_out[i]["occurrences"] = len(blocks)
        if len(blocks) > 1:
            stats["t1_markings_relisted_in_errata"] += 1
    for rec in t1_out:
        rec.setdefault("occurrence", "")
        rec.setdefault("occurrences", "")

    t1_fields = [
        "src", "state", "county", "county_raw", "county_status", "town", "town_raw",
        "town_key", "population", "cancel_no", "marking_code",
        "occurrence", "occurrences", "cancel", "cancel_detail",
        "is_manuscript", "column_shift", "size_raw", "width", "height", "size_status",
        "color_raw", "color", "color_status",
        "earliest_raw", "earliest_date", "earliest_year", "earliest_granularity",
        "earliest_circa", "earliest_century_inferred", "earliest_confidence",
        "latest_raw", "latest_date", "latest_year", "latest_granularity",
        "latest_circa", "latest_century_inferred", "latest_confidence",
    ]
    write_csv(os.path.join(extract, "t1_markings.csv"), t1_fields, t1_out)
    stats["t1_markings_distinct"] = len(
        {(r["town_key"], r["cancel_no"]) for r in t1_out if r["cancel_no"]})

    # ---------------------------------------------------------------- T2
    rels = {c.get("Id"): c.get("Target")
            for c in ET.fromstring(z.read("xl/drawings/_rels/drawing1.xml.rels"))}
    drawing = ET.fromstring(z.read("xl/drawings/drawing1.xml"))
    by_row = collections.defaultdict(list)
    for child in drawing:
        frm = child.find(XDR + "from")
        if frm is None:
            continue
        row_1based = int(frm.find(XDR + "row").text) + 1
        embed = None
        for blip in child.iter(DML + "blip"):
            embed = blip.get(REL + "embed")
        target = rels.get(embed)
        if target:
            by_row[row_1based].append(target)
    stats["anchors"] = sum(len(v) for v in by_row.values())
    stats["anchor_rows"] = len(by_row)

    t1_keys = {(r["town_key"], r["cancel_no"]) for r in t1_out if r["cancel_no"]}
    t1_state = {}
    for r in t1_out:
        t1_state.setdefault((r["town_key"], r["cancel_no"]), r["state"])

    t2_out = []
    seen_media = {}
    for r in range(t2_start, t2_end + 1):
        c = rows.get(r)
        if not c or not (c.get("A") or c.get("B")):
            continue
        county, cstatus = norm_county(c.get("A"))
        town = norm_town(c.get("B"))
        tk = town_key(town)
        cancel_no = c.get("C") or ""
        state = t1_state.get((tk, cancel_no)) or state_for_county(county)
        targets = by_row.get(r, [])
        stats["t2_rows"] += 1
        if not targets:
            stats["t2_rows_without_image"] += 1
            quarantine["images_missing"].append(
                {"src": f"T2:r{r}", "value": "", "town": town, "rule": "R8",
                 "note": "T2 data row carries no image anchor"})
        joined = (tk, cancel_no) in t1_keys
        if not joined:
            quarantine["images_orphan"].append(
                {"src": f"T2:r{r}", "value": f"{town} #{cancel_no}", "town": town,
                 "rule": "R8", "note": "no matching (town, cancel #) in T1"})
        for i, target in enumerate(targets):
            member = "xl/" + target.replace("../", "")
            ext = os.path.splitext(member)[1].lower()
            # The source row is part of the name. Without it 70 names collide:
            # the errata block re-lists a marking with a *different* image
            # (Alexandria #54 at r9827 and again at r14387), and some cancels
            # carry two images on adjacent rows. Row-unique also means the
            # filename is itself a pointer back into the sheet.
            suffix = f"-{i + 1}" if len(targets) > 1 else ""
            fname = (f"vphc-{(state or 'xx').lower()}-{slug(town)}-"
                     f"{slug(cancel_no) or 'na'}-r{r}{suffix}{ext}")
            if not args.no_images:
                data = z.read(member)
                with open(os.path.join(media, fname), "wb") as fh:
                    fh.write(data)
                digest = hashlib.sha256(data).hexdigest()
            else:
                digest = ""
            seen_media.setdefault(target, []).append(fname)
            t2_out.append({
                "src": f"T2:r{r}", "state": state, "county": county,
                "town": town, "town_key": tk, "cancel_no": cancel_no,
                "marking_code": (f"VPHC-{state}-{slug(town).upper()}-{cancel_no}"
                                 if state and cancel_no else ""),
                "image_file": fname, "xlsx_member": member,
                "sha256": digest, "joins_t1": "true" if joined else "",
            })
            stats["images_written"] += 1

    write_csv(os.path.join(extract, "t2_images.csv"),
              ["src", "state", "county", "town", "town_key", "cancel_no",
               "marking_code", "image_file", "xlsx_member", "sha256", "joins_t1"],
              t2_out)
    stats["images_reused_across_rows"] = sum(1 for v in seen_media.values() if len(v) > 1)

    # ---------------------------------------------------------------- T3
    t3_raw = []
    for r in range(t3_start, t3_end + 1):
        c = rows.get(r)
        if not c or not (c.get("A") or c.get("B")):
            continue
        town = norm_town(c.get("B"))
        county, state, cstatus = resolve_county(c.get("A"), town, f"T3:r{r}")
        name = (c.get("C") or "").strip()
        control = CONTROL_WORDS.get(re.sub(r"\s+", " ", name).upper())
        rec = {
            "src": f"T3:r{r}",
            "county_raw": c.get("A") or "", "county": county, "county_status": cstatus,
            "state": state,
            "town_raw": c.get("B") or "", "town": town, "town_key": town_key(town),
            "postmaster_raw": name,
            "postmaster": "" if control else name,
            "event": control or "appointment",
            "appointed_raw": c.get("D") or "",
            "_date": classify_date(c.get("D")),
        }
        t3_raw.append(rec)
        stats["t3_rows"] += 1
        stats[f"t3_county_{cstatus}"] += 1
        if control:
            stats[f"t3_{control}"] += 1

    for tk, recs in contiguous_groups(t3_raw, lambda r: r["town_key"]):
        seq = [rec["_date"] for rec in recs if rec["_date"] and rec["_date"]["yy"] is not None]
        if not resolve_centuries(seq):
            stats["t3_date_groups_inconsistent"] += 1
            for rec in recs:
                quarantine["dates"].append({
                    "src": rec["src"], "value": rec["appointed_raw"], "town": rec["town"],
                    "rule": "R1", "note": "no consistent century assignment for this town"})
        if len(seq) == 1:
            seq[0]["confidence"] = "low"

    t3_out = []
    for rec in t3_raw:
        rd = rec.pop("_date")
        if rd is None or rd["kind"] == "vocab":
            rec.update(appointed_date="", appointed_year="", appointed_granularity="",
                       appointed_circa="", century_inferred="",
                       date_confidence="vocab" if rd else "")
            if rd:
                quarantine["date_vocab"].append(
                    {"src": rec["src"], "value": rd["raw"], "town": rec["town"], "rule": "R1b"})
        else:
            year = rd.get("year")
            rec.update(
                appointed_date=iso_date(rd), appointed_year=year or "",
                appointed_granularity=rd["granularity"] or "",
                appointed_circa="true" if rd["is_circa"] else "",
                century_inferred="true" if rd.get("century_inferred") else "",
                date_confidence=rd["confidence"] or "")
            if rd.get("century_inferred"):
                stats["t3_century_inferred"] += 1
            if year and not (ERA_MIN <= year <= ERA_MAX):
                quarantine["dates"].append(
                    {"src": rec["src"], "value": rd["raw"], "town": rec["town"],
                     "rule": "R1", "note": f"resolved year {year} outside {ERA_MIN}-{ERA_MAX}"})
        if rec["state"]:
            stats[f"t3_{rec['state']}"] += 1
        t3_out.append(rec)

    write_csv(os.path.join(extract, "t3_postmasters.csv"),
              ["src", "state", "county", "county_raw", "county_status", "town", "town_raw",
               "town_key", "postmaster", "postmaster_raw", "event", "appointed_raw",
               "appointed_date", "appointed_year", "appointed_granularity",
               "appointed_circa", "century_inferred", "date_confidence"],
              t3_out)
    stats["t3_postmasters_distinct"] = len({r["postmaster"] for r in t3_out if r["postmaster"]})

    # --------------------------------------------------------- unresolved/
    for reason, items in sorted(quarantine.items()):
        fields = ["src", "value", "town", "rule", "note"]
        for it in items:
            it.setdefault("note", "")
        write_csv(os.path.join(unresolved, f"{reason}.csv"), fields,
                  sorted(items, key=lambda x: x["src"]))
        stats[f"unresolved_{reason}"] = len(items)

    # ------------------------------------------------------------ manifest
    files = {}
    for root, _, names in os.walk(extract):
        for n in sorted(names):
            if n == "manifest.json":
                continue
            p = os.path.join(root, n)
            files[os.path.relpath(p, extract).replace(os.sep, "/")] = sha256_file(p)
    for n in sorted(os.listdir(unresolved)):
        p = os.path.join(unresolved, n)
        if os.path.isfile(p):
            files["../unresolved/" + n] = sha256_file(p)

    manifest = {
        "rules_version": RULES_VERSION,
        "source": {
            "path": os.path.basename(args.xlsx),
            "sha256": sha256_file(args.xlsx),
            "sheet_rows": max(rows),
            "tables": [{"name": n, "header_row": h, "first": s, "last": e}
                       for n, h, s, e in tables],
        },
        "stats": dict(sorted(stats.items())),
        "files": dict(sorted(files.items())),
        "generated_at": datetime.datetime.now(datetime.timezone.utc)
                        .replace(microsecond=0).isoformat(),
    }
    with open(os.path.join(extract, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=False)
        fh.write("\n")

    print(f"tables: {[(n, s, e) for n, _, s, e in tables]}")
    width = max(len(k) for k in stats)
    for k, v in sorted(stats.items()):
        print(f"  {k:<{width}}  {v}")
    print(f"\n{len(files)} files under {extract} and {unresolved}")


if __name__ == "__main__":
    main()
