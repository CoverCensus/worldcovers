###################################################################################################
## WoCo Commons - Restore Auth objects from backup
## MPC: 2025/11/17
###################################################################################################
from django.core.management.base import BaseCommand

from django.db import transaction

from tablib import Dataset

from common.auth_resources import (
    UserResource,
    GroupResource,
    EmailAddressResource,
)



class Command(BaseCommand):
    help = (
        "Import users (required), and optionally groups and email addresses, "
        "using django-import-export resources.\n\n"
        "Usage (positional):\n"
        "  restore_auth_ie users.csv [groups.csv] [emails.csv]\n"
        "Or with explicit paths:\n"
        "  restore_auth_ie users.csv --emails-file emails.csv\n"
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
            help="Explicit users import path (overrides first positional)",
        )
        parser.add_argument(
            "--groups-file",
            dest="groups_file",
            help="Explicit groups import path (overrides second positional)",
        )
        parser.add_argument(
            "--emails-file",
            dest="emails_file",
            help="Explicit email addresses import path (overrides third positional)",
        )

        parser.add_argument(
            "--format",
            default="csv",
            choices=["csv", "json", "yaml", "xls", "xlsx", "tsv"],
            help="File format (must match how you exported; default: csv)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Run import validation without committing changes",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        fmt = options["format"]
        dry_run = options["dry_run"]
        paths = options["paths"]

        # Resolve effective paths (flags override positionals)
        users_path = options.get("users_file") or (paths[0] if len(paths) >= 1 else None)
        groups_path = options.get("groups_file") or (paths[1] if len(paths) >= 2 else None)
        emails_path = options.get("emails_file") or (paths[2] if len(paths) >= 3 else None)

        if not users_path:
            raise SystemExit("You must provide at least a users import path.")

        user_res = UserResource()
        group_res = GroupResource()
        email_res = EmailAddressResource()

        # --- Groups first (if any), so user->group relations can resolve ---
        if groups_path:
            with open(groups_path, "r", encoding="utf-8") as f:
                group_raw = f.read()
            group_dataset = Dataset().load(group_raw, format=fmt)
            group_result = group_res.import_data(group_dataset, dry_run=dry_run)

            if group_result.has_errors():
                self.stdout.write(self.style.ERROR("Errors importing groups:"))
                self.stdout.write(str(group_result.row_errors()))
                if dry_run:
                    self.stdout.write(
                        self.style.WARNING("Dry run aborted due to group errors.")
                    )
                    return
            self.stdout.write(self.style.SUCCESS(f"Groups imported from {groups_path}"))
        else:
            self.stdout.write("Groups import skipped (no groups path provided).")

        # --- Users (required) ---
        with open(users_path, "r", encoding="utf-8") as f:
            user_raw = f.read()
        user_dataset = Dataset().load(user_raw, format=fmt)
        user_result = user_res.import_data(user_dataset, dry_run=dry_run)

        if user_result.has_errors():
            self.stdout.write(self.style.ERROR("Errors importing users:"))
            self.stdout.write(str(user_result.row_errors()))
            if dry_run:
                self.stdout.write(
                    self.style.WARNING("Dry run aborted due to user errors.")
                )
                return
        self.stdout.write(self.style.SUCCESS(f"Users imported from {users_path}"))

        # --- Email addresses (optional; must come after users) ---
        if emails_path:
            with open(emails_path, "r", encoding="utf-8") as f:
                email_raw = f.read()
            email_dataset = Dataset().load(email_raw, format=fmt)
            email_result = email_res.import_data(email_dataset, dry_run=dry_run)

            if email_result.has_errors():
                self.stdout.write(self.style.ERROR("Errors importing email addresses:"))
                self.stdout.write(str(email_result.row_errors()))
                if dry_run:
                    self.stdout.write(
                        self.style.WARNING(
                            "Dry run aborted due to email address errors."
                        )
                    )
                    return
            self.stdout.write(
                self.style.SUCCESS(f"Email addresses imported from {emails_path}")
            )
        else:
            self.stdout.write(
                "Email address import skipped (no emails path provided)."
            )

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS("Dry run completed; no data committed.")
            )
        else:
            self.stdout.write(
                self.style.SUCCESS("Auth import completed successfully.")
            )

###################################################################################################
