"""
Revert django-reversion Revision(s) created by import_v2_data_versioned.

Matches Revision.comment values with:
  v2-import:<tag>
"""

from reversion.errors import RevertError
from reversion.models import Revision

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Revert a V2 import revision by revision id or tag."

    def add_arguments(self, parser):
        parser.add_argument(
            "--revision-id",
            type=int,
            default=None,
            help="Exact django-reversion Revision.id to revert.",
        )
        parser.add_argument(
            "--tag",
            default=None,
            help="V2 tag to revert (matches v2-import:<tag>, latest if multiple).",
        )
        parser.add_argument(
            "--delete",
            action="store_true",
            help="If set, delete objects that didn't exist in the reverted revision (advanced).",
        )

    def handle(self, *args, **options):
        revision_id = options["revision_id"]
        tag = options.get("tag")
        delete = options["delete"]

        prefix = "v2-import:"

        if revision_id is None and not tag:
            self.stderr.write(self.style.ERROR("Provide --revision-id or --tag."))
            return

        if revision_id is not None:
            try:
                rev = Revision.objects.get(id=revision_id)
            except Revision.DoesNotExist:
                self.stderr.write(self.style.ERROR(f"Revision not found: id={revision_id}"))
                return
        else:
            # If multiple revisions exist for the same tag, revert the newest one.
            qs = Revision.objects.filter(comment=f"{prefix}{tag}").order_by("-date_created")
            rev = qs.first()
            if not rev:
                self.stderr.write(self.style.ERROR(f"No revision found for tag={tag}"))
                return

        self.stdout.write(f"Reverting revision id={rev.id} comment={rev.comment} delete={delete} ...")
        try:
            rev.revert(delete=delete)
        except RevertError as e:
            self.stderr.write(self.style.ERROR(f"Revert failed: {e!s}"))
            return

        self.stdout.write(self.style.SUCCESS(f"Revert complete for revision id={rev.id}"))

