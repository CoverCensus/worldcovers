from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from common.collection_archive import json_text
from common.collection_restore import verify_collection


class Command(BaseCommand):
    help = "Compare a restored Collection and its image files with its bundle."

    def add_arguments(self, parser):
        parser.add_argument("path", type=Path)
        parser.add_argument("--report", type=Path)

    def handle(self, *args, **options):
        report_path = Path(options["report"]) if options["report"] else None
        if report_path and report_path.resolve().is_relative_to(options["path"].resolve()):
            raise CommandError("Write the verification report outside the bundle.")
        report = verify_collection(options["path"])
        if report_path:
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(json_text(report), encoding="ascii")
        self.stdout.write(f"Collection verified: {report['records_checked']} records, {report['files_checked']} files.")
