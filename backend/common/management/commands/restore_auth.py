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
    CollectionResource,
    CollectionAssignmentResource,
)



class Command(BaseCommand):
    help = (
        "Import users (required), and optionally groups, email addresses, "
        "state collections, and collection assignments, using "
        "django-import-export resources.\n\n"
        "Usage (positional):\n"
        "  restore_auth users.csv [groups.csv] [emails.csv] [collections.csv] [assignments.csv]\n"
        "Or with explicit paths:\n"
        "  restore_auth users.csv --emails-file emails.csv --assignments-file assignments.csv\n"
    )

    def add_arguments(self, parser):
        # 1-5 positional paths: users [groups] [emails] [collections] [assignments]
        parser.add_argument(
            "paths",
            nargs="+",
            help=(
                "One to five paths: users_file [groups_file] [emails_file] "
                "[collections_file] [assignments_file]"
            ),
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
            "--collections-file",
            dest="collections_file",
            help="Explicit state collections import path (overrides fourth positional)",
        )
        parser.add_argument(
            "--assignments-file",
            dest="assignments_file",
            help=(
                "Explicit collection assignments import path "
                "(overrides fifth positional)"
            ),
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
        collections_path = options.get("collections_file") or (paths[3] if len(paths) >= 4 else None)
        assignments_path = options.get("assignments_file") or (paths[4] if len(paths) >= 5 else None)

        if not users_path:
            raise SystemExit("You must provide at least a users import path.")

        user_res = UserResource()
        group_res = GroupResource()
        email_res = EmailAddressResource()
        collection_res = CollectionResource()
        assignment_res = CollectionAssignmentResource()

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

        # --- State Collections (optional; before Users so assignments can
        # resolve; Regions must already exist on the destination) ---
        if collections_path:
            with open(collections_path, "r", encoding="utf-8") as f:
                collection_raw = f.read()
            collection_dataset = Dataset().load(collection_raw, format=fmt)
            collection_result = collection_res.import_data(
                collection_dataset, dry_run=dry_run
            )

            if collection_result.has_errors():
                self.stdout.write(
                    self.style.ERROR("Errors importing state collections:")
                )
                self.stdout.write(str(collection_result.row_errors()))
                if dry_run:
                    self.stdout.write(
                        self.style.WARNING(
                            "Dry run aborted due to state collection errors."
                        )
                    )
                    return
            self.stdout.write(
                self.style.SUCCESS(
                    f"State collections imported from {collections_path}"
                )
            )
        else:
            self.stdout.write(
                "State collections import skipped (no collections path provided)."
            )

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

        # --- Collection Assignments (optional; must come after both Users
        # and Collections, since each row references both) ---
        if assignments_path:
            with open(assignments_path, "r", encoding="utf-8") as f:
                assignment_raw = f.read()
            assignment_dataset = Dataset().load(assignment_raw, format=fmt)
            assignment_result = assignment_res.import_data(
                assignment_dataset, dry_run=dry_run
            )

            if assignment_result.has_errors():
                self.stdout.write(
                    self.style.ERROR("Errors importing collection assignments:")
                )
                self.stdout.write(str(assignment_result.row_errors()))
                if dry_run:
                    self.stdout.write(
                        self.style.WARNING(
                            "Dry run aborted due to collection assignment errors."
                        )
                    )
                    return
            self.stdout.write(
                self.style.SUCCESS(
                    f"Collection assignments imported from {assignments_path}"
                )
            )
        else:
            self.stdout.write(
                "Collection assignments import skipped "
                "(no assignments path provided)."
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
