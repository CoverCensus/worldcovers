"""Repair the Color rows the munger invented (Trello T65).

Ian, 2026-09-21: "On the catalog search the colors have odd things like Red
35 - can this be cleaned up please?" and 09-23: "Can we fix the drop down of
color asap please?"

`triage_other_field` used to accept a comma field as colours once all but one
token were colours, then emitted EVERY token as a colour name. "Blue, Red 35"
therefore produced BLUE and "RED 35"; "Red, 30" produced "30"; "Black, --"
produced "--". The munger fans out one marking per colour, so each bad name
came with a marking (and its rate/aux marks) attached. The gate is fixed in
tools/munger/fields; this repairs what it already emitted, on each site.

A colour is referenced from more places than the FK. All of them are handled:
  - Marking.color and Cover.color (both PROTECT), including recycle-binned rows
  - MarkingVersion / CoverVersion snapshot["color_id"] (restore writes it back)
  - Contribution.submitted_data["color"] (name) and ["color_id"] (id, often a
    string) -- approval resolves color_id FIRST and raises if the pk is gone,
    so a pending submission would stop approving
Left alone, deliberately: django-reversion Version rows. Nothing in the app
calls revert(); the app's restore path is the snapshot, which is rewritten.

Runbook (report, review, dry run, commit; woco.dev first, then production):
  cwd: repo root
  report:  uv run python backend/manage.py repair_catalog_colors --report /tmp/t65/census.csv
           edit `action` (keep|merge|null) and `target` per row, save as mapping.csv
  dry run: uv run python backend/manage.py repair_catalog_colors --mapping /tmp/t65/mapping.csv --expect N
  commit:  ... --mapping /tmp/t65/mapping.csv --expect N --commit --actor <user id>
  on the box: cd /srv/woco && sudo -u wocod -H bash -lc 'cd /srv/woco && uv run python backend/manage.py repair_catalog_colors ...'
  expected exit code: 0
Take the tagged backup first (worldcovers-backup --tag pre-t65-colors) plus a
table dump of Colors, Markings, Covers, MarkingVersions, CoverVersions and
Contributions. Duplicate markings that become colour-identical after a merge
are reported, not merged -- that is T47's job.
"""
from __future__ import annotations

import csv
import os
import re

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import ProtectedError, Q
from django.utils import timezone

from common.models import (
    Color,
    Contribution,
    Cover,
    CoverVersion,
    Marking,
    MarkingVersion,
)

# Mirrors tools/munger/fields KNOWN_COLORS. Duplicated on purpose: the backend
# does not import the pipeline, and this list only decides what the report
# flags as suspect -- the operator's mapping decides what happens.
KNOWN_COLORS = {
    'black', 'red', 'blue', 'green', 'brown', 'orange', 'purple',
    'magenta', 'yellow', 'olive', 'violet', 'carmine', 'vermilion',
    'pink', 'gray', 'grey', 'buff', 'salmon', 'rose', 'maroon',
    'crimson', 'indigo', 'lilac', 'scarlet', 'amber', 'brownish',
    'purplish',
}
MODIFIERS = {'bright', 'dark', 'deep', 'light', 'pale'}
CONNECTORS = {'and', 'to'}
COLOURISH = KNOWN_COLORS | MODIFIERS | CONNECTORS

# The munger's DEFAULT_MARKING_COLOR. Protected by name, not by pk: the admin
# action skipped pk 1 and that only holds when BLACK happened to load first.
PROTECTED_NAMES = {"black"}

ACTIONS = ("keep", "merge", "null")
REPORT_FIELDS = [
    "color_id", "name", "hex_val", "n_markings", "n_covers",
    "n_marking_versions", "n_cover_versions", "n_contributions",
    "is_suspect", "suggested_target", "action", "target",
]


def _words(name: str) -> list[str]:
    return [w for w in re.split(r'[\s\-]+', name.strip().lower()) if w]


def is_suspect(name: str) -> bool:
    """A name that is not made only of colour words is not a colour."""
    words = _words(name)
    if not words or not any(w in KNOWN_COLORS for w in words):
        return True
    return any(w not in COLOURISH for w in words)


def suggest_target(name: str, canonical: dict[str, Color]) -> str:
    """The leading colour phrase of a suspect name, if it names a real row."""
    run: list[str] = []
    for w in _words(name):
        if w not in COLOURISH:
            break
        run.append(w)
    while run and run[-1] in CONNECTORS:
        run.pop()
    if not any(w in KNOWN_COLORS for w in run):
        return ""
    for candidate in (" ".join(run), "-".join(run)):
        hit = canonical.get(candidate)
        if hit is not None and hit.name.lower() != name.lower():
            return hit.name
    return ""


def _contribution_refs(color: Color):
    pk = color.pk
    return Contribution.objects.filter(
        Q(submitted_data__color__iexact=color.name)
        | Q(submitted_data__color_id=pk)
        | Q(submitted_data__color_id=str(pk))
    )


def _version_refs(model, color: Color):
    return model.objects.filter(
        Q(snapshot__color_id=color.pk) | Q(snapshot__color_id=str(color.pk)))


class Command(BaseCommand):
    help = "Report, then merge or null out, Color rows that are not colours."

    def add_arguments(self, parser):
        parser.add_argument(
            "--report", default="",
            help="Write the colour census to this CSV and exit. No writes.")
        parser.add_argument(
            "--mapping", default="",
            help="Operator-reviewed CSV (name, action, target) to apply.")
        parser.add_argument(
            "--commit", action="store_true",
            help="Actually write. Omit for a dry run, which is the default.")
        parser.add_argument(
            "--dry-run", action="store_true",
            help="No-op; a dry run is already the default. Accepted so the "
                 "safe spelling never errors.")
        parser.add_argument(
            "--expect", type=int, default=None,
            help="Abort unless exactly this many Color rows would be merged "
                 "or nulled.")
        parser.add_argument("--actor", type=int, default=1)

    # ------------------------------------------------------------------ main

    def handle(self, *args, **opts):
        if bool(opts["report"]) == bool(opts["mapping"]):
            raise CommandError("pass exactly one of --report PATH or --mapping PATH")
        if opts["report"]:
            self._report(opts["report"])
            return

        commit = opts["commit"] and not opts["dry_run"]
        if opts["commit"] and opts["dry_run"]:
            self.stdout.write(self.style.WARNING(
                "--dry-run overrides --commit; nothing will be written."))
        if not commit:
            self.stdout.write(self.style.NOTICE(
                "DRY RUN: nothing will be written. Pass --commit to write."))
        User = get_user_model()
        try:
            actor = User.objects.get(pk=opts["actor"])
        except User.DoesNotExist:
            raise CommandError(f"no user with id {opts['actor']}")
        if opts["actor"] == 1:
            self.stdout.write(self.style.WARNING(
                f"actor defaulted to id 1 ({actor.get_username()}); "
                f"every write will be attributed to them."))

        plan = self._load_mapping(opts["mapping"])
        expect = opts["expect"]
        if expect is not None and expect != len(plan):
            raise CommandError(
                f"--expect {expect} but the mapping changes {len(plan)} colour "
                f"row(s); refusing to write. Re-census before trusting a stale "
                f"number.")
        if not plan:
            self.stdout.write("mapping changes nothing; done.")
            return

        with transaction.atomic():
            for bad, target in plan:
                self._apply_one(bad, target, actor)
            if not commit:
                transaction.set_rollback(True)
        verb = "would repair" if not commit else "repaired"
        self.stdout.write(self.style.SUCCESS(
            f"{'[DRY RUN] ' if not commit else ''}{verb} {len(plan)} colour row(s)."))

    # ---------------------------------------------------------------- report

    def _report(self, path: str):
        colors = list(Color.objects.all().order_by("name"))
        canonical = {c.name.lower(): c for c in colors if not is_suspect(c.name)}
        rows = []
        collisions = 0
        for c in colors:
            suspect = is_suspect(c.name)
            suggestion = suggest_target(c.name, canonical) if suspect else ""
            action = "keep" if not suspect else ("merge" if suggestion else "null")
            row = {
                "color_id": c.pk, "name": c.name, "hex_val": c.hex_val,
                "n_markings": Marking.all_objects.filter(color=c).count(),
                "n_covers": Cover.all_objects.filter(color=c).count(),
                "n_marking_versions": _version_refs(MarkingVersion, c).count(),
                "n_cover_versions": _version_refs(CoverVersion, c).count(),
                "n_contributions": _contribution_refs(c).count(),
                "is_suspect": "yes" if suspect else "no",
                "suggested_target": suggestion,
                "action": action, "target": suggestion,
            }
            rows.append(row)
            if suggestion:
                collisions += self._colour_identical_after(c, canonical[suggestion.lower()])
            self.stdout.write(
                f"  {c.pk:<5} {c.name:<24} markings={row['n_markings']:<5} "
                f"covers={row['n_covers']:<4} versions="
                f"{row['n_marking_versions'] + row['n_cover_versions']:<5} "
                f"contributions={row['n_contributions']:<4} "
                f"{'SUSPECT -> ' + (suggestion or 'NULL') if suspect else ''}")
        suspects = sum(1 for r in rows if r["is_suspect"] == "yes")
        self.stdout.write(
            f"colours {len(rows)} · suspect {suspects} · markings that would "
            f"become colour-identical with an existing sibling after the "
            f"suggested merges: {collisions} (T47, not touched here)")
        self._write_report(path, rows)

    def _colour_identical_after(self, bad: Color, target: Color) -> int:
        n = 0
        for m in Marking.all_objects.filter(color=bad).only(
                "post_office_id", "type", "inscription_txt"):
            if Marking.all_objects.filter(
                    color=target, post_office_id=m.post_office_id,
                    type=m.type, inscription_txt=m.inscription_txt).exists():
                n += 1
        return n

    def _write_report(self, path: str, rows):
        """Never fatal: the census printed above is the same data."""
        try:
            parent = os.path.dirname(path)
            if parent:
                os.makedirs(parent, exist_ok=True)
            with open(path, "w", newline="") as fh:
                writer = csv.DictWriter(fh, fieldnames=REPORT_FIELDS)
                writer.writeheader()
                writer.writerows(rows)
            self.stdout.write(self.style.SUCCESS(f"census written to {path}"))
        except OSError as err:
            self.stdout.write(self.style.WARNING(
                f"  could not write the census to {path}: {err}."))

    # --------------------------------------------------------------- mapping

    def _load_mapping(self, path: str) -> list[tuple[Color, Color | None]]:
        try:
            with open(path, newline="") as fh:
                reader = csv.DictReader(fh)
                if not reader.fieldnames or not {"name", "action", "target"} <= set(reader.fieldnames):
                    raise CommandError(
                        f"{path}: needs columns name, action, target")
                raw_rows = list(reader)
        except OSError as err:
            raise CommandError(f"cannot read {path}: {err}")

        plan: list[tuple[Color, Color | None]] = []
        sources: set[int] = set()
        for line, row in enumerate(raw_rows, start=2):
            name = (row.get("name") or "").strip()
            action = (row.get("action") or "keep").strip().lower()
            target_name = (row.get("target") or "").strip()
            if action not in ACTIONS:
                raise CommandError(f"{path}:{line}: action must be one of {ACTIONS}, got {action!r}")
            if action == "keep":
                continue
            bad = self._color_named(name, path, line)
            if bad.name.lower() in PROTECTED_NAMES:
                raise CommandError(
                    f"{path}:{line}: {bad.name} is the default marking colour "
                    f"and is never a source")
            if bad.pk in sources:
                raise CommandError(f"{path}:{line}: {bad.name} listed twice")
            sources.add(bad.pk)
            target = None
            if action == "merge":
                if not target_name:
                    raise CommandError(f"{path}:{line}: merge needs a target")
                target = self._color_named(target_name, path, line)
                if target.pk == bad.pk:
                    raise CommandError(f"{path}:{line}: {bad.name} cannot merge into itself")
            plan.append((bad, target))

        for bad, target in plan:
            if target is not None and target.pk in sources:
                raise CommandError(
                    f"{bad.name} merges into {target.name}, which is itself "
                    f"being merged or nulled; no chains")
        return plan

    def _color_named(self, name: str, path: str, line: int) -> Color:
        if not name:
            raise CommandError(f"{path}:{line}: empty colour name")
        hits = list(Color.objects.filter(name__iexact=name))
        if len(hits) != 1:
            raise CommandError(
                f"{path}:{line}: {name!r} matches {len(hits)} Color row(s), need 1")
        return hits[0]

    # ----------------------------------------------------------------- apply

    def _apply_one(self, bad: Color, target: Color | None, actor):
        now = timezone.now()
        target_pk = target.pk if target is not None else None
        label = target.name if target is not None else "NULL"

        n_markings = Marking.all_objects.filter(color=bad).update(
            color=target, modified_by=actor, modified_date=now)
        n_covers = Cover.all_objects.filter(color=bad).update(
            color=target, modified_by=actor, modified_date=now)

        n_versions = 0
        for model in (MarkingVersion, CoverVersion):
            for version in _version_refs(model, bad):
                snap = dict(version.snapshot)
                snap["color_id"] = target_pk
                version.snapshot = snap
                version.save(update_fields=["snapshot"])
                n_versions += 1

        n_contributions = 0
        for row in _contribution_refs(bad):
            data = dict(row.submitted_data)
            if target is None:
                # Absent leaves a live marking's colour alone on an edit and
                # yields no colour on a create; "" would mean "clear it".
                data.pop("color", None)
                data.pop("color_id", None)
            else:
                data["color"] = target.name
                if "color_id" in data:
                    data["color_id"] = (str(target.pk)
                                        if isinstance(data["color_id"], str)
                                        else target.pk)
            row.submitted_data = data
            row.modified_by = actor
            # Per-row save: bulk_update skips auto_now and signals.
            row.save(update_fields=["submitted_data", "modified_by", "modified_date"])
            n_contributions += 1

        if (Marking.all_objects.filter(color=bad).exists()
                or Cover.all_objects.filter(color=bad).exists()):
            raise CommandError(f"{bad.name}: still referenced after repointing")
        try:
            bad.delete()
        except ProtectedError as err:
            raise CommandError(f"{bad.name}: cannot delete, still protected: {err}")

        self.stdout.write(
            f"  {bad.name!r} -> {label}: markings={n_markings} covers={n_covers} "
            f"versions={n_versions} contributions={n_contributions}; row deleted")
