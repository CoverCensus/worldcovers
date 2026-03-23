"""
Import reference/lookup CSVs (from docs/data_model-v1.erd) into catalog tables.

Reads CSV files from a directory and uses the same import logic as Admin CSV Upload
(states → AdministrativeUnit/Identity, lettering → LetteringStyle, etc.).

Usage:
  python manage.py import_reference_csv --dir "frontend/public/Old Data"
  python manage.py import_reference_csv --dir /path/to/csvs --user admin

Run this before import_ascc if you want reference tables populated from the same CSVs.
"""
import csv
import io
import os

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from common.csv_import import IMPORTERS


# CSV filename → import_type for reference tables (ERD: TBLSTATES, TBLTOWNMARK*, etc.)
REFERENCE_CSV_MAP = {
    "tblStates.csv": "states",
    "tblTownmarkLettering.csv": "lettering",
    "tblTownmarkFraming.csv": "framing",
    "tblTownmarkDateFormat.csv": "date_format",
}


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
        "Import reference CSVs (states, lettering, framing, date_format) from a directory "
        "into catalog tables. Same logic as Admin CSV Upload import."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dir",
            "-d",
            default="imports",
            help="Directory containing CSV files (default: backend/imports)",
        )
        parser.add_argument(
            "--user",
            "-u",
            default=None,
            help="Username for created_by/modified_by (default: first superuser)",
        )
        parser.add_argument(
            "--only",
            choices=list(REFERENCE_CSV_MAP.values()),
            action="append",
            dest="only",
            help="Run only these import types (can repeat). Default: all.",
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

        only = set(options["only"] or [])

        for filename, import_type in REFERENCE_CSV_MAP.items():
            if only and import_type not in only:
                continue
            data = parse_csv_path(dir_path, filename)
            if data is None:
                self.stdout.write(self.style.WARNING(f"Skip (file not found): {filename}"))
                continue
            if not data.get("rows"):
                self.stdout.write(self.style.WARNING(f"Skip (no rows): {filename}"))
                continue

            importer = IMPORTERS.get(import_type)
            if not importer:
                self.stdout.write(self.style.WARNING(f"No importer for: {import_type}"))
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
                for err in errors[:5]:
                    self.stderr.write(self.style.WARNING(f"  {err}"))
                if len(errors) > 5:
                    self.stderr.write(
                        self.style.WARNING(f"  ... and {len(errors) - 5} more errors")
                    )
            except Exception as e:
                self.stderr.write(
                    self.style.ERROR(f"{filename} → {import_type}: {e!s}")
                )
