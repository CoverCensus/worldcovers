"""
APMC = American Postal Markings Compendium (umbrella dataset).

Today this command is a thin pass-through to import_ascc_bundle (the
American Stampless Cover Catalog importer). When sister catalogs land
(e.g. import_vphc_bundle for the Virginia Postal History Catalog),
this umbrella will dispatch to each in turn.

Usage:
    python manage.py import_apmc_bundle ./tools/wip/out/
    python manage.py import_apmc_bundle ./out/ --only markings,covers
    python manage.py import_apmc_bundle ./out/ --dry-run
"""
from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Umbrella importer for the APMC dataset. Today delegates to "
        "import_ascc_bundle; future catalogs will be added to the dispatch list."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "directory",
            help="Path to the directory containing the bundle CSVs.",
        )
        parser.add_argument(
            "--only",
            default=None,
            help=(
                "Comma-separated list of stems to load (e.g. 'colors,markings'). "
                "Forwarded verbatim to the dispatched bundle command."
            ),
        )
        parser.add_argument(
            "--allow-missing",
            action="store_true",
            help="Skip stems whose CSV file is absent instead of failing.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate every CSV but roll back instead of committing.",
        )
        parser.add_argument(
            "--truncate",
            action="store_true",
            help=(
                "Before importing, delete every row from all catalog tables "
                "in reverse dependency order. Incompatible with --only."
            ),
        )

    def handle(self, *args, **options):
        kwargs = {
            "only": options["only"],
            "allow_missing": options["allow_missing"],
            "dry_run": options["dry_run"],
            "truncate": options["truncate"],
        }
        call_command("import_ascc_bundle", options["directory"], **kwargs)
