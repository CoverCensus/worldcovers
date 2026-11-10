"""Queue ASCC Entries for Editor review or run an explicit maintenance load."""

from pathlib import Path

from common.catalog_bundle import CatalogBundleCommand
from common.catalog_import import import_catalog
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.core.management.base import CommandError
from import_export.exceptions import ImportExportError


class Command(CatalogBundleCommand):
    help = __doc__

    def handle(self, *args, **options):
        selected = {s.strip() for s in (options["only"] or "").split(",") if s.strip()}
        lookup_only = selected and selected <= {
            "colors",
            "letterings",
            "shapes",
            "regions",
            "reference_works",
            "post_office_regions",
        }
        if options["direct"] or options["truncate"] or lookup_only:
            if (
                options["refresh_pending"]
                or options["review_report"]
                or options["actor"] is not None
            ):
                raise CommandError("Review options require a reviewed bundle import.")
            return super().handle(*args, **options)
        if selected:
            raise CommandError(
                "Review Entries with the full bundle. Use --direct for a partial maintenance load."
            )
        directory = Path(options["directory"])
        actor_id = options["actor"] if options["actor"] is not None else 1
        try:
            actor = get_user_model().objects.get(pk=actor_id)
            report = (
                options["review_report"] or options["skip_report"] or directory / "ascc_review.csv"
            )
            import_catalog(
                directory,
                actor,
                options["dry_run"],
                self.stdout,
                report,
                options["refresh_pending"],
                allow_missing=options["allow_missing"],
            )
        except (
            ValueError,
            OSError,
            KeyError,
            ObjectDoesNotExist,
            ValidationError,
            ImportExportError,
        ) as exc:
            raise CommandError(ascii(str(exc))) from exc
        self.stdout.write(f"Review report: {report}")

    def add_arguments(self, parser):
        parser.add_argument(
            "--direct",
            action="store_true",
            help="Maintenance load by exact code, bypassing Editor review.",
        )
        parser.add_argument("--actor", type=int, help="User ID for reviewed imports (default 1).")
        parser.add_argument(
            "--refresh-pending",
            action="store_true",
            help="Rebuild pending proposals against current evidence.",
        )
        parser.add_argument("--review-report", help="Write the proposed actions to this CSV.")

        parser.add_argument(
            "directory",
            help="Path to the directory containing the bundle CSVs.",
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
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help=(
                "Run the importer in dry-run mode: parse + validate every CSV, "
                "but roll back all transactions instead of committing."
            ),
        )
        parser.add_argument(
            "--truncate",
            action="store_true",
            help=(
                "Before importing, delete every row from all ASCC catalog "
                "tables plus generated Collection wrappers. Incompatible with "
                "--only (a partial truncate would hit FK constraints). Under "
                "--dry-run the truncate is rolled back too."
            ),
        )
        parser.add_argument(
            "--skip-report",
            default=None,
            help=(
                "Path for skipped-row diagnostics. Defaults to "
                "<directory>/import_ascc_bundle_skips.csv."
            ),
        )
