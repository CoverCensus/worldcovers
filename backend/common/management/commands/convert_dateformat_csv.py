"""
Convert legacy tblTownmarkDateFormat.csv to admin import-ready CSV.

Usage:
  python manage.py convert_dateformat_csv path/to/tblTownmarkDateFormat.csv --output dateformat_import.csv --user-id 1

Then upload dateformat_import.csv at /admin/postmarks/dateformat/import/
"""
import csv
import os

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Convert legacy tblTownmarkDateFormat CSV to admin import format (date_format_id, format_name, format_description, created_by, modified_by)."

    def add_arguments(self, parser):
        parser.add_argument(
            "input_path",
            type=str,
            help="Path to legacy CSV (e.g. tblTownmarkDateFormat.csv)",
        )
        parser.add_argument(
            "--output",
            "-o",
            type=str,
            default=None,
            help="Output CSV path (default: input_import_ready.csv next to input)",
        )
        parser.add_argument(
            "--user-id",
            type=int,
            default=1,
            help="User ID to set for created_by and modified_by (default: 1)",
        )

    def handle(self, *args, **options):
        input_path = options["input_path"]
        user_id = options["user_id"]
        output_path = options["output"]

        if not os.path.isfile(input_path):
            raise CommandError(f"Input file not found: {input_path}")

        if output_path is None:
            base, ext = os.path.splitext(input_path)
            output_path = f"{base}_import_ready{ext}"

        # Map legacy column names to import headers (case-sensitive in CSV)
        id_cols = ("nTownmarkDateFormatID", "date_format_id")
        name_cols = ("txtTownmarkDateFormat", "format_name")
        desc_cols = ("memTownmarkDateFormat", "format_description")

        out_headers = ["date_format_id", "format_name", "format_description", "created_by", "modified_by"]

        with open(input_path, newline="", encoding="utf-8-sig") as inf:
            reader = csv.DictReader(inf)
            in_headers = reader.fieldnames or []
            # Resolve legacy column names (any case for robustness)
            in_lower = {h.strip().lower(): h for h in in_headers}
            id_key = next((k for k in in_lower if "townmarkdateformatid" in k or k == "date_format_id"), None)
            name_key = next((k for k in in_lower if "txttownmarkdateformat" in k or k == "format_name"), None)
            desc_key = next((k for k in in_lower if "memtownmarkdateformat" in k or k == "format_description"), None)

            if not id_key or not name_key:
                raise CommandError(
                    f"Input CSV must have an ID column (e.g. nTownmarkDateFormatID) and a name column (e.g. txtTownmarkDateFormat). Found: {in_headers}"
                )
            id_header = in_lower[id_key]
            name_header = in_lower[name_key]
            desc_header = in_lower.get(desc_key) if desc_key else None

            rows = []
            for row in reader:
                raw_id = row.get(id_header, "").strip()
                raw_name = row.get(name_header, "").strip()
                raw_desc = (row.get(desc_header, "").strip() if desc_header else "") or ""
                if raw_id == "" and raw_name == "":
                    continue
                # NULL from export as literal string
                if raw_desc.upper() == "NULL":
                    raw_desc = ""
                rows.append({
                    "date_format_id": raw_id,
                    "format_name": raw_name or "n/a",
                    "format_description": raw_desc,
                    "created_by": str(user_id),
                    "modified_by": str(user_id),
                })

        with open(output_path, "w", newline="", encoding="utf-8") as outf:
            writer = csv.DictWriter(outf, fieldnames=out_headers)
            writer.writeheader()
            writer.writerows(rows)

        self.stdout.write(self.style.SUCCESS(f"Wrote {len(rows)} rows to {output_path}"))
        self.stdout.write("Upload this file at: /admin/postmarks/dateformat/import/")
