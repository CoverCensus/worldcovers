#!/usr/bin/env python3
"""
VPHC Phase 6 -- the manuscript half, as a create-only ledger.

Phases 2-5 deliberately excluded T1's 3,884 manuscript rows because handwritten
markings have no printed inscription, no size and no shape, so *matching* them
against production's existing manuscript records was judged unreliable. Reese
settled that on 2026-08-27: **each manuscript lands as its own catalog row.**
Nothing is matched, so nothing can be mismatched, and the whole I-rule identity
ladder (I1-I5, and the E-rules that depend on it) drops out.

What is left is a create-only pass, so this tool is deliberately much smaller
than vphc_crossexam.py. It reuses that file's vocabularies and flag/comment
helpers rather than restating them, and reads only CSVs already on disk.
**No database is touched and there is no --apply.**

    tools/wip/out/vphc/extract/     Phase 0 -- the sheet, decoded
    tools/wip/out/vphc/crossexam/   Phase 2 -- prod_unmatched.csv, for the overlap report

Output goes to a NEW directory, tools/wip/out/vphc/manuscripts/, so the shipped Phase 2-5
artifacts are never touched:

    ledger-{va,wv}.jsonl   create lines, in the schema apply_vphc_ledger parses
    crosswalk-{va,wv}.csv  the field values, same 36 columns as crossexam/
    overlap_report.csv     the 686 towns holding BOTH prod ASCC manuscripts and
                           VPHC ones -- the editor-review deliverable
    quarantine.csv         markings with no resolvable state (rule P1)
    manifest.json          sha256 of every output, for the determinism gate

Run it with a plain python3, not `uv run` (see vphc_crossexam.py).

Usage (see docs/devel/TOOLS.md, "VPHC Source Extraction"):
    python3 tools/vphc_manuscript_ledger.py
    python3 tools/vphc_manuscript_ledger.py --selftest
"""
from __future__ import annotations

import argparse
import collections
import csv
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Reuse, don't restate. vphc_crossexam owns the device vocabulary, the flag
# taxonomy and the editor-facing wording; duplicating any of it here would let
# the two passes drift apart in what they tell an editor.
from vphc_crossexam import (           # noqa: E402
    CROSSWALK_FIELDS, FLAG_REASONS, RULES_VERSION, _assert_no_database,
    catalog_marker, classify_unroutable, editor_comment, read_csv, sheet_flags,
    sheet_identity, year,
)
from vphc_extract import sha256_file, write_csv   # noqa: E402

# --------------------------------------------------------------- Ms. devices
#
# sheet_identity() does not recognise the manuscript device code, because it was
# written for the non-manuscript pass where the code never appears. Measured
# over the 3,884 manuscript rows it returns an empty type for 3,455 of them,
# which would send every one through apply_vphc_ledger's `type_defaulted` path
# and stamp a spurious "device code not recognised, please correct" on the
# description of a row whose device is perfectly well understood.
#
# `Ms.` is not an unrecognised code. It is *the* manuscript code: 3,848 of 3,884
# rows spell it `Ms.`, 16 `MS.`, 13 `Ms`. A manuscript with no detail column is
# a townmark whose inscription is the town name alone -- the sheet carries no
# inscription column at all, which is the fact that made matching impossible.
MS_DEVICE_RE = re.compile(r"^MS\.?$", re.I)

# Five rows write the rate into the device column instead of the detail column:
# `Ms.5`, `Ms. 5`, `Ms. 10`, `Ms. Paid 5`, `Ms. 5 PAID`. They are ordinary I2b
# ratemarks that landed one column left, so the remainder after the `Ms.` is
# handed to the shared vocabulary as if it had been the detail all along.
MS_PREFIX_RE = re.compile(r"^MS\.?\s*(.+)$", re.I)
# "5 PAID" is "PAID 5" written the other way round -- production spells it both
# ways, which is why sheet_identity already emits a {val}/{word} key variant.
NUM_WORD_RE = re.compile(r"^(\d+)\s+(PAID|DUE|WAY)$", re.I)

# Rule id. C1 already means "could not confidently match -> create, carrying the
# reason"; here the reason is categorical rather than per-row.
MS_RULE = "C1"
MS_VERDICT = "create_manuscript"

# The flag that says what the description must own up to: this inscription is
# the town name, not a transcription of the handwriting.
#
# catalog_marker() and editor_comment() both look wording up in FLAG_REASONS and
# silently drop any flag that is not there, so registering it is what makes the
# caveat reach the record instead of dying in a CSV column. Adding a key is
# additive -- no existing entry is touched, and the shipped Phase 2-5 artifacts
# are already written, so their wording cannot change under them.
MS_FLAG = "manuscript_no_inscription"
FLAG_REASONS.setdefault(
    MS_FLAG,
    "Handwritten. The Virginia Postal History Catalog records no inscription "
    "for manuscript markings, so the inscription shown is the town name rather "
    "than a transcription of the handwriting \u2014 check it against the scan.")
# 564 of the 3,375 manuscript markings (17%) carry a cancel number that is not a
# bare drawing number -- `1F`, `OL`, `2F.`, `1H`. On 150 towns a `<n>F`/`<n>L`
# sits alongside a bare `<n>`, which makes a suffix convention (first-seen /
# last-seen, like the ASCC (E)/(L) pair in issue #36) the obvious reading.
#
# It is not obvious enough to act on. The shipped non-manuscript pass met the
# same thing on 148 rows and carried the suffix through verbatim --
# `VPHC-VA-ABINGDON-23F.` is live on prod today -- so merging them here would
# both invent a rule nobody has confirmed and number manuscripts differently
# from their handstamp neighbours. Carry it, flag it, and ask Ian.
STATE_BACKFILL_FLAG = "state_backfilled"
FLAG_REASONS.setdefault(
    STATE_BACKFILL_FLAG,
    "The source row gave no county, so the state was taken from the same "
    "town's other entries in the book, which name only one (R2c).")

CANCEL_SUFFIX_FLAG = "cancel_suffix_uninterpreted"
FLAG_REASONS.setdefault(
    CANCEL_SUFFIX_FLAG,
    "The catalogue number carries a letter suffix nobody has defined yet "
    "(e.g. 1F, OL). It is carried through as written rather than merged with "
    "the plain number \u2014 needs Ian / Wayne Farley.")
FLAG_REASONS.setdefault(
    "create_manuscript",
    "Catalogued as a new record rather than matched to an existing one: a "
    "manuscript marking has no printed inscription, size or shape to match on "
    "(Reese, 2026-08-27). It may duplicate an existing entry for this town \u2014 "
    "see manuscripts/overlap_report.csv.")


def ms_identity(town, cancel, detail):
    """The manuscript half of I2/I2b.

    Returns (type, inscription, rate) -- no shape, ever. A manuscript Marking is
    forbidden a shape by `marking_manuscript_consistency`, so deriving one would
    be rejected at the database.

    A detail is still meaningful: 429 rows carry one, and `Paid 5` / `Due 10`
    make the marking a RATEMARK exactly as they do for a handstamp (I2b). Those
    go through the shared vocabulary untouched.

    NEVER: the rate does not come from cancel_no. That is the drawing number and the
    scan key (R8/E5); reading it as a rate is precisely what issue #120 did to
    276 listings.
    """
    c, d = (cancel or "").strip(), (detail or "").strip()

    if MS_DEVICE_RE.match(c) and not d:
        return "TOWNMARK", (town or "").strip(), ""

    if not d:
        # The rate landed in the device column. Peel the `Ms.` and let the
        # shared I2b vocabulary read the remainder as the detail it should
        # have been.
        m = MS_PREFIX_RE.match(c)
        if m:
            rest = m.group(1).strip()
            swap = NUM_WORD_RE.match(rest)
            if swap:
                rest = f"{swap.group(2).upper()} {swap.group(1)}"
            mtype, keys, rate, _shape = sheet_identity(town, "Ms.", rest)
            if mtype:
                return mtype, ";".join(sorted(keys)), rate

    mtype, keys, rate, _shape = sheet_identity(town, cancel, detail)
    if not mtype:
        # An unrecognised device that is not a bare Ms. -- fall back to a
        # townmark on the town name rather than dropping the row (rule C1,
        # nothing from the sheet is ever dropped).
        return "", (town or "").strip(), ""
    return mtype, ";".join(sorted(keys)), rate


# ------------------------------------------------------------------ grouping

def load_manuscripts(extract):
    """Collapse T1's manuscript rows to VPHC marking grain.

    R9: the supplement blocks re-list markings, and the later listing revises the
    earlier one. Colours and dates accumulate across occurrences; scalar fields
    take the highest occurrence.

    WARNING: the grouping key is NOT vphc_crossexam.load_sheet's (town_key, cancel_no).
    On the manuscript rows that key collides across states nine times, and the
    nine are not the same kind of thing:

      * eight are a placed VA/WV row plus a *stateless supplement re-listing* of
        the same town -- errata, which must MERGE. Keying on state would split
        them and quarantine half of each pair.
      * one is genuine -- MEADOW DALE #1 is Greenbrier WV and Highland VA, two
        different towns sharing a name, both in the main block. That must NOT
        merge.

    So: group on (town_key, cancel_no), then split only where two rows carry
    different *non-blank* states. A stateless row folds into the placed group.
    """
    t1 = read_csv(os.path.join(extract, "t1_markings.csv"))
    rows = [r for r in t1 if r["is_manuscript"] == "true" and r["cancel_no"]]

    # E5 -- one scan, one attachment, and the non-manuscript pass went first.
    #
    # T2 anchors a scan on (town, cancel #), and 44 of those keys carry BOTH a
    # manuscript and a non-manuscript T1 row. Their 27 scans were claimed by the
    # shipped Phase 4/5 pass and are already live on production. Attaching them
    # again here would assert the same photograph as evidence for two different
    # catalog records, which is exactly what E5 exists to prevent -- and unlike
    # a colour fan-out, apply_vphc_ledger's own `self.scanned` guard cannot
    # catch it, because that guard is per-run and the other run has finished.
    claimed = {(r["town_key"], r["cancel_no"])
               for r in t1 if r["is_manuscript"] != "true" and r["cancel_no"]}
    # Only the keys a manuscript would otherwise have taken are "withheld".
    # Every other non-manuscript key was never a candidate here, and counting
    # those would inflate the figure from 27 to 1,217 and make it meaningless.
    contested = claimed & {(r["town_key"], r["cancel_no"]) for r in rows}

    images = collections.defaultdict(list)
    withheld = 0
    for r in read_csv(os.path.join(extract, "t2_images.csv")):
        if not r["cancel_no"]:
            continue
        key = (r["town_key"], r["cancel_no"])
        if key in claimed:
            withheld += key in contested
            continue
        images[key].append(r["image_file"])
    load_manuscripts.withheld_scans = withheld

    # R2c, applied to the state rather than the county. A supplement row often
    # omits the county, and with no county R3 cannot route it -- but the same
    # town is usually placed unambiguously elsewhere in the sheet. Adopting that
    # is evidence, not a guess, and it is the same rescue apply_vphc_ledger
    # already performs against the live catalog (_state_from_catalog); doing it
    # here as well keeps it deterministic and auditable offline.
    #
    # NEVER guess: only where the sheet is unanimous. A town_key seen in both states stays
    # quarantined -- P1, never invent a home.
    state_index = collections.defaultdict(set)
    for r in t1:
        if r["state"].strip():
            state_index[r["town_key"]].add(r["state"].strip())

    pre = collections.defaultdict(list)
    for r in rows:
        pre[(r["town_key"], r["cancel_no"])].append(r)

    groups = {}
    for (tkey, cno), rs in pre.items():
        states = {r["state"] for r in rs if r["state"].strip()}
        if len(states) <= 1:
            groups[(tkey, cno, next(iter(states)) if states else "")] = rs
        else:
            for st in sorted(states):
                groups[(tkey, cno, st)] = [r for r in rs if r["state"] == st]
            orphans = [r for r in rs if not r["state"].strip()]
            if orphans:
                # Cannot be attributed to either state without guessing (P1).
                groups[(tkey, cno, "")] = orphans

    out = []
    for (tkey, cno, state), rs in groups.items():
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

        mtype, insc, rate = ms_identity(
            head["town"], head["cancel"], head["cancel_detail"])
        flags = set(sheet_flags(rs_sorted)) | {MS_FLAG}
        if not cno.isdigit():
            flags.add(CANCEL_SUFFIX_FLAG)

        resolved = state
        if not resolved:
            candidates = state_index.get(tkey, set())
            if len(candidates) == 1:
                resolved = next(iter(candidates))
                flags.add(STATE_BACKFILL_FLAG)
                flags.discard("state_unknown")

        flags = sorted(flags)

        out.append({
            "vphc_key": f"{tkey}#{cno}", "vphc_code": head["marking_code"],
            "src": ";".join(srcs), "state": resolved, "county": head["county"],
            "town": head["town"], "town_key": tkey, "cancel_no": cno,
            "cancel": head["cancel"], "cancel_detail": head["cancel_detail"],
            "rows": len(rs), "occurrences": head["occurrences"],
            "sheet_type": mtype, "sheet_insc": insc, "sheet_rate": rate,
            # Manuscripts have no shape and (bar 25 rows of OCR noise) no size.
            # The model forbids a shape outright; the sizes are not trustworthy
            # enough on their own to be worth carrying, and phase-04 records
            # that manuscripts default to a meaningless 31x31.
            "sheet_shape": "", "sheet_width": "", "sheet_height": "",
            "sheet_colors": colors,
            "sheet_earliest": earliest or "", "sheet_latest": latest or "",
            "sheet_images": sorted(set(images.get((tkey, cno), []))),
            "flags": flags,
        })

    out.sort(key=lambda r: (r["state"], r["town_key"],
                            int(r["cancel_no"]) if r["cancel_no"].isdigit() else 0,
                            r["cancel_no"]))
    return out


# ------------------------------------------------------------------- emitters

def crosswalk_row(m, verdict, note):
    """One crosswalk row, in the same 36 columns Phase 2 emits.

    prod_* is empty on every row: this pass creates only, so there is no
    production record on the other side of the walk. That is also why no rename
    step is needed before the run -- the 08-25 merge needed one because
    import_ascc_bundle matches on code and a stale code would insert a second
    marking. Nothing here matches on anything.
    """
    return {
        "vphc_key": m["vphc_key"], "vphc_code": m["vphc_code"], "src": m["src"],
        "state": m["state"], "county": m["county"], "town": m["town"],
        "town_key": m["town_key"], "cancel_no": m["cancel_no"], "po_status": "",
        "sheet_type": m["sheet_type"], "sheet_insc": m["sheet_insc"],
        "sheet_shape": "", "sheet_width": "", "sheet_height": "",
        "sheet_colors": ";".join(m["sheet_colors"]),
        "sheet_earliest": m["sheet_earliest"], "sheet_latest": m["sheet_latest"],
        "prod_code": "", "prod_type": "", "prod_insc": "", "prod_shape": "",
        "prod_width": "", "prod_height": "", "prod_color": "", "match_color": "",
        "identity_fields": "",
        "sheet_images": len(m["sheet_images"]),
        "sheet_image_files": ";".join(m["sheet_images"]),
        "prod_images": "", "images_to_add": len(m["sheet_images"]),
        "landing": "blocked" if not m["state"] else "create",
        "verdict": verdict,
        "flags": ";".join(m["flags"]),
        "catalog_marker": catalog_marker(m, verdict),
        "editor_comment": editor_comment(m, verdict),
        "note": note,
    }


def ledger_line(row, run):
    """One create line, in the exact schema apply_vphc_ledger already parses."""
    return {
        "run": run, "mode": "dryrun", "applied": False,
        "src": row["src"], "town": row["town"], "county": row["county"],
        "cancel": row["cancel_no"], "action": "create", "target": "marking",
        # The site owns numbering (rule E4). The VPHC cancel number travels as
        # citation reference data, never as an identifier.
        "target_code": None, "marking_id": None,
        "rule": MS_RULE, "rule_version": RULES_VERSION, "confidence": 1.0,
        "fields": ["type", "inscription_txt", "is_manuscript", "color",
                   "vphc_ref"],
        "before": {}, "after": {
            "type": row["sheet_type"], "inscription_txt": row["sheet_insc"],
            "is_manuscript": True, "color": row["sheet_colors"],
            "vphc_ref": row["vphc_code"]},
        "rejected": {
            # Said out loud rather than left to inference: these are not fields
            # we declined to write, they are fields a manuscript cannot have.
            "shape": {"reason": "manuscript markings have no shape (model "
                                "constraint marking_manuscript_consistency)"},
            "lettering": {"reason": "manuscript markings have no lettering"},
            "width": {"reason": "the sheet records no usable size for "
                                "manuscripts (RULES.md R5)"},
        },
        "why_unmatched": MS_VERDICT,
        "vphc": {
            "src": row["src"], "town": row["town"], "county": row["county"],
            "state": row["state"], "cancel_no": row["cancel_no"],
            "vphc_code": row["vphc_code"], "rules_version": RULES_VERSION,
            "why_unmatched": MS_VERDICT,
            "flags": [f for f in row["flags"].split(";") if f],
            "catalog_marker": row["catalog_marker"],
            "images": row["sheet_image_files"].split(";")
                      if row["sheet_image_files"] else [],
        },
        "editor_comment": row["editor_comment"],
    }


# ------------------------------------------------------------ overlap report

def overlap_report(markings, crossexam_dir):
    """The 686 towns that will hold both an ASCC manuscript and a VPHC one.

    Reese's decision (2026-08-27) is to load all of them and report the overlap
    rather than guess: production's manuscripts carry a real transcription
    (`Alexa.(Alexandria)`, `F'burg`) and the sheet has no inscription column at
    all, so there is no field on which the two could honestly be compared. An
    editor merges them or does not; a machine must not pretend to know.
    """
    path = os.path.join(crossexam_dir, "prod_unmatched.csv")
    if not os.path.exists(path):
        return [], 0
    prod = collections.defaultdict(list)
    for r in read_csv(path):
        if r["is_manuscript"] == "True":
            prod[re.sub(r"[^A-Z0-9]", "", r["town"].upper())].append(r)

    sheet = collections.defaultdict(list)
    for m in markings:
        if m["state"]:
            sheet[m["town_key"]].append(m)

    out = []
    towns = sorted(set(prod) & set(sheet))
    for tkey in towns:
        for r in sorted(prod[tkey], key=lambda x: x["code"]):
            out.append({
                "town_key": tkey, "side": "prod", "code": r["code"],
                "state": "", "cancel_no": "", "type": r["type"],
                "inscription": r["inscription_txt"], "color": r["color"],
                "earliest": "", "latest": "", "src": "", "has_scan": "",
            })
        for m in sorted(sheet[tkey], key=lambda x: (
                int(x["cancel_no"]) if x["cancel_no"].isdigit() else 0,
                x["cancel_no"])):
            out.append({
                "town_key": tkey, "side": "vphc", "code": "",
                "state": m["state"], "cancel_no": m["cancel_no"],
                "type": m["sheet_type"],
                "inscription": m["sheet_insc"],
                "color": ";".join(m["sheet_colors"]),
                "earliest": m["sheet_earliest"], "latest": m["sheet_latest"],
                "src": m["src"], "has_scan": "yes" if m["sheet_images"] else "",
            })
    return out, len(towns)


def cancel_suffix_report(markings):
    """The worklist behind CANCEL_SUFFIX_FLAG -- a question for Ian, not a rule.

    `has_plain_sibling` is the column that matters: where the same town also
    carries the bare number, the suffix is most likely a modifier on that same
    drawing rather than a separate one. If Ian confirms that, these merge in a
    later pass; until then they stand as written.
    """
    by_town = collections.defaultdict(set)
    for m in markings:
        by_town[m["town_key"]].add(m["cancel_no"])

    out = []
    for m in sorted(markings, key=lambda x: (x["town_key"], x["cancel_no"])):
        if m["cancel_no"].isdigit():
            continue
        stem = re.match(r"^(\d+)[A-Za-z]\.?$", m["cancel_no"])
        out.append({
            "state": m["state"], "town_key": m["town_key"], "town": m["town"],
            "cancel_no": m["cancel_no"],
            "stem": stem.group(1) if stem else "",
            "has_plain_sibling": "yes" if stem and stem.group(1) in by_town[m["town_key"]] else "",
            "src": m["src"], "vphc_code": m["vphc_code"],
        })
    return out


CANCEL_FIELDS = ["state", "town_key", "town", "cancel_no", "stem",
                 "has_plain_sibling", "src", "vphc_code"]

OVERLAP_FIELDS = ["town_key", "side", "code", "state", "cancel_no", "type",
                  "inscription", "color", "earliest", "latest", "src", "has_scan"]

QUARANTINE_FIELDS = ["town_key", "town", "county", "cancel_no", "src",
                     "reason_code", "reason", "rule"]


# ----------------------------------------------------------------------- run

def run(args):
    markings = load_manuscripts(args.extract)
    os.makedirs(args.out, exist_ok=True)

    placed = [m for m in markings if m["state"]]
    blocked = [m for m in markings if not m["state"]]

    # P1 -- never invent a home. A post office needs a state and the state comes
    # from its county; these have neither, so they are set aside with a reason
    # rather than filed somewhere plausible.
    quarantine = []
    for m in blocked:
        code, reason = classify_unroutable(
            {"town": m["town"], "county": m["county"]})
        quarantine.append({
            "town_key": m["town_key"], "town": m["town"], "county": m["county"],
            "cancel_no": m["cancel_no"], "src": m["src"],
            "reason_code": code, "reason": reason, "rule": "P1",
        })

    written = {}
    counts = {}
    for state in ("va", "wv"):
        subset = [m for m in placed if m["state"].lower() == state]
        rows = [crosswalk_row(m, MS_VERDICT, "") for m in subset]
        lines = [ledger_line(r, args.run) for r in rows]

        cw = os.path.join(args.out, f"crosswalk-{state}.csv")
        lg = os.path.join(args.out, f"ledger-{state}.jsonl")
        write_csv(cw, CROSSWALK_FIELDS, rows)
        with open(lg, "w", encoding="utf-8") as fh:
            for line in lines:
                fh.write(json.dumps(line, sort_keys=True) + "\n")
        written[os.path.basename(cw)] = cw
        written[os.path.basename(lg)] = lg
        counts[state] = {
            "markings": len(subset),
            # An UPPER BOUND, not a count. apply_vphc_ledger fans a create out
            # over the colours its catalog vocabulary recognises, and this tool
            # cannot see that vocabulary -- it has no database, by design. WV
            # measured 453 against this estimate's 454; the one difference is a
            # marking whose second colour the catalog does not know.
            "contributions_max": sum(max(1, len(m["sheet_colors"]))
                                     for m in subset),
            "scans": sum(len(m["sheet_images"]) for m in subset),
            "rows": sum(m["rows"] for m in subset),
        }

    overlap, overlap_towns = overlap_report(markings, args.crossexam)
    op = os.path.join(args.out, "overlap_report.csv")
    write_csv(op, OVERLAP_FIELDS, overlap)
    written["overlap_report.csv"] = op

    qp = os.path.join(args.out, "quarantine.csv")
    write_csv(qp, QUARANTINE_FIELDS, quarantine)
    written["quarantine.csv"] = qp

    suffixes = cancel_suffix_report(placed)
    sp = os.path.join(args.out, "cancel_suffix.csv")
    write_csv(sp, CANCEL_FIELDS, suffixes)
    written["cancel_suffix.csv"] = sp

    # Conservation (fixture F12, restated for this pass): every T1 manuscript row
    # lands in exactly one of {emitted, quarantined}. A row that merges into
    # another under R9 is still emitted -- as part of its parent.
    source_rows = sum(m["rows"] for m in markings)
    emitted_rows = sum(m["rows"] for m in placed)
    blocked_rows = sum(m["rows"] for m in blocked)

    manifest = {
        "rules_version": RULES_VERSION,
        "run": args.run,
        "stats": {
            "t1_manuscript_rows": source_rows,
            "markings_total": len(markings),
            "markings_placed": len(placed),
            "markings_quarantined": len(blocked),
            "rows_emitted": emitted_rows,
            "rows_quarantined": blocked_rows,
            "scans_attached": sum(len(m["sheet_images"]) for m in placed),
            # Not a loss: already attached to a non-manuscript marking on prod.
            "scans_withheld_already_claimed": load_manuscripts.withheld_scans,
            "overlap_towns": overlap_towns,
            "overlap_rows": len(overlap),
            "cancel_suffix_uninterpreted": len(suffixes),
            "cancel_suffix_with_plain_sibling":
                sum(1 for s in suffixes if s["has_plain_sibling"]),
            "by_state": counts,
        },
        "files": {name: sha256_file(path) for name, path in sorted(written.items())},
    }
    with open(os.path.join(args.out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
        fh.write("\n")

    assert emitted_rows + blocked_rows == source_rows, (
        f"conservation: {emitted_rows} + {blocked_rows} != {source_rows}")

    print(f"  T1 manuscript rows              {source_rows:>6}")
    print(f"  markings (R9-merged)            {len(markings):>6}")
    for state in ("va", "wv"):
        c = counts[state]
        print(f"    {state.upper()}  markings {c['markings']:>5}  "
              f"contributions <={c['contributions_max']:>5}  "
              f"scans {c['scans']:>5}")
    print(f"  quarantined (P1)                {len(blocked):>6}"
          f"   ({blocked_rows} rows)")
    print(f"  scans withheld (already on prod) "
          f"{load_manuscripts.withheld_scans:>5}")
    print(f"  overlap towns for editor review {overlap_towns:>6}"
          f"   ({len(overlap)} lines)")
    print(f"  cancel suffixes for Ian         {len(suffixes):>6}"
          f"   ({sum(1 for s in suffixes if s['has_plain_sibling'])} with a "
          f"plain sibling)")
    print(f"  written to {args.out}")
    return manifest


# ------------------------------------------------------------------ selftest

def selftest(args):
    """Fixtures. Named to continue vphc_crossexam's F-series."""
    fails = []

    def check(name, ok, detail=""):
        print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  -- {detail}" if detail else ""))
        if not ok:
            fails.append(name)

    markings = load_manuscripts(args.extract)
    raw = [r for r in read_csv(os.path.join(args.extract, "t1_markings.csv"))
           if r["is_manuscript"] == "true" and r["cancel_no"]]

    # F15 conservation -- nothing from the sheet is ever dropped (rule C1).
    check("F15 conservation: every manuscript row lands exactly once",
          sum(m["rows"] for m in markings) == len(raw),
          f"{sum(m['rows'] for m in markings)} vs {len(raw)}")

    # F16 the device code is understood, not defaulted.
    untyped = [m for m in markings if not m["sheet_type"]]
    check("F16 no manuscript falls through to an unrecognised device",
          not untyped, f"{len(untyped)} untyped")

    # F17 a manuscript never carries a shape -- the model forbids it.
    check("F17 no shape, no size on any manuscript",
          all(not m["sheet_shape"] and not m["sheet_width"] for m in markings))

    # F18 R9 -- a re-listed marking is ONE marking spanning both observations.
    ab = [m for m in markings if m["town_key"] == "ABINGDON" and m["cancel_no"] == "1"]
    check("F18 R9 merges the Abingdon #1 re-listing into one marking",
          len(ab) == 1 and ab[0]["rows"] == 2 and str(ab[0]["sheet_latest"]) == "1799",
          f"{[(m['rows'], m['sheet_earliest'], m['sheet_latest']) for m in ab]}")

    # F19 the genuine cross-state collision stays two markings, and the eight
    # stateless errata re-listings do NOT become quarantine rows.
    md = [m for m in markings if m["town_key"] == "MEADOWDALE" and m["cancel_no"] == "1"]
    check("F19 MEADOW DALE #1 stays two markings (VA and WV)",
          len(md) == 2 and {m["state"] for m in md} == {"VA", "WV"},
          f"{[(m['state'], m['rows']) for m in md]}")
    alex = [m for m in markings if m["town_key"] == "ALEXANDRIA" and m["cancel_no"] == "4"]
    check("F19b a stateless errata re-listing merges into its placed parent",
          len(alex) == 1 and alex[0]["state"] == "VA" and alex[0]["rows"] == 2,
          f"{[(m['state'], m['rows']) for m in alex]}")

    # F19c E5 -- no scan already attached to a non-manuscript marking is
    # attached again here. The shipped pass went first and is live on prod.
    t1 = read_csv(os.path.join(args.extract, "t1_markings.csv"))
    claimed = {(r["town_key"], r["cancel_no"])
               for r in t1 if r["is_manuscript"] != "true" and r["cancel_no"]}
    reattached = [f for m in markings for f in m["sheet_images"]
                  if (m["town_key"], m["cancel_no"]) in claimed]
    check("F19c no scan is re-attached to a second catalog record",
          not reattached, f"{len(reattached)} re-attached")

    # F20 rate never comes from the cancel number (issue #120).
    bad = [m for m in markings
           if m["sheet_rate"] and m["sheet_rate"] == m["cancel_no"]
           and not m["cancel_detail"].strip()]
    check("F20 no rate was taken from the drawing number", not bad,
          f"{len(bad)} suspect")

    # F22 R2c state backfill -- rescued only where the sheet is unanimous, and
    # the inference is always visible on the record.
    backfilled = [m for m in markings if STATE_BACKFILL_FLAG in m["flags"]]
    check("F22 a state backfilled from the sheet is placed and flagged",
          backfilled and all(m["state"] and STATE_BACKFILL_FLAG in m["flags"]
                             for m in backfilled),
          f"{len(backfilled)} backfilled")
    # MEADOW DALE is the town the sheet is NOT unanimous about, so a stateless
    # row for it must never be rescued into one of the two.
    check("F22b an ambiguous town is never rescued",
          not [m for m in backfilled if m["town_key"] == "MEADOWDALE"])

    # F21 determinism -- two runs, identical digests.
    import tempfile
    digests = []
    for _ in range(2):
        with tempfile.TemporaryDirectory() as tmp:
            a = argparse.Namespace(extract=args.extract, crossexam=args.crossexam,
                                   out=tmp, run=args.run)
            digests.append(run_quiet(a)["files"])
    check("F21 determinism: two runs produce identical digests",
          digests[0] == digests[1])

    print(f"\n  {len(fails)} failure(s)" if fails else "\n  all fixtures green")
    return 1 if fails else 0


def run_quiet(args):
    import contextlib, io
    with contextlib.redirect_stdout(io.StringIO()):
        return run(args)


def main():
    _assert_no_database()
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wip", "out", "vphc")
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--extract", default=os.path.join(out, "extract"))
    p.add_argument("--crossexam", default=os.path.join(out, "crossexam"))
    p.add_argument("--out", default=os.path.join(out, "manuscripts"))
    p.add_argument("--run", default="manuscripts-2026-08-27a")
    p.add_argument("--selftest", action="store_true")
    args = p.parse_args()
    if args.selftest:
        sys.exit(selftest(args))
    run(args)


if __name__ == "__main__":
    main()
