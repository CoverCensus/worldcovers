"""
Permanently delete catalog records currently hidden by recycle-bin sidecars,
after writing and verifying a restorable archive of them (Trello T51).

This command deletes the binned Marking and Cover rows themselves. Deleting
only MarkingRecycleBin or CoverRecycleBin rows would restore those records, so
the command starts from sidecar IDs and then hard-deletes the catalog rows.
The ORM cascades from those rows to approved Contributions, version
snapshots, valuations and cover links, and nulls the links that transactions
and crop Images hold on them; the archive covers all of those rows and the
image bytes of the deleted Image rows. Files on disk are never deleted.

Usage from repo root, with mysql.cnf and backend/.env present:
    ./woco purge_recycle_bin --dry-run
    ./woco purge_recycle_bin --dry-run --archive-dir tools/wip/out/purge-rehearsal
    ./woco purge_recycle_bin --no-input

Restore from the archive (same instance; rows return to the recycle bin):
    ./woco loaddata <archive>/records.json
    cp -rn <archive>/media/. backend/media/

Expected exit code: 0.
"""
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from common.models import (
    Citation,
    Cover,
    CoverRecycleBin,
    DateSeen,
    Image,
    Marking,
    MarkingRecycleBin,
)
from common.purge_archive import (
    DELETED,
    collect_scope,
    default_archive_dir,
    describe_media,
    write_bundle,
)


class Command(BaseCommand):
    help = (
        "Permanently delete all Marking and Cover records currently in the "
        "recycle bin, after archiving them. Polymorphic image, date, and "
        "citation rows are also deleted for those subjects."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report the purge scope, then roll back. Writes an archive only with --archive-dir.",
        )
        parser.add_argument(
            "--no-input",
            action="store_true",
            dest="no_input",
            help="Do not prompt for confirmation (for use in scripts).",
        )
        parser.add_argument(
            "--archive-dir",
            type=Path,
            default=None,
            help=(
                "New directory for the verified archive. Default: "
                "tools/wip/out/recycle-bin-purge-<UTC stamp>. A real purge always archives."
            ),
        )
        parser.add_argument(
            "--allow-missing-media",
            action="store_true",
            dest="allow_missing_media",
            help="Archive even when a binned Image row has no file on disk; the names are recorded.",
        )

    def handle(self, *args, **options):
        dry_run = bool(options["dry_run"])
        no_input = bool(options["no_input"])

        marking_ids = list(
            MarkingRecycleBin.objects.order_by()
            .values_list("marking_id", flat=True)
        )
        cover_ids = list(
            CoverRecycleBin.objects.order_by()
            .values_list("cover_id", flat=True)
        )
        if not marking_ids and not cover_ids:
            self.stdout.write(self.style.SUCCESS("Recycle bin is empty; nothing to purge."))
            return

        scope = collect_scope(marking_ids, cover_ids)
        media = describe_media(scope)
        self._report_scope(scope, media)

        if dry_run:
            self.stdout.write(self.style.NOTICE("DRY RUN: no rows will be committed."))
        elif not no_input:
            self.stdout.write(
                self.style.WARNING(
                    "This will permanently delete ALL markings and covers "
                    "currently in the recycle bin. This cannot be restored by "
                    "deleting recycle-bin sidecar rows."
                )
            )
            answer = input("Type 'yes' to proceed: ").strip().lower()
            if answer != "yes":
                raise CommandError("Aborted; nothing was deleted.")

        archive_dir = options["archive_dir"]
        if archive_dir is None and not dry_run:
            archive_dir = default_archive_dir()
        if archive_dir is None:
            self.stdout.write(self.style.NOTICE(
                "DRY RUN: no archive written; pass --archive-dir to rehearse the archive."
            ))
        else:
            manifest = write_bundle(
                scope, Path(archive_dir), options["allow_missing_media"], media=media,
            )
            self.stdout.write(self.style.SUCCESS(
                f"Archive written and verified: {archive_dir} "
                f"({manifest['records']} records, {len(manifest['files'])} files)"
            ))

        try:
            with transaction.atomic():
                polymorphic_total = self._delete_polymorphic_rows(
                    "MARKING",
                    marking_ids,
                )
                polymorphic_total += self._delete_polymorphic_rows(
                    "COVER",
                    cover_ids,
                )
                cover_total = self._delete_catalog_rows(
                    Cover,
                    CoverRecycleBin,
                    cover_ids,
                )
                marking_total = self._delete_catalog_rows(
                    Marking,
                    MarkingRecycleBin,
                    marking_ids,
                )

                if dry_run:
                    transaction.set_rollback(True)
        except Exception:
            self.stdout.write(
                self.style.ERROR(
                    "Recycle-bin purge aborted; all changes rolled back."
                )
            )
            raise

        total = polymorphic_total + cover_total + marking_total
        summary = f"Done. deleted {total} row(s), including ORM cascades."
        if dry_run:
            summary = "[DRY RUN] " + summary + " (rolled back)"
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(summary))
        if not dry_run:
            self.stdout.write(
                f"Restore: ./woco loaddata {archive_dir}/records.json "
                f"&& cp -rn {archive_dir}/media/. backend/media/"
            )

    def _report_scope(self, scope, media):
        self.stdout.write("Purge scope (rows the purge deletes or relinks):")
        for label, kind, queryset in scope:
            self.stdout.write(f"  {label:<34s} {kind:<9s} rows={queryset.count():>6d}")
        total_bytes = sum(info["size"] for info in media["files"].values())
        self.stdout.write(
            f"  {'image files to archive':<34s} {DELETED:<9s} "
            f"files={len(media['files']):>5d} bytes={total_bytes}"
        )
        if media["shared"]:
            self.stdout.write(
                f"  {len(media['shared'])} file(s) are also referenced by Image rows "
                "outside the purge; files on disk are never deleted."
            )
        if media["missing"]:
            self.stdout.write(self.style.WARNING(
                f"  {len(media['missing'])} binned Image row(s) have no file on disk: "
                + ", ".join(ascii(name) for name in media["missing"][:10])
            ))

    def _delete_polymorphic_rows(self, subject_type, subject_ids):
        total = 0
        for model in (Image, DateSeen, Citation):
            deleted, _ = model.objects.filter(
                subject_type=subject_type,
                subject_id__in=subject_ids,
            ).delete()
            total += deleted
            self.stdout.write(
                f"  {model._meta.db_table:<24s} "
                f"{subject_type:<7s} deleted={deleted:>6d}"
            )
        return total

    def _delete_catalog_rows(self, model, sidecar_model, object_ids):
        deleted, details = model.all_objects.filter(pk__in=object_ids).delete()
        model_deleted = details.get(model._meta.label, 0)
        sidecar_deleted = details.get(sidecar_model._meta.label, 0)
        self.stdout.write(
            f"  {model._meta.db_table:<24s} deleted={model_deleted:>6d}"
        )
        self.stdout.write(
            f"  {sidecar_model._meta.db_table:<24s} deleted={sidecar_deleted:>6d}"
        )
        cascaded = deleted - model_deleted - sidecar_deleted
        if cascaded:
            self.stdout.write(
                f"  {'ORM cascades':<24s} deleted={cascaded:>6d}"
            )
        return deleted
