from pathlib import Path

from django.core.management.base import BaseCommand

from common.collection_restore import restore_collection


class Command(BaseCommand):
    help = "Restore a Collection bundle without overwriting conflicting data."

    def add_arguments(self, parser):
        parser.add_argument("path", type=Path)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        count = restore_collection(options["path"], dry_run=options["dry_run"])
        prefix = "Dry run passed; no changes committed." if options["dry_run"] else "Collection restored."
        self.stdout.write(f"{prefix} Records checked: {count}.")
