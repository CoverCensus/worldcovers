"""
Import catalog-extracted images as PostmarkImages.

Expects image files already dropped under MEDIA_ROOT (typically MEDIA_ROOT/<state>/<filename>)
and a CSV mapping one row per image with columns:

    postmark_key        required; matched against Postmark.code
    storage_filename    required; path relative to MEDIA_ROOT (e.g. "iowa/IA-ABC-123-1.jpg")
    display_order       optional int, default 0
    image_view          optional; FULL | DETAIL | COMPARISON, default FULL
    image_description   optional free text
"""
import csv
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from common.images import read_image_metadata_from_path
from common.models import Postmark, PostmarkImage


VALID_IMAGE_VIEWS = {"FULL", "DETAIL", "COMPARISON"}
REQUIRED_COLUMNS = {"postmark_key", "storage_filename"}


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
            help="Parse and validate without writing to the database.",
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
        media_root = Path(settings.MEDIA_ROOT)

        created = updated = skipped = 0

        with open(csv_path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
            if missing:
                raise CommandError(f"CSV missing required columns: {sorted(missing)}")

            with transaction.atomic():
                for lineno, row in enumerate(reader, start=2):
                    result = self._process_row(row, media_root, user.pk, dry_run)
                    if result == "created":
                        created += 1
                    elif result == "updated":
                        updated += 1
                    else:
                        skipped += 1
                        self.stdout.write(f"  line {lineno}: skipped ({result})")

                if dry_run:
                    transaction.set_rollback(True)

        verb = "would" if dry_run else ""
        self.stdout.write(self.style.SUCCESS(
            f"Done. created={created} updated={updated} skipped={skipped}{' (dry-run, rolled back)' if dry_run else ''}"
        ))

    def _process_row(self, row, media_root: Path, user_id: int, dry_run: bool) -> str:
        postmark_key = (row.get("postmark_key") or "").strip()
        storage_filename = (row.get("storage_filename") or "").strip()
        if not postmark_key or not storage_filename:
            return "missing required fields"

        postmark = Postmark.objects.filter(code=postmark_key).first()
        if not postmark:
            return f"no postmark with code={postmark_key}"

        abs_path = media_root / storage_filename
        metadata = read_image_metadata_from_path(abs_path)
        if metadata is None:
            return f"file missing or unreadable: {abs_path}"

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
            return "updated" if exists else "created"

        _, created_flag = PostmarkImage.objects.update_or_create(
            postmark=postmark,
            storage_filename=storage_filename,
            defaults=defaults,
        )
        return "created" if created_flag else "updated"
