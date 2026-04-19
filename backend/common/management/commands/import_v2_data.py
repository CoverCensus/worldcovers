"""
Batch-import WorldCovers V2 catalog data from CSV files.

Reads one CSV per model from --dir (default: tools/wip/out/) and loads each
through the same ModelResource classes used by the Django admin import panel.
The canonical CSV format is whatever the admin panel exports — column names
match model field names exactly, FKs are integer PKs.

Files are processed in FK-dependency order. Missing files are skipped with a
warning (e.g. postmark_valuation.csv may not exist yet).
"""

import os
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model

import tablib

from common.admin import (
    ColorResource,
    ShapeResource,
    LetteringResource,
    FramingResource,
    RegionResource,
    PostOfficeResource,
    CoverResource,
    RatemarkResource,
    PostmarkResource,
    AuxmarkResource,
    DateObservedResource,
    PostmarkRatemarkResource,
    CoverPostmarkResource,
    MarkFramingResource,
    PostmarkValuationResource,
)

# FK-dependency order: each entry is (ResourceClass, filename)
MODEL_FILES = [
    (ColorResource,           "color.csv"),
    (ShapeResource,           "shape.csv"),
    (LetteringResource,       "lettering.csv"),
    (FramingResource,         "framing.csv"),
    (RegionResource,          "region.csv"),
    (PostOfficeResource,      "post_office.csv"),
    (CoverResource,           "cover.csv"),
    (RatemarkResource,        "ratemark.csv"),
    (PostmarkResource,        "postmark.csv"),
    (AuxmarkResource,         "auxmark.csv"),
    (DateObservedResource,    "date_observed.csv"),
    (PostmarkRatemarkResource, "postmark_ratemark.csv"),
    (CoverPostmarkResource,   "cover_postmark.csv"),
    (MarkFramingResource,     "mark_framing.csv"),
    (PostmarkValuationResource, "postmark_valuation.csv"),
]


def _inject_user_columns(dataset, user_id):
    """Add created_by/modified_by columns if absent (notebook CSVs omit them)."""
    for col in ("created_by", "modified_by"):
        if col not in (dataset.headers or []):
            dataset.append_col([user_id] * len(dataset), header=col)


class Command(BaseCommand):
    help = "Batch-import catalog CSVs using the same resource classes as the admin import panel."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dir", "-d",
            default="tools/wip/out",
            help="Directory containing CSV files (default: tools/wip/out)",
        )
        parser.add_argument(
            "--user", "-u",
            default=None,
            help="Username for created_by/modified_by when columns are absent (default: first superuser)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Validate without writing — reports what would be created/updated",
        )
        parser.add_argument(
            "--truncate",
            action="store_true",
            default=False,
            help="Delete all existing rows in each target table (reverse FK order) before importing",
        )

    def _get_user(self, username):
        User = get_user_model()
        if username:
            try:
                return User.objects.get(username=username)
            except User.DoesNotExist:
                raise CommandError(f"User not found: {username}")
        user = User.objects.filter(is_superuser=True).first()
        if not user:
            raise CommandError("No superuser found; pass --user explicitly")
        return user

    def handle(self, *args, **options):
        dir_ = options["dir"]
        dry_run = options["dry_run"]
        truncate = options["truncate"]
        user = self._get_user(options.get("user"))

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be saved\n"))

        if truncate and not dry_run:
            self.stdout.write(self.style.WARNING("TRUNCATE — clearing target tables in reverse FK order"))
            for resource_class, filename in reversed(MODEL_FILES):
                model = resource_class._meta.model
                n, _ = model._default_manager.all().delete()
                self.stdout.write(f"  {model.__name__:<24s} -{n} rows")
            self.stdout.write("")
        elif truncate and dry_run:
            self.stdout.write(self.style.WARNING("--truncate ignored under --dry-run\n"))

        total_new = total_updated = total_errors = 0

        for resource_class, filename in MODEL_FILES:
            path = os.path.join(dir_, filename)
            if not os.path.exists(path):
                self.stdout.write(f"  SKIP  {filename} (not found)")
                continue

            with open(path, newline="", encoding="utf-8-sig") as f:
                content = f.read()

            dataset = tablib.Dataset().load(content)
            _inject_user_columns(dataset, user.pk)

            resource = resource_class()
            result = resource.import_data(dataset, dry_run=dry_run, raise_errors=False)

            n_new = result.totals.get("new", 0)
            n_updated = result.totals.get("update", 0)
            n_skipped = result.totals.get("skip", 0)
            n_errors = result.totals.get("error", 0) + len(result.invalid_rows)

            total_new += n_new
            total_updated += n_updated
            total_errors += n_errors

            status = self.style.SUCCESS("  OK") if not n_errors else self.style.ERROR(" ERR")
            self.stdout.write(
                f"{status}  {filename}: "
                f"+{n_new} new, ~{n_updated} updated, {n_skipped} skipped, {n_errors} errors"
            )

            for err in result.base_errors[:3]:
                self.stdout.write(f"        {err.error}")
            for row in result.invalid_rows[:3]:
                self.stdout.write(f"        row {row.number}: {row.error}")
            # result.rows carries per-row errors raised during save (FK misses,
            # unique violations, etc.) — invalid_rows only covers validation
            shown = 0
            for i, row in enumerate(result.rows, start=1):
                if row.errors and shown < 3:
                    for e in row.errors:
                        self.stdout.write(f"        row {i}: {e.error} | row_data={row.row_values}")
                        shown += 1
                        if shown >= 3:
                            break

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone: +{total_new} new, ~{total_updated} updated, {total_errors} errors"
            )
        )
