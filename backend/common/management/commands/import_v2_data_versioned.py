"""
Versioned V2 import wrapper (django-reversion).

This command wraps `import_v2_data` inside a single django-reversion Revision,
so you can list and revert V2 imports later.
"""

import reversion

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model


class Command(BaseCommand):
    help = "Run import_v2_data inside django-reversion (tagged as v2-import:<tag>)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dir",
            "-d",
            default="docs/data",
            help="Directory containing v2_*.csv exports (default: docs/data)",
        )
        parser.add_argument(
            "--user",
            "-u",
            default=None,
            help="Username for created_by/modified_by (default: first superuser)",
        )
        parser.add_argument(
            "--tag",
            required=True,
            help="Version tag to store in Revision comment (e.g. v2-2026-03-23)",
        )
        parser.add_argument(
            "--missing-postmark-strategy",
            choices=["skip", "error"],
            default="skip",
            help="What to do when v2_postmarks references a Postmark not found by raw_state_data_id",
        )

    def _resolve_user(self, username):
        User = get_user_model()
        if username:
            try:
                return User.objects.get(username=username)
            except User.DoesNotExist:
                raise ValueError(f"User not found: {username}")
        user = User.objects.filter(is_superuser=True).first()
        if not user:
            user = User.objects.filter(pk=1).first()
        if not user:
            user = User.objects.filter(pk=2).first()
        if not user:
            raise ValueError("No user found; create a superuser or pass --user.")
        return user

    def handle(self, *args, **options):
        import_dir = options["dir"]
        username = options.get("user")
        tag = options["tag"]
        missing_postmark_strategy = options["missing_postmark_strategy"]

        user = self._resolve_user(username)
        revision_comment = f"v2-import:{tag}"

        with reversion.create_revision():
            reversion.set_comment(revision_comment)
            reversion.set_user(user)

            call_command(
                "import_v2_data",
                dir=import_dir,
                user=user.username,
                missing_postmark_strategy=missing_postmark_strategy,
                stdout=self.stdout,
                stderr=self.stderr,
            )

        self.stdout.write(self.style.SUCCESS(f"Created revision with comment={revision_comment}"))

