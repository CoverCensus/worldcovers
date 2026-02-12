###################################################################################################
## WoCo Commons - API Views
## MPC: 2025/11/15
###################################################################################################
from django.core.management.base import BaseCommand

from common.auth_resources import (
    UserResource,
    GroupResource,
    EmailAddressResource,
)



class Command(BaseCommand):
    help = (
        "Export users (required), and optionally groups and email addresses, "
        "using django-import-export resources.\n\n"
        "Usage:\n"
        "  backup_auth_ie users.csv [groups.csv] [emails.csv]\n"
        "Or with explicit flags:\n"
        "  backup_auth_ie users.csv --emails-file emails.csv\n"
    )

    def add_arguments(self, parser):
        # 1–3 positional paths: users [groups] [emails]
        parser.add_argument(
            "paths",
            nargs="+",
            help="One to three paths: users_file [groups_file] [emails_file]",
        )

        # Optional explicit overrides
        parser.add_argument(
            "--users-file",
            dest="users_file",
            help="Explicit users export path (overrides first positional)",
        )
        parser.add_argument(
            "--groups-file",
            dest="groups_file",
            help="Explicit groups export path (overrides second positional)",
        )
        parser.add_argument(
            "--emails-file",
            dest="emails_file",
            help="Explicit email addresses export path (overrides third positional)",
        )

    def handle(self, *args, **options):
        paths = options["paths"]

        # Resolve effective paths (flags override positionals)
        users_path = options.get("users_file") or (paths[0] if len(paths) >= 1 else None)
        groups_path = options.get("groups_file") or (paths[1] if len(paths) >= 2 else None)
        emails_path = options.get("emails_file") or (paths[2] if len(paths) >= 3 else None)

        if not users_path:
            raise SystemExit("You must provide at least a users export path.")

        # --- Users (always) ---
        user_res = UserResource()
        user_dataset = user_res.export()
        user_csv = user_dataset.export("csv")

        with open(users_path, "w", encoding="utf-8") as f:
            f.write(user_csv)

        self.stdout.write(self.style.SUCCESS(f"Exported users to {users_path}"))

        # --- Groups (optional) ---
        if groups_path:
            group_res = GroupResource()
            group_dataset = group_res.export()
            group_csv = group_dataset.export("csv")

            with open(groups_path, "w", encoding="utf-8") as f:
                f.write(group_csv)

            self.stdout.write(self.style.SUCCESS(f"Exported groups to {groups_path}"))
        else:
            self.stdout.write("Groups export skipped (no groups path provided).")

        # --- Email addresses (optional) ---
        if emails_path:
            email_res = EmailAddressResource()
            email_dataset = email_res.export()
            email_csv = email_dataset.export("csv")

            with open(emails_path, "w", encoding="utf-8") as f:
                f.write(email_csv)

            self.stdout.write(
                self.style.SUCCESS(f"Exported email addresses to {emails_path}")
            )
        else:
            self.stdout.write("Email address export skipped (no emails path provided).")

        self.stdout.write(
            self.style.WARNING(
                "Reminder: these files contain sensitive data "
                "(emails, password hashes) — encrypt them at rest."
            )
        )

###################################################################################################
