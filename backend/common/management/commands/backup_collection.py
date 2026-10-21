from pathlib import Path

from django.core.management.base import BaseCommand

from common.collection_archive import backup_collection


class Command(BaseCommand):
    help = "Back up a Collection, its related records, and image files."

    def add_arguments(self, parser):
        parser.add_argument("collection_id", type=int)
        parser.add_argument("path", type=Path)

    def handle(self, *args, **options):
        backup_collection(options["collection_id"], options["path"])
        self.stdout.write("Collection backup completed and verified.")
