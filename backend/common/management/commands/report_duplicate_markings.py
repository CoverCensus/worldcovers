"""Report candidate duplicate Markings in existing catalog data (Trello T47).

Read-only. Nothing here merges, archives, or deletes: matches are evidence
for a human, never an authorisation (card T47). The same keys are meant to
back T48's "similar Entries" warning on the submission forms.

Two tiers, one CSV, one row per group member:

  EXACT  every attribute equal except code, catalog_txt and the audit
         columns -- the pipeline's own merge rule (tools/v1_bundle_overlay
         merge_equal_v1_markings) applied to database rows.
  NEAR   same primary state, same town key (case, spacing and punctuation
         blind -- the 69 fragmented VA/WV spellings of issue #129 sit on
         different PostOffice rows), same type, same inscription key, same
         shape, same colour family (word order ignored, GRAY = GREY, like
         set_color_display_hex), and width/height within 0.5 mm where both
         sides are known.

EXACT twins are always NEAR twins, so no Marking is reported twice. A group
is EXACT when all its members are identical; otherwise NEAR, and each row
lists the ids of its exact twins within the group, if any.

A Marking that belongs under two Regions is one Marking, not a duplicate
(DECISIONS.md, "Account For Historical Regions"), so only Markings whose
PRIMARY region agrees are compared. Martinsburg VA and Martinsburg WV never
group (#94). Recycle-binned rows are never scanned.

Dates are shown, not judged: each row carries the cached earliest/latest
seen range and each group says whether the known ranges overlap. Pass
--require-date-overlap to drop the groups whose known ranges do not.

Runbook (any site; identify the dataset before scanning, per the card):
  cwd: repo root
  ./woco report_duplicate_markings
  ./woco report_duplicate_markings --state VA --state WV --require-date-overlap
  ./woco report_duplicate_markings --out tools/wip/out/dupes_va.csv --state VA
  default output: tools/wip/out/duplicate_markings_<YYYYMMDD>.csv
  expected exit code: 0
"""
from __future__ import annotations

import csv
import os
from collections import defaultdict
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from common.matching import (
    SCAN_FIELDS,
    exact_key,
    near_key,
    primary_region_subquery,
    sizes_compatible,
)
from common.models import Marking, Region

DEFAULT_OUT_DIR = os.path.join("tools", "wip", "out")

REPORT_FIELDS = [
    "group_id", "tier", "group_size", "dates_overlap", "marking_id", "code",
    "exact_match_ids", "state", "state_code", "post_office_id", "town",
    "type", "inscription", "shape", "color", "width", "height",
    "lettering_id", "impression", "date_fmt", "rate_val", "is_manuscript",
    "is_irreg", "earliest_seen", "latest_seen", "desc",
]


# ------------------------------------------------------------ grouping

def cluster_by_size(rows: list[dict]) -> list[list[dict]]:
    """Split one NEAR bucket into clusters whose sizes are mutually close.

    Union-find over pairs: a bucket is a handful of rows, so the pairwise
    pass is cheap, and it keeps 20.0 / 20.4 / 20.8 together without any of
    the bucket-rounding splits a fixed grid would cause.
    """
    parent = list(range(len(rows)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            if sizes_compatible(rows[i], rows[j]):
                parent[find(i)] = find(j)

    clusters: dict[int, list[dict]] = defaultdict(list)
    for i, row in enumerate(rows):
        clusters[find(i)].append(row)
    return [members for members in clusters.values() if len(members) > 1]


def dates_overlap(rows: list[dict]) -> str:
    """'yes' / 'no' for the known ranges, 'unknown' with fewer than two."""
    ranges = [
        (row["earliest_seen"], row["latest_seen"] or row["earliest_seen"])
        for row in rows if row["earliest_seen"] is not None
    ]
    if len(ranges) < 2:
        return "unknown"
    latest_start = max(start for start, _ in ranges)
    earliest_end = min(end for _, end in ranges)
    return "yes" if latest_start <= earliest_end else "no"


def _cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _sort_key(key: tuple) -> tuple:
    return tuple("" if part is None else str(part) for part in key)


# --------------------------------------------------------------- command

class Command(BaseCommand):
    help = "Report candidate duplicate Markings for human review. Read-only."

    def add_arguments(self, parser):
        parser.add_argument(
            "--out", default="",
            help=f"CSV path. Default {DEFAULT_OUT_DIR}/duplicate_markings_<date>.csv")
        parser.add_argument(
            "--state", action="append", default=[], metavar="TERM",
            help="Scan only this state (name or abbreviation). Repeatable.")
        parser.add_argument(
            "--require-date-overlap", action="store_true",
            help="Drop groups whose known date ranges do not overlap. Groups "
                 "with fewer than two dated members are unknown and kept.")
        parser.add_argument(
            "--min-group-size", type=int, default=2,
            help="Smallest group to report (default 2).")

    def handle(self, *args, **opts):
        if opts["min_group_size"] < 2:
            raise CommandError("--min-group-size must be at least 2")
        region_codes = [self._region_code(term) for term in opts["state"]]
        out_path = opts["out"] or os.path.join(
            DEFAULT_OUT_DIR,
            f"duplicate_markings_{timezone.now():%Y%m%d}.csv")

        self.stdout.write(self.style.NOTICE(
            "Read-only report: nothing is written to the database."))

        scanned, buckets = self._scan(region_codes)
        groups = self._build_groups(
            buckets, opts["min_group_size"], opts["require_date_overlap"])

        rows: list[dict] = []
        for group in groups:
            self.stdout.write(
                f"  {group['id']} {group['tier']:<5} {group['state'] or '--':<3} "
                f"{group['town']} {group['type']}  members={len(group['members'])} "
                f"ids={','.join(str(m['id']) for m in group['members'])} "
                f"dates={group['dates']}")
            rows.extend(self._report_rows(group))

        exact = sum(1 for g in groups if g["tier"] == "EXACT")
        self.stdout.write(
            f"markings scanned {scanned} | groups {len(groups)} "
            f"(exact {exact}, near {len(groups) - exact}) | "
            f"markings in groups {len(rows)}")
        self._write_report(out_path, rows)

    # ------------------------------------------------------------- pieces

    @staticmethod
    def _region_code(term: str) -> str:
        region = Region.primary_for_state_term(term)
        if region is None:
            raise CommandError(f"unknown state: {term!r}")
        if not region.code:
            raise CommandError(
                f"region {region.name!r} (id {region.pk}) has no code to scan by")
        return region.code

    @staticmethod
    def _scan(region_codes: list[str]):
        queryset = Marking.objects.annotate(
            state_abbrev=primary_region_subquery("abbrev"),
            state_code=primary_region_subquery("code"),
        )
        if region_codes:
            queryset = queryset.filter(state_code__in=region_codes)
        scanned = 0
        buckets: dict[tuple, list[dict]] = defaultdict(list)
        for row in queryset.values(*SCAN_FIELDS).iterator(chunk_size=2000):
            scanned += 1
            buckets[near_key(row)].append(row)
        return scanned, buckets

    @staticmethod
    def _build_groups(buckets, min_size: int, require_overlap: bool) -> list[dict]:
        groups: list[dict] = []
        for _key, bucket in sorted(buckets.items(), key=lambda kv: _sort_key(kv[0])):
            for members in cluster_by_size(bucket):
                if len(members) < min_size:
                    continue
                dates = dates_overlap(members)
                if require_overlap and dates == "no":
                    continue
                members.sort(key=lambda m: m["id"])
                exact_keys = {exact_key(m) for m in members}
                groups.append({
                    "id": f"G{len(groups) + 1:04d}",
                    "tier": "EXACT" if len(exact_keys) == 1 else "NEAR",
                    "state": members[0]["state_abbrev"],
                    # Every spelling in the group; NEAR groups span offices.
                    "town": " / ".join(sorted(
                        {m["post_office__name"] or "" for m in members})),
                    "type": members[0]["type"],
                    "dates": dates,
                    "members": members,
                })
        return groups

    @staticmethod
    def _report_rows(group: dict) -> list[dict]:
        members = group["members"]
        twins: dict[tuple, list[int]] = defaultdict(list)
        for m in members:
            twins[exact_key(m)].append(m["id"])
        rows = []
        for m in members:
            exact_ids = [i for i in twins[exact_key(m)] if i != m["id"]]
            rows.append({
                "group_id": group["id"],
                "tier": group["tier"],
                "group_size": len(members),
                "dates_overlap": group["dates"],
                "marking_id": m["id"],
                "code": _cell(m["code"]),
                "exact_match_ids": ",".join(str(i) for i in exact_ids),
                "state": _cell(m["state_abbrev"]),
                "state_code": _cell(m["state_code"]),
                "post_office_id": m["post_office_id"],
                "town": _cell(m["post_office__name"]),
                "type": m["type"],
                "inscription": _cell(m["inscription_txt"]),
                "shape": _cell(m["shape__name"]),
                "color": _cell(m["color__name"]),
                "width": _cell(m["width"]),
                "height": _cell(m["height"]),
                "lettering_id": _cell(m["lettering_id"]),
                "impression": _cell(m["impression"]),
                "date_fmt": _cell(m["date_fmt"]),
                "rate_val": _cell(m["rate_val"]),
                "is_manuscript": _cell(m["is_manuscript"]),
                "is_irreg": _cell(m["is_irreg"]),
                "earliest_seen": _cell(m["earliest_seen"]),
                "latest_seen": _cell(m["latest_seen"]),
                "desc": _cell(m["desc"]),
            })
        return rows

    def _write_report(self, path: str, rows: list[dict]):
        """Never fatal: the census printed above is the same data."""
        try:
            parent = os.path.dirname(path)
            if parent:
                os.makedirs(parent, exist_ok=True)
            with open(path, "w", newline="", encoding="utf-8") as fh:
                writer = csv.DictWriter(
                    fh, fieldnames=REPORT_FIELDS, lineterminator="\n")
                writer.writeheader()
                writer.writerows(rows)
            self.stdout.write(self.style.SUCCESS(f"report written to {path}"))
        except OSError as err:
            self.stdout.write(self.style.WARNING(
                f"  could not write the report to {path}: {err}."))
