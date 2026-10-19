#!/usr/bin/env python3
"""vphc_aux_census.py -- count VPHC scans that carry more than one device.

Issue #104 (C2). Some VPHC scans show two postal devices where the catalog
knows one marking -- vphc-va-lynchburg-33-r12145.png is a "PAID" handstamp
above a "10" ratemark. The acceptance criteria require the affected population
be COUNTED, not estimated.

Method: pixel geometry, deliberately NOT aspect-ratio screening against the
catalogued width/height. Catalogued dimensions are swamped by manuscripts,
which carry a default 31x31 size; this reads the actual scans instead and
never consults the catalogue, so that trap does not apply.

Per image:
  - composite onto white (the media are RGBA/P; a naive .convert("L") would
    turn a transparent background black on any file that actually uses alpha);
  - binarize to a dark mask;
  - ROW profile  -> blocks separated by blank-row runs  = stacked devices
                    (the Lynchburg case: PAID *above* 10);
  - COL profile  -> groups separated by blank-col runs  = side-by-side devices.

The geometry is ported from tools/ascc_image_extract.py
(_column_candidates :499, _narrow_dark_runs :293, _find_fine_blank_gap :260)
and find_blocks in ascc_page_processor.py:752. It is re-implemented rather
than imported: that module is coupled to the ASCC chunk/CSV pipeline, and its
constants are tuned for full catalog pages
(MERGE_GAP_MAX=40, MIN_MARKING_WIDTH=30, EDGE_ZONE_PX=50). VPHC scans are
single markings with a median size of 223x90, so an EDGE_ZONE of 50px would
swallow an entire 60px-wide image.

This is a SCREEN, not an oracle. It emits a candidate set plus the metrics
that drove each call; a hand-verified sample establishes the precision.
The Phase 4 report that sampled it stayed in the ingest workspace.

Usage:
    uv run python tools/vphc_aux_census.py             # Pillow + numpy (dev group)
    uv run python tools/vphc_aux_census.py --summary

Deterministic: files are processed in sorted order and no randomness is used,
so two runs produce byte-identical output.
"""

import argparse
import csv
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# --- Binarisation -----------------------------------------------------------
# Mirrors ascc_image_extract's COL_DARK_BRIGHTNESS_MAX.
DARK_BRIGHTNESS_MAX = 180

# --- Line-level noise floor -------------------------------------------------
# A row/column counts as "blank" when it holds at most this many dark pixels.
# Not zero: exemplar -37- has a single stray dark pixel sitting in the middle
# of the gap between the oval and the "PAID.", which a strict zero test would
# split into two useless 5-row and 2-row gaps.
LINE_NOISE_MAX_PX = 1

# --- Gap thresholds ---------------------------------------------------------
# Blank run needed to separate two devices.
#
# The ROW axis is the reliable one and carries the verdict. A single marking
# is one horizontal band of ink: the control (abingdon-1) has NO interior
# blank rows at all, while exemplar -33- separates its PAID from its 10 with a
# 4-row gap in a 57-row image. A sweep over a 600-file sample is flat and
# well-behaved here (9.7% at 3, 8.2% at 4, 6.3% at 5).
MIN_ROW_GAP = 3
#
# The COLUMN axis is NOT reliable and is reported as a secondary signal only.
# A single postmark has wide word spacing -- "ABINGDON  VA.  DEC 2" leaves an
# 8-blank-column gap inside one device -- so the same sweep has no knee: 34%
# of the sample flags at gap 6, 20% at 10, 13% at 14. Set conservatively so
# that what it does flag is worth a human look, and kept out of the headline
# count. ascc_image_extract hit the same wall and answered it with
# MERGE_GAP_MAX=40 on ~1000px-wide pages; 22 is that rule at VPHC's scale
# (median width 223).
MIN_COL_GAP = 22

# --- Block survival ---------------------------------------------------------
# A surviving block must be thicker than this and carry this many dark pixels,
# else it is a speck (exemplar -37- has a 3-dark-pixel row at y=6, well clear
# of the real content, that would otherwise register as a device).
MIN_BLOCK_THICKNESS_PX = 3
MIN_BLOCK_DARK_PX = 20

# Known #108 cases: the book's figure number is baked into the scan. These are
# a DIFFERENT defect from #104 and must not inflate its count. Detection by
# geometry is not reliable -- a caption digit and a small "PAID." handstamp
# look alike to a size test -- so the known list is labelled by hand instead.
FIGURE_NUMBER_CANCEL_NOS = {5, 12, 19, 20, 22, 24, 31, 34}
FIGURE_NUMBER_TOWN = "lynchburg"

# Known two-pictures-on-one-anchored-row cases. Already ruled out as the cause
# of #104 (5 rows / 10 files); excluded so they cannot double-count.
TWO_PICTURE_TOWNS = {
    "batesville", "boston", "christiansville", "danville", "shackleford's",
    "shacklefords",
}

VPHC_OUT = Path(__file__).resolve().parent / "wip" / "out" / "vphc"
DEFAULT_MEDIA = VPHC_OUT / "extract" / "media"
DEFAULT_CSV = VPHC_OUT / "extract" / "t2_images.csv"
DEFAULT_T1 = VPHC_OUT / "extract" / "t1_markings.csv"
DEFAULT_OUT = VPHC_OUT / "aux_census.csv"


def load_dark_mask(path):
    """Return (dark_mask, width, height) for one scan.

    Composites onto white before greyscaling so a transparent background can
    never read as ink.
    """
    with Image.open(path) as im:
        im.load()
        if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
            rgba = im.convert("RGBA")
            bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
            flat = Image.alpha_composite(bg, rgba)
        else:
            flat = im
        gray = np.array(flat.convert("L"))
    return gray < DARK_BRIGHTNESS_MAX, gray.shape[1], gray.shape[0]


def _blocks(profile, min_gap):
    """Group a 1-D dark-count profile into content blocks.

    A line is blank when its dark count is <= LINE_NOISE_MAX_PX. Blocks are
    separated by blank runs of at least `min_gap`. Returns a list of
    (start, end_inclusive, dark_total) and the list of interior gap lengths.
    """
    n = len(profile)
    blank = profile <= LINE_NOISE_MAX_PX

    # Contiguous non-blank spans first.
    spans = []
    start = None
    for i in range(n):
        if not blank[i]:
            if start is None:
                start = i
        elif start is not None:
            spans.append([start, i - 1])
            start = None
    if start is not None:
        spans.append([start, n - 1])

    if not spans:
        return [], []

    # Merge spans separated by a gap smaller than min_gap -- those are internal
    # to one device (letter spacing, the break inside a circular datestamp).
    merged = [spans[0]]
    interior_gaps = []
    for span in spans[1:]:
        gap = span[0] - merged[-1][1] - 1
        if gap < min_gap:
            merged[-1][1] = span[1]
        else:
            interior_gaps.append(gap)
            merged.append(span)

    out = []
    for lo, hi in merged:
        dark_total = int(profile[lo:hi + 1].sum())
        thickness = hi - lo + 1
        if thickness < MIN_BLOCK_THICKNESS_PX or dark_total < MIN_BLOCK_DARK_PX:
            continue
        out.append((lo, hi, dark_total))
    return out, interior_gaps


def analyse(path):
    dark, w, h = load_dark_mask(path)
    row_blocks, row_gaps = _blocks(dark.sum(axis=1), MIN_ROW_GAP)
    col_blocks, col_gaps = _blocks(dark.sum(axis=0), MIN_COL_GAP)

    stacked = len(row_blocks) >= 2
    side_by_side = len(col_blocks) >= 2

    # Size ratio of the smallest surviving block to the largest, on whichever
    # axis did the splitting. Recorded, NOT used to decide: exemplar -37-'s
    # genuine "PAID." device is only ~5% of its oval, so a size test would
    # wrongly demote it to a caption.
    blocks = row_blocks if stacked else col_blocks
    if len(blocks) >= 2:
        totals = sorted(b[2] for b in blocks)
        ratio = totals[0] / totals[-1]
    else:
        ratio = 1.0

    # Rows carry the verdict; columns only raise a scan for review. See the
    # MIN_COL_GAP note -- the column axis cannot separate a second device from
    # ordinary word spacing, so it must not drive the headline count.
    if stacked:
        verdict = "multi"
    elif side_by_side:
        verdict = "review"
    else:
        verdict = "single"

    return {
        "width": w,
        "height": h,
        "v_blocks": len(row_blocks),
        "h_groups": len(col_blocks),
        "devices": max(len(row_blocks), len(col_blocks)),
        "max_row_gap": max(row_gaps) if row_gaps else 0,
        "max_col_gap": max(col_gaps) if col_gaps else 0,
        "min_max_block_ratio": round(ratio, 4),
        "verdict": verdict,
    }


def parse_filename(name):
    """vphc-va-lynchburg-33-r12145.png -> (town, cancel_no)."""
    stem = Path(name).stem
    parts = stem.split("-")
    cancel = None
    town_parts = []
    # parts[0]='vphc', parts[1]=state, then town..., cancel_no, rNNNN
    for p in parts[2:]:
        if p.startswith("r") and p[1:].isdigit():
            continue
        if p.isdigit():
            cancel = int(p)
        else:
            town_parts.append(p)
    return "-".join(town_parts), cancel


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--media-dir", type=Path, default=DEFAULT_MEDIA)
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV,
                    help="t2_images.csv, for src/marking_code join")
    ap.add_argument("--t1", type=Path, default=DEFAULT_T1,
                    help="t1_markings.csv, for the is_manuscript join")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--summary", action="store_true",
                    help="print the distribution instead of only writing the CSV")
    args = ap.parse_args(argv)

    if not args.media_dir.is_dir():
        sys.exit(f"media dir not found: {args.media_dir}")

    # Join key: image_file -> (src, marking_code, listing key)
    meta = {}
    if args.csv.is_file():
        with args.csv.open(newline="") as fh:
            for row in csv.DictReader(fh):
                meta[row["image_file"]] = (
                    row.get("src", ""),
                    row.get("marking_code", ""),
                    (row.get("town_key", ""), row.get("cancel_no", ""),
                     row.get("state", "")),
                )

    # is_manuscript is the single most important discriminator here: a
    # handwritten town marking is routinely written on two lines ("Broad Run
    # Station" over "March 21st"), which the row profile cannot tell apart
    # from a genuine second device. VPHC records it as "true" or empty.
    manuscript = {}
    if args.t1.is_file():
        with args.t1.open(newline="") as fh:
            for row in csv.DictReader(fh):
                key = (row["town_key"], row["cancel_no"], row["state"])
                manuscript.setdefault(key, row.get("is_manuscript", ""))

    files = sorted(args.media_dir.glob("*.png"))
    rows = []
    errors = []
    for path in files:
        try:
            rec = analyse(path)
        except Exception as exc:               # noqa: BLE001 - reported, not raised
            errors.append((path.name, str(exc)))
            continue
        town, cancel = parse_filename(path.name)
        src, code, listing = meta.get(path.name, ("", "", None))
        is_ms = manuscript.get(listing) if listing else None
        rec.update({
            "image_file": path.name,
            "src": src,
            "marking_code": code,
            "is_manuscript": ("unjoined" if is_ms is None
                              else ("true" if is_ms == "true" else "false")),
            "known_figure_number": (town == FIGURE_NUMBER_TOWN
                                    and cancel in FIGURE_NUMBER_CANCEL_NOS),
            "known_two_picture_town": town in TWO_PICTURE_TOWNS,
        })
        rows.append(rec)

    cols = ["image_file", "src", "marking_code", "is_manuscript",
            "width", "height",
            "v_blocks", "h_groups", "devices", "max_row_gap", "max_col_gap",
            "min_max_block_ratio", "known_figure_number",
            "known_two_picture_town", "verdict"]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=cols)
        writer.writeheader()
        for rec in rows:
            writer.writerow({c: rec[c] for c in cols})

    multi = [r for r in rows if r["verdict"] == "multi"]
    review = [r for r in rows if r["verdict"] == "review"]
    single = [r for r in rows if r["verdict"] == "single"]
    fig = [r for r in multi if r["known_figure_number"]]
    two_pic = [r for r in multi if r["known_two_picture_town"]]
    print(f"scanned            : {len(rows)}")
    print(f"read errors        : {len(errors)}")
    print(f"single             : {len(single)}")
    nm_multi = [r for r in multi if r["is_manuscript"] == "false"]
    print(f"multi  (stacked)   : {len(multi)}")
    print(f"  manuscript  : {sum(1 for r in multi if r['is_manuscript']=='true')}"
          "   <- two-line handwriting, NOT a second device")
    print(f"  unjoined    : {sum(1 for r in multi if r['is_manuscript']=='unjoined')}")
    print(f"  NON-manuscript : {len(nm_multi)}   <- the #104 review set")
    print(f"  of which known #108 figure-number scans : {len(fig)}")
    print(f"  of which in known two-picture towns     : {len(two_pic)}")
    print(f"review (side-by-side, column axis only)  : {len(review)}")
    print(f"wrote              : {args.out}")
    for name, msg in errors:
        print(f"  ERROR {name}: {msg}", file=sys.stderr)

    if args.summary:
        from collections import Counter
        print("\ndevices per scan:",
              dict(sorted(Counter(r["devices"] for r in rows).items())))
        print("multi by town:")
        counts = Counter(parse_filename(r["image_file"])[0] for r in multi)
        for town, n in counts.most_common(15):
            print(f"  {town:24s} {n}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
