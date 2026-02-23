"""
Import all 13 CSV files from the ERD (docs/data_model-v1.erd) directly into the database.

Reads from a directory (e.g. frontend/public/Old Data), runs reference and legacy
importers, then runs import_ascc for raw state data and townmark images.

Usage:
  python manage.py import_all_legacy_csv --dir "frontend/public/Old Data"
  python manage.py import_all_legacy_csv --dir /path/to/csvs --user admin
"""
import csv
import io
import os

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from common.csv_import import IMPORTERS


# All 13 ERD CSVs: filename → import_type (must exist in IMPORTERS)
# tblRawStateData.csv and tblTownmarkImages.csv are imported via import_ascc at the end.
ALL_ERD_CSV_MAP = [
    ("tblStates.csv", "states"),
    ("tblAbbreviations.csv", "abbreviations"),
    ("tblTownmarkLettering.csv", "lettering"),
    ("tblTownmarkFraming.csv", "framing"),
    ("tblTownmarkDateFormat.csv", "date_format"),
    ("tblTownmarkRateLocation.csv", "rate_location"),
    ("tblTownmarkRateValue.csv", "rate_value"),
    ("tblParseSteps.csv", "parse_steps"),
    ("ctUserStates.csv", "user_states"),
    ("tblRawStateData_pendingUpdate.csv", "pending_updates"),
    ("tblCovers.csv", "legacy_covers"),
]


def parse_csv_path(dir_path, filename):
    """Read CSV and return { headers, rows } (same shape as AdminCsvUpload.data)."""
    filepath = os.path.join(dir_path, filename)
    if not os.path.isfile(filepath):
        return None
    with open(filepath, newline="", encoding="utf-8-sig", errors="replace") as f:
        content = f.read()
    reader = csv.reader(io.StringIO(content), quoting=csv.QUOTE_MINIMAL)
    rows = list(reader)
    if not rows:
        return {"headers": [], "rows": []}
    return {"headers": rows[0], "rows": rows[1:]}


class Command(BaseCommand):
    help = (
        "Import all 13 ERD CSV files from a directory into the database. "
        "Runs reference + legacy importers, then import_ascc (raw state data + images)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dir",
            "-d",
            default="imports",
            help="Directory containing the 13 CSV files (default: backend/imports)",
        )
        parser.add_argument(
            "--user",
            "-u",
            default=None,
            help="Username for created_by/modified_by (default: first superuser)",
        )
        parser.add_argument(
            "--skip-ascc",
            action="store_true",
            help="Skip import_ascc (states/raw data/images); only run the 11 CSV importers.",
        )

    def handle(self, *args, **options):
        User = get_user_model()
        dir_path = os.path.normpath(options["dir"])
        if not os.path.isdir(dir_path):
            self.stderr.write(self.style.ERROR(f"Directory not found: {dir_path}"))
            return

        username = options.get("user")
        if username:
            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                self.stderr.write(self.style.ERROR(f"User not found: {username}"))
                return
        else:
            user = User.objects.filter(is_superuser=True).first()
            if not user:
                self.stderr.write(
                    self.style.ERROR("No superuser found. Create one or pass --user.")
                )
                return
        self.stdout.write(f"Using user: {user.username} (id={user.pk})")

        # 1) Run all 11 CSV importers (tblStates through tblCovers)
        for filename, import_type in ALL_ERD_CSV_MAP:
            importer = IMPORTERS.get(import_type)
            if not importer:
                self.stderr.write(self.style.WARNING(f"No importer for: {import_type}"))
                continue
            data = parse_csv_path(dir_path, filename)
            if data is None:
                self.stdout.write(self.style.WARNING(f"Skip (file not found): {filename}"))
                continue
            if not data.get("rows"):
                self.stdout.write(self.style.WARNING(f"Skip (no rows): {filename}"))
                continue
            try:
                result = importer(data, user)
                created = result.get("created", 0)
                skipped = result.get("skipped", 0)
                errors = result.get("errors") or []
                self.stdout.write(
                    self.style.SUCCESS(
                        f"{filename} → {import_type}: created={created}, skipped={skipped}"
                    )
                )
                for err in errors[:3]:
                    self.stderr.write(self.style.WARNING(f"  {err}"))
                if len(errors) > 3:
                    self.stderr.write(
                        self.style.WARNING(f"  ... and {len(errors) - 3} more errors")
                    )
            except Exception as e:
                self.stderr.write(
                    self.style.ERROR(f"{filename} → {import_type}: {e!s}")
                )

        # 2) Run import_ascc for tblStates (again), tblRawStateData, tblTownmarkImages
        if not options.get("skip_ascc"):
            self.stdout.write(self.style.SUCCESS("Running import_ascc (states, raw state data, images)..."))
            call_command(
                "import_ascc",
                dir=dir_path,
                user=user.username,
                stdout=self.stdout,
                stderr=self.stderr,
            )
