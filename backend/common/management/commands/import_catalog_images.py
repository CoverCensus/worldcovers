"""
Import catalog-extracted images as PostmarkImages.

Expects image files already dropped under MEDIA_ROOT (typically MEDIA_ROOT/<state>/<filename>)
and a CSV mapping one row per image with columns:

    postmark_key        required; matched against Postmark.code, with a ".0" suffix fallback
                        (base records are stored as "<code>.0"; variants as ".1", ".2", ...)
    storage_filename    required; path relative to MEDIA_ROOT (e.g. "iowa/IA-ABC-123-1.jpg")
    display_order       optional int, default 0
    image_view          optional; FULL | DETAIL | COMPARISON, default FULL
    image_description   optional free text
"""
import csv
import os
import tempfile
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from common.images import read_image_metadata_from_path
from common.models import Postmark, PostmarkImage


VALID_IMAGE_VIEWS = {"FULL", "DETAIL", "COMPARISON"}
REQUIRED_COLUMNS = {"postmark_key", "storage_filename"}

# Row-level outcomes returned by _process_row. Tokens prefixed "drop_" mark
# rows that --clean should strip from the source CSV (blank filename or file
# missing on disk). Everything else is retained so the user can investigate.
RESULT_CREATED = "created"
RESULT_UPDATED = "updated"
DROP_MISSING_FILENAME = "drop_missing_filename"
DROP_MISSING_FILE = "drop_missing_file"


class Command(BaseCommand):
    help = "Import catalog-extracted postmark images from a CSV mapping."

    def add_arguments(self, parser):
        parser.add_argument("--csv", required=True, help="Path to mapping CSV.")
        parser.add_argument(
            "--user",
            default=None,
            help="Username for uploaded_by/created_by/modified_by (default: first superuser).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Parse and validate without writing to the database or CSV.",
        )
        parser.add_argument(
            "--truncate",
            action="store_true",
            default=False,
            help="Delete all existing PostmarkImage rows before importing.",
        )
        parser.add_argument(
            "--clean",
            action="store_true",
            default=False,
            help=(
                "Rewrite the source CSV, removing rows with blank filenames or "
                "whose image file is missing on disk. Preview with --dry-run."
            ),
        )

    def handle(self, *args, **options):
        csv_path = Path(options["csv"])
        if not csv_path.is_file():
            raise CommandError(f"CSV not found: {csv_path}")

        User = get_user_model()
        username = options.get("user")
        if username:
            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                raise CommandError(f"User not found: {username}")
        else:
            user = User.objects.filter(is_superuser=True).first()
            if not user:
                raise CommandError("No superuser found; pass --user.")

        dry_run = options["dry_run"]
        truncate = options["truncate"]
        clean = options["clean"]
        media_root = Path(settings.MEDIA_ROOT)

        if truncate and not dry_run:
            n, _ = PostmarkImage.objects.all().delete()
            self.stdout.write(self.style.WARNING(
                f"TRUNCATE — deleted {n} PostmarkImage rows"
            ))
        elif truncate and dry_run:
            self.stdout.write(self.style.WARNING("--truncate ignored under --dry-run"))

        created = updated = skipped = 0
        kept_rows = []
        dropped_rows = []  # (lineno, reason, row)

        with open(csv_path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            fieldnames = list(reader.fieldnames or [])
            missing = REQUIRED_COLUMNS - set(fieldnames)
            if missing:
                raise CommandError(f"CSV missing required columns: {sorted(missing)}")

            with transaction.atomic():
                for lineno, row in enumerate(reader, start=2):
                    result = self._process_row(row, media_root, user.pk, dry_run)
                    if result == RESULT_CREATED:
                        created += 1
                    elif result == RESULT_UPDATED:
                        updated += 1
                    else:
                        skipped += 1
                        self.stdout.write(f"  line {lineno}: skipped ({result})")

                    if result in (DROP_MISSING_FILENAME, DROP_MISSING_FILE):
                        dropped_rows.append((lineno, result, row))
                    else:
                        kept_rows.append(row)

                if dry_run:
                    transaction.set_rollback(True)

        if clean:
            self._apply_clean(csv_path, fieldnames, kept_rows, dropped_rows, dry_run)

        self.stdout.write(self.style.SUCCESS(
            f"Done. created={created} updated={updated} skipped={skipped}"
            f"{' (dry-run, rolled back)' if dry_run else ''}"
        ))

    def _apply_clean(self, csv_path, fieldnames, kept_rows, dropped_rows, dry_run):
        if not dropped_rows:
            self.stdout.write("--clean: no rows to remove")
            return

        if dry_run:
            self.stdout.write(self.style.WARNING(
                f"--clean --dry-run: would remove {len(dropped_rows)} rows from {csv_path.name}"
            ))
            return

        # Atomic replace: write to a temp file in the same dir, then rename.
        tmp_fd, tmp_path = tempfile.mkstemp(
            prefix=csv_path.stem + ".", suffix=".tmp", dir=str(csv_path.parent)
        )
        try:
            with os.fdopen(tmp_fd, "w", newline="", encoding="utf-8") as out:
                writer = csv.DictWriter(out, fieldnames=fieldnames)
                writer.writeheader()
                for row in kept_rows:
                    writer.writerow({k: row.get(k, "") for k in fieldnames})
            os.replace(tmp_path, csv_path)
        except Exception:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            raise

        self.stdout.write(self.style.WARNING(
            f"--clean: removed {len(dropped_rows)} rows from {csv_path.name}"
        ))

    def _process_row(self, row, media_root: Path, user_id: int, dry_run: bool) -> str:
        postmark_key = (row.get("postmark_key") or "").strip()
        storage_filename = (row.get("storage_filename") or "").strip()
        if not storage_filename:
            return DROP_MISSING_FILENAME
        if not postmark_key:
            return "missing postmark_key"

        postmark = (
            Postmark.objects.filter(code=postmark_key).first()
            or Postmark.objects.filter(code=f"{postmark_key}.0").first()
        )
        if not postmark:
            return f"no postmark with code={postmark_key}"

        abs_path = media_root / storage_filename
        metadata = read_image_metadata_from_path(abs_path)
        if metadata is None:
            return DROP_MISSING_FILE

        image_view = (row.get("image_view") or "FULL").strip().upper() or "FULL"
        if image_view not in VALID_IMAGE_VIEWS:
            return f"invalid image_view: {image_view}"

        try:
            display_order = int((row.get("display_order") or "0").strip() or 0)
        except ValueError:
            return f"invalid display_order: {row.get('display_order')!r}"

        defaults = {
            "original_filename": Path(storage_filename).name[:255],
            "image_view": image_view,
            "image_description": (row.get("image_description") or "").strip(),
            "display_order": display_order,
            "uploaded_by_id": user_id,
            "created_by_id": user_id,
            "modified_by_id": user_id,
            **metadata,
        }

        if dry_run:
            exists = PostmarkImage.objects.filter(
                postmark=postmark, storage_filename=storage_filename
            ).exists()
            return RESULT_UPDATED if exists else RESULT_CREATED

        _, created_flag = PostmarkImage.objects.update_or_create(
            postmark=postmark,
            storage_filename=storage_filename,
            defaults=defaults,
        )
        return RESULT_CREATED if created_flag else RESULT_UPDATED
