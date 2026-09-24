"""Remove the parent Townmark text added by the ASCC munger (T50)."""

from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from common.audit import (
    build_marking_snapshot,
    create_marking_version,
    log_submission_transaction,
)
from common.models import Marking, MarkingType, SubmissionTransaction


class Command(BaseCommand):
    help = "Remove added Townmark prefixes. Commits unless --dry-run is set."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Preview the repair without writing changes.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        self.stdout.write("DRY RUN" if dry_run else "COMMIT")
        changed = unchanged = skipped = 0

        with transaction.atomic():
            parents: dict[tuple[int, str], set[str]] = defaultdict(set)
            for office_id, catalog, inscription in Marking.objects.filter(
                type=MarkingType.TOWNMARK,
            ).values_list("post_office_id", "catalog_txt", "inscription_txt"):
                if catalog and catalog.strip() and inscription.strip():
                    parents[(office_id, catalog)].add(inscription.strip())

            children = Marking.objects.select_for_update().filter(
                type__in=[MarkingType.RATEMARK, MarkingType.AUXMARK],
            ).order_by("pk")
            for marking in children:
                old = marking.inscription_txt
                candidates = parents.get(
                    (marking.post_office_id, marking.catalog_txt), set(),
                )
                matches = [text for text in candidates if old.startswith(text + " ")]
                if not candidates:
                    reason = "no matching Townmark listing"
                elif len(matches) > 1:
                    reason = "conflicting Townmark prefixes"
                elif old in candidates:
                    reason = "no remaining child text"
                elif not matches:
                    unchanged += 1
                    continue
                else:
                    new = old[len(matches[0]) + 1:]
                    reason = "" if new.strip() else "no remaining child text"

                if reason:
                    skipped += 1
                    self.stdout.write(f"Skipped {marking.pk}: {reason}")
                    continue

                changed += 1
                if changed <= 5:
                    self.stdout.write(f"{marking.pk}: {ascii(old)} -> {ascii(new)}")
                if dry_run:
                    continue

                before = build_marking_snapshot(marking)
                marking.inscription_txt = new
                marking.save(update_fields=["inscription_txt", "modified_date"])
                audit = log_submission_transaction(
                    action=SubmissionTransaction.ACTION_CATALOG_DIRECT_EDIT,
                    marking=marking,
                    source=SubmissionTransaction.SOURCE_SYSTEM,
                    before_payload=before,
                    after_payload=build_marking_snapshot(marking),
                    extra_payload={"reason": "T50: remove added Townmark prefix"},
                )
                create_marking_version(marking, audit)

        label = "Would change" if dry_run else "Changed"
        self.stdout.write(f"{label}: {changed}; unchanged: {unchanged}; skipped: {skipped}")
