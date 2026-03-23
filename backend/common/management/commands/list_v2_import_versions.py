"""
List django-reversion revisions for V2 imports.

Looks for Revision.comment prefix:
  `v2-import:<tag>`
"""

from reversion.models import Revision

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "List V2 import revisions (django-reversion) tagged with v2-import:<tag>."

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit",
            type=int,
            default=50,
            help="Max number of revisions to print (default: 50)",
        )
        parser.add_argument(
            "--tag",
            default=None,
            help="Optional tag filter (exact match, without the v2-import: prefix).",
        )

    def handle(self, *args, **options):
        limit = options["limit"]
        tag = options.get("tag")
        prefix = "v2-import:"

        qs = Revision.objects.filter(comment__startswith=prefix).order_by("-date_created")
        if tag:
            qs = qs.filter(comment=f"{prefix}{tag}")

        rows = list(qs[:limit].iterator())
        if not rows:
            self.stdout.write("No matching V2 import revisions found.")
            return

        for rev in rows:
            user = getattr(rev.user, "username", None) if rev.user_id else None
            self.stdout.write(
                f"id={rev.id} date={rev.date_created.isoformat()} user={user or '-'} comment={rev.comment}"
            )

