"""
Load an APMC bundle (a directory of CSVs produced by tools/apmc_data_munger.ipynb)
into the catalog tables in dependency order.

Expected layout:
    <directory>/
        colors.csv
        letterings.csv
        shapes.csv
        regions.csv
        post_offices.csv
        markings.csv
        covers.csv
        cover_markings.csv
        cover_dates.csv
        cover_valuations.csv

Each CSV has a header row matching the column names defined by the v2
importers in common.csv_import (see manifest in docs/model.md / plan).

Audit attribution: created_by / modified_by are filled from --user (by
username) when supplied, otherwise from the lowest-pk superuser (and then
the lowest-pk staff user as a second fallback). The command does not
create users.

Usage:
    python manage.py import_apmc_bundle ./tools/wip/out/
    python manage.py import_apmc_bundle ./out/ --user alice --only markings,covers
"""
import csv
import io
import os
import sys

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model

from common.csv_import import IMPORTERS, V2_IMPORT_ORDER

User = get_user_model()


def _parse_csv_path(path):
    """Read a CSV file from disk into the {headers, rows} shape the importers expect."""
    with open(path, "r", encoding="utf-8", newline="") as fh:
        reader = csv.reader(fh)
        rows = list(reader)
    if not rows:
        return {"headers": [], "rows": []}
    return {"headers": rows[0], "rows": rows[1:]}


class Command(BaseCommand):
    help = "Load an APMC CSV bundle into the catalog in dependency order."

    def add_arguments(self, parser):
        parser.add_argument(
            "directory",
            help="Path to the directory containing the bundle CSVs.",
        )
        parser.add_argument(
            "--user",
            default=None,
            help=(
                "Username to attribute the import to. Defaults to the "
                "lowest-pk superuser, then the lowest-pk staff user."
            ),
        )
        parser.add_argument(
            "--only",
            default=None,
            help=(
                "Comma-separated list of stems to load (e.g. 'colors,markings'). "
                "Order is still forced to the canonical dependency order. "
                "Default: load all stems."
            ),
        )
        parser.add_argument(
            "--allow-missing",
            action="store_true",
            help=(
                "If set, skip stems whose CSV file is absent instead of failing. "
                "Useful for partial bundles."
            ),
        )

    def handle(self, *args, **options):
        directory = options["directory"]
        if not os.path.isdir(directory):
            raise CommandError(f"Not a directory: {directory}")

        if options["user"]:
            try:
                user = User.objects.get(username=options["user"])
            except User.DoesNotExist as exc:
                raise CommandError(f"User {options['user']!r} not found.") from exc
        else:
            user = (
                User.objects.filter(is_superuser=True).order_by("pk").first()
                or User.objects.filter(is_staff=True).order_by("pk").first()
            )
            if user is None:
                raise CommandError(
                    "No --user given and no superuser/staff user exists. Run "
                    "'python manage.py createsuperuser' first, or pass --user."
                )

        if options["only"]:
            requested = {s.strip() for s in options["only"].split(",") if s.strip()}
            unknown = requested - set(V2_IMPORT_ORDER)
            if unknown:
                raise CommandError(f"Unknown stem(s): {sorted(unknown)}")
            order = [s for s in V2_IMPORT_ORDER if s in requested]
        else:
            order = list(V2_IMPORT_ORDER)

        self.stdout.write(self.style.NOTICE(
            f"Importing as user={user.username!r} (pk={user.pk})"
        ))

        totals = {"created": 0, "updated": 0, "skipped": 0, "errors": 0}
        for stem in order:
            path = os.path.join(directory, f"{stem}.csv")
            if not os.path.isfile(path):
                if options["allow_missing"]:
                    self.stdout.write(f"  {stem:<18s} (missing, skipped)")
                    continue
                raise CommandError(f"Missing CSV: {path}")
            data = _parse_csv_path(path)
            importer = IMPORTERS[stem]
            try:
                result = importer(data, user)
            except Exception as exc:
                raise CommandError(f"{stem}: {exc!s}") from exc
            for k in ("created", "updated", "skipped"):
                totals[k] += int(result.get(k, 0) or 0)
            errs = result.get("errors") or []
            totals["errors"] += len(errs)
            self.stdout.write(
                f"  {stem:<18s}  created={result.get('created', 0):>5d}  "
                f"updated={result.get('updated', 0):>5d}  "
                f"skipped={result.get('skipped', 0):>5d}  "
                f"errors={len(errs):>3d}"
            )
            for e in errs[:5]:
                self.stdout.write(self.style.WARNING(f"    ! {e}"))
            if len(errs) > 5:
                self.stdout.write(self.style.WARNING(f"    ... ({len(errs) - 5} more)"))

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"Done. created={totals['created']}  updated={totals['updated']}  "
            f"skipped={totals['skipped']}  errors={totals['errors']}"
        ))
        if totals["errors"]:
            sys.exit(1)
