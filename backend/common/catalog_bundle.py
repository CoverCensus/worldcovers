"""Load catalog bundle CSVs in dependency order and one transaction."""
import csv
import json
import os
import tablib
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from import_export.results import RowResult

from common.date_range import suppress_date_range_recompute

from common.admin import (
    CitationResource,
    ColorResource,
    CoverMarkingResource,
    CoverResource,
    CoverValuationResource,
    DateSeenResource,
    ImageResource,
    LetteringResource,
    MarkingResource,
    PostOfficeRegionResource,
    PostOfficeResource,
    ReferenceWorkResource,
    RegionResource,
    ShapeResource,
)
from common.models import CatalogSourceItem, Collection, CollectionAssignment, Region


# Stem -> Resource class. The stem is the CSV basename without extension.
RESOURCES = {
    "colors": ColorResource,
    "letterings": LetteringResource,
    "shapes": ShapeResource,
    "regions": RegionResource,
    "reference_works": ReferenceWorkResource,
    "post_offices": PostOfficeResource,
    "post_office_regions": PostOfficeRegionResource,
    "markings": MarkingResource,
    "covers": CoverResource,
    "dates_seen": DateSeenResource,
    "cover_valuations": CoverValuationResource,
    "cover_markings": CoverMarkingResource,
    "citations": CitationResource,
    "images": ImageResource,
}

# Dependency-safe load order. Parents before children:
#   colors, letterings, shapes, regions     -- pure leaf lookups
#   reference_works                         -- leaf lookup (citation parent)
#   post_offices                            -- depends on nothing (region link is in junction)
#   post_office_regions                     -- depends on post_offices and regions
#   markings                                -- depends on shape, lettering, optional color, post_office
#   covers                                  -- depends on color
#   cover_valuations                        -- depends on cover
#   dates_seen                              -- polymorphic; depends on cover and/or marking
#   cover_markings                          -- depends on cover + marking
#   citations                               -- depends on reference_work + marking (via subject_id)
#   images                                  -- depends on marking (subject_id) and user (uploaded_by)
BUNDLE_LOAD_ORDER = (
    "colors",
    "letterings",
    "shapes",
    "regions",
    "reference_works",
    "post_offices",
    "post_office_regions",
    "markings",
    "covers",
    "cover_valuations",
    "dates_seen",
    "cover_markings",
    "citations",
    "images",
)

# Stems whose CSV may be absent from the bundle without --allow-missing.
# Older and hand-built bundles may omit all cover-side files. Current munger
# bundles emit Covers and CoverMarkings only for institutional listings and
# still omit CoverValuations. dates_seen.csv is NOT optional: the munger emits
# MARKING-scoped DateSeen rows anchored to markings.
OPTIONAL_STEMS = frozenset({
    "covers",
    "cover_markings",
    "cover_valuations",
})

TRUNCATE_EXTRA_MODELS = (
    CatalogSourceItem,
    CollectionAssignment,
    Collection,
)


def _load_dataset(path):
    """Read a CSV from disk into a tablib.Dataset with headers."""
    with open(path, "r", encoding="utf-8", newline="") as fh:
        csv_text = fh.read()
    dataset = tablib.Dataset()
    dataset.load(csv_text, format="csv")
    return dataset


def _ensure_collections_for_regions(stdout):
    """
    Create missing Collections for State, Territory, and District Regions.

    Collection has a OneToOneField to Region (on_delete=PROTECT), and the
    admin Editor-assignment form filters Collection.objects.filter(is_active=True)
    in common.admin.CollectionUserChangeForm. The munger bundle does NOT emit
    a collections.csv, so without this step a freshly imported Region has no
    Collection wrapper and Editors cannot be assigned to it.

    Idempotent: skips Regions that already have a Collection. Names the new
    Collection after the Region. Attribution falls back to the first superuser,
    then the first user.

    Returns the number of Collections created.
    """
    User = Collection._meta.get_field("created_by").related_model
    creator = (
        User.objects.filter(is_superuser=True).order_by("pk").first()
        or User.objects.order_by("pk").first()
    )
    if creator is None:
        # No users -- cannot satisfy TimestampedModel created_by/modified_by.
        # In a real environment this never happens; bail clearly.
        raise CommandError(
            "Cannot auto-create Collections: no User exists to attribute creation to."
        )

    missing = Region.objects.filter(
        collection__isnull=True,
        region_tier__in=("STATE", "TERRITORY", "DISTRICT"),
    ).order_by("pk")
    created = 0
    for region in missing:
        Collection.objects.create(
            name=region.name,
            description="",
            region_id=region.pk,
            is_active=True,
            created_by_id=creator.pk,
            modified_by_id=creator.pk,
        )
        created += 1
    if created:
        stdout.write(f"  collections      auto-created={created:>5d}")
    else:
        stdout.write("  collections      auto-created=    0  (no eligible Regions need one)")
    return created


def _summarize_errors(result, max_errors=5):
    """Return a list of human-readable strings for the first N row/validation errors."""
    out = []
    # Resource-level errors, for example missing import_id_fields headers.
    for err in getattr(result, "base_errors", []):
        out.append(f"base error: {err.error!s}")
        if len(out) >= max_errors:
            return out
    # Row-level exceptions (e.g. FK lookup failed, type cast failed)
    for row_num, errs in result.row_errors():
        for e in errs:
            out.append(f"row {row_num}: {e.error!s}")
            if len(out) >= max_errors:
                return out
    # Validation errors (raised by Resource.before_import_row, model.full_clean, etc.)
    for inv in result.invalid_rows:
        out.append(f"row {inv.number}: invalid -- {inv.error_dict or inv.error}")
        if len(out) >= max_errors:
            return out
    return out


def _skip_report_path(directory, option_value):
    """Return the CSV path used for skipped row diagnostics."""
    if option_value:
        return option_value
    return os.path.join(directory, "import_ascc_bundle_skips.csv")


def _source_row_key(row_values):
    """Return the most useful natural key visible in an import row."""
    if not isinstance(row_values, dict):
        return ""
    for key in (
        "code",
        "name",
        "subject_id",
        "cover",
        "cover_code",
        "marking",
        "marking_code",
        "post_office",
        "region",
        "reference_work",
    ):
        value = str(row_values.get(key) or "").strip()
        if value:
            return f"{key}={value}"
    return ""


def _dataset_rows(dataset):
    """Return import rows exactly as they appeared in the source CSV."""
    headers = list(dataset.headers or [])
    return [dict(zip(headers, row)) for row in dataset]


def _append_skipped_rows(skipped_rows, stem, result, dataset):
    """Append skipped row diagnostics from a django-import-export result."""
    source_rows = _dataset_rows(dataset)
    for row_number, row_result in enumerate(result.rows, start=1):
        if row_result.import_type != RowResult.IMPORT_TYPE_SKIP:
            continue
        row_values = {}
        if row_number <= len(source_rows):
            row_values = source_rows[row_number - 1]
        if not row_values:
            row_values = row_result.row_values or {}
        skipped_rows.append({
            "stem": stem,
            "row_number": row_number,
            "source_key": _source_row_key(row_values),
            "object_id": row_result.object_id or "",
            "object_repr": row_result.object_repr or "",
            "row_values_json": json.dumps(
                row_values,
                ensure_ascii=True,
                sort_keys=True,
                default=str,
            ),
        })


def _write_skip_report(path, rows):
    """Write skipped import rows to a CSV report."""
    fieldnames = [
        "stem",
        "row_number",
        "source_key",
        "object_id",
        "object_repr",
        "row_values_json",
    ]
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({name: row.get(name, "") for name in fieldnames})


class CatalogBundleCommand(BaseCommand):
    def handle(self, *args, **options):
        directory = options["directory"]
        if not os.path.isdir(directory):
            raise CommandError(f"Not a directory: {directory}")

        truncate = bool(options["truncate"])
        if truncate and options["only"]:
            raise CommandError(
                "--truncate is incompatible with --only: a partial truncate "
                "would leave dangling FKs. Drop --only or drop --truncate."
            )

        if options["only"]:
            requested = {s.strip() for s in options["only"].split(",") if s.strip()}
            unknown = requested - set(BUNDLE_LOAD_ORDER)
            if unknown:
                raise CommandError(f"Unknown stem(s): {sorted(unknown)}")
            order = [s for s in BUNDLE_LOAD_ORDER if s in requested]
        else:
            order = list(BUNDLE_LOAD_ORDER)

        dry_run = bool(options["dry_run"])
        if dry_run:
            self.stdout.write(self.style.NOTICE("DRY RUN: no rows will be committed."))

        # Pre-validate that every requested stem has a CSV before opening the
        # outer transaction. Catches typos in --only and missing-file errors
        # without rolling back any work. Stems in OPTIONAL_STEMS are allowed
        # to be absent unconditionally; --allow-missing widens that to every
        # stem.
        for stem in order:
            path = os.path.join(directory, f"{stem}.csv")
            if os.path.isfile(path):
                continue
            if stem in OPTIONAL_STEMS or options["allow_missing"]:
                continue
            raise CommandError(f"Missing CSV: {path}")

        totals = {"new": 0, "update": 0, "skip": 0, "invalid": 0, "error": 0}
        skipped_rows = []
        skip_report = _skip_report_path(directory, options["skip_report"])
        is_mysql = connection.vendor == "mysql"

        # Single outer transaction covers truncate + every per-stem import.
        # Any uncaught exception escaping this block (CommandError or
        # otherwise) triggers an automatic rollback of EVERYTHING done so
        # far, so the DB is restored to its pre-command state. --dry-run
        # uses set_rollback(True) at the end of a successful pass for the
        # same effect.
        try:
            # suppress_date_range_recompute: skip per-row cache refreshes from
            # the DateSeen/CoverMarking signal receivers during the bulk load;
            # one set-based recompute below covers the whole bundle.
            with transaction.atomic(), suppress_date_range_recompute():
                if truncate:
                    self.stdout.write(self.style.NOTICE(
                        "Truncating ASCC catalog and collection tables..."
                    ))
                    # Raw DELETE FROM with FOREIGN_KEY_CHECKS off (MySQL) so
                    # the wipe bypasses on_delete=PROTECT FKs from outside-
                    # catalog tables (e.g. Collection.region). DELETE (not
                    # TRUNCATE) is used because TRUNCATE is implicitly
                    # committed in MySQL and would defeat the outer rollback
                    # contract.
                    with connection.cursor() as cursor:
                        if is_mysql:
                            cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
                        try:
                            for model in TRUNCATE_EXTRA_MODELS:
                                table = model._meta.db_table
                                cursor.execute(f"DELETE FROM `{table}`")
                                self.stdout.write(
                                    f"  truncate {table:<18s} deleted={cursor.rowcount}"
                                )
                            for stem in reversed(BUNDLE_LOAD_ORDER):
                                model = RESOURCES[stem]._meta.model
                                table = model._meta.db_table
                                cursor.execute(f"DELETE FROM `{table}`")
                                self.stdout.write(
                                    f"  truncate {stem:<18s} deleted={cursor.rowcount}"
                                )
                        finally:
                            if is_mysql:
                                cursor.execute("SET FOREIGN_KEY_CHECKS = 1")

                for stem in order:
                    path = os.path.join(directory, f"{stem}.csv")
                    if not os.path.isfile(path):
                        # allow_missing = True (already validated above for
                        # the !allow_missing case).
                        self.stdout.write(f"  {stem:<18s} (missing, skipped)")
                        continue

                    dataset = _load_dataset(path)
                    resource = RESOURCES[stem]()
                    resource._meta.store_row_values = True

                    try:
                        # Always pass dry_run=False to django-import-export.
                        # Their dry_run path enables a per-resource atomic
                        # block AND calls set_rollback(True) at the end of
                        # each stem, which would undo the rows just inserted
                        # before the next stem can resolve FKs against them
                        # (e.g. post_office_regions -> post_offices). The
                        # outer atomic in this command + transaction.set_rollback(True)
                        # at the tail handles dry-run semantics for the
                        # whole bundle in one shot.
                        result = resource.import_data(
                            dataset,
                            dry_run=False,
                            raise_errors=False,
                            use_transactions=False,
                            collect_failed_rows=True,
                        )
                    except Exception as exc:
                        raise CommandError(f"{stem}: {exc!s}") from exc

                    stem_totals = dict(result.totals or {})
                    new = int(stem_totals.get("new", 0) or 0)
                    update = int(stem_totals.get("update", 0) or 0)
                    skip = int(stem_totals.get("skip", 0) or 0)
                    invalid = int(stem_totals.get("invalid", 0) or 0)
                    error = int(stem_totals.get("error", 0) or 0)

                    totals["new"] += new
                    totals["update"] += update
                    totals["skip"] += skip
                    totals["invalid"] += invalid
                    totals["error"] += error
                    if skip:
                        _append_skipped_rows(skipped_rows, stem, result, dataset)

                    self.stdout.write(
                        f"  {stem:<18s}  new={new:>5d}  update={update:>5d}  "
                        f"skip={skip:>5d}  invalid={invalid:>4d}  error={error:>4d}"
                    )

                    if result.has_errors() or result.has_validation_errors():
                        msgs = _summarize_errors(result, max_errors=5)
                        for m in msgs:
                            self.stdout.write(self.style.WARNING(f"    ! {m}"))
                        remaining = (error + invalid) - len(msgs)
                        if remaining > 0:
                            self.stdout.write(self.style.WARNING(f"    ... ({remaining} more)"))
                        # Raising inside the atomic block triggers automatic
                        # rollback of every prior stem AND the truncate.
                        raise CommandError(
                            f"{stem}: import failed with errors; bundle rolled back."
                        )

                # Create missing State, Territory, and District Collections.
                # The munger bundle does not emit collections.csv, so we
                # backfill here. Only runs when regions were part of this
                # import (otherwise --only markings, etc. would do unrelated
                # work). Inside the outer atomic block, so --dry-run rolls
                # this back too.
                if "regions" in order:
                    _ensure_collections_for_regions(self.stdout)

                # Refresh the marking date-range cache columns in one
                # set-based pass (issue #59). Inside the outer atomic so a
                # failed/dry-run bundle rolls this back with everything else.
                self.stdout.write("  recomputing marking date-range cache...")
                call_command("recompute_marking_date_ranges", "--all")

                # Successful pass through every stem. Under --dry-run, mark
                # the outer transaction for rollback so the bundle never
                # commits.
                if dry_run:
                    transaction.set_rollback(True)
        except CommandError:
            self.stdout.write(self.style.ERROR(
                "Bundle aborted; all changes rolled back (no partial state left in DB)."
            ))
            raise

        _write_skip_report(skip_report, skipped_rows)

        self.stdout.write("")
        summary = (
            f"Done. new={totals['new']}  update={totals['update']}  "
            f"skip={totals['skip']}  invalid={totals['invalid']}  "
            f"error={totals['error']}"
        )
        if dry_run:
            summary = "[DRY RUN] " + summary
        self.stdout.write(self.style.SUCCESS(summary))
        self.stdout.write(f"Skipped-row report: {skip_report} ({len(skipped_rows)} row(s))")
