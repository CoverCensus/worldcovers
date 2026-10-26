"""Remove one state's contents, with an optional Collection transfer guard."""

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from common.collection_archive import collection_scope
from common.collection_removal import delete_contents, remove_transferred_collection
from common.models import (
    Collection,
    Contribution,
    CoverMarking,
    Marking,
    PostOffice,
    Region,
)


class Command(BaseCommand):
    help = "Remove state contents by Region code while preserving shared records."

    def add_arguments(self, parser):
        parser.add_argument("state", nargs="?", help="Region abbreviation, for example VA.")
        parser.add_argument("--region-code", help="Exact Region.code; overrides state.")
        parser.add_argument("--dry-run", action="store_true", help="Report scope and roll back changes.")
        parser.add_argument("--bundle", type=Path, help="Collection bundle to guard source removal.")
        parser.add_argument(
            "--verification-report", type=Path,
            help="Passing comparison report from the destination instance.",
        )

    def _resolve_region(self, state, region_code):
        if region_code:
            try:
                return Region.objects.get(code=region_code)
            except Region.DoesNotExist as exc:
                raise CommandError(f"No Region found with code={ascii(region_code)}.") from exc
        if not state:
            raise CommandError("Provide a state abbrev or --region-code.")
        abbrev = state.strip().upper()
        matches = list(Region.objects.filter(abbrev__iexact=abbrev).order_by("code"))
        if len(matches) == 1:
            return matches[0]
        if not matches:
            raise CommandError(f"No Region found with abbrev={ascii(abbrev)}.")
        codes = ", ".join(ascii(region.code) if region.code else f"pk={region.pk}" for region in matches)
        raise CommandError(
            f"Region abbrev {ascii(abbrev)} is ambiguous ({codes}); use --region-code."
        )

    def handle(self, *args, **options):
        region = self._resolve_region(options.get("state"), options.get("region_code"))
        if not region.code:
            raise CommandError(f"Region pk={region.pk} has no code.")
        dry_run = bool(options["dry_run"])
        bundle, report = options.get("bundle"), options.get("verification_report")
        if bool(bundle) != bool(report):
            raise CommandError("Use --bundle and --verification-report together.")
        if bundle:
            counts = remove_transferred_collection(
                region, Path(bundle), Path(report), dry_run,
            )
        else:
            collection = Collection.objects.filter(region=region).first()
            if collection:
                scope = collection_scope(collection)
            else:
                # Keep the existing prefix selection for imported states
                # that do not yet have a Collection.
                offices = set(PostOffice.objects.filter(
                    code__startswith=f"{region.code}-",
                ).values_list("pk", flat=True))
                markings = set(Marking.all_objects.filter(
                    post_office_id__in=offices,
                ).values_list("pk", flat=True))
                scope = {
                    "regions": {region.pk}, "post_offices": offices, "markings": markings,
                    "covers": set(CoverMarking.objects.filter(
                        marking_id__in=markings,
                    ).values_list("cover_id", flat=True)),
                    "contributions": set(Contribution.objects.filter(
                        marking_id__in=markings,
                    ).values_list("pk", flat=True)),
                }
            with transaction.atomic():
                counts = delete_contents(scope)
                if dry_run:
                    transaction.set_rollback(True)

        for label, count in counts:
            self.stdout.write(f"  {label:<32s} count={count:>5d}")
        prefix = "[DRY RUN] " if dry_run else ""
        self.stdout.write(f"{prefix}State contents removed; media files retained.")
