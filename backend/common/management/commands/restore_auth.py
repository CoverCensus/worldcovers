###################################################################################################
## WoCo Commons - Restore Auth objects from backup
## MPC: 2025/11/17
###################################################################################################
from django.core.management.base import BaseCommand, CommandError

from django.db import transaction
from django.db.models import Q

from tablib import Dataset

from common.models import Collection, CollectionAssignment
from common.auth_resources import (
    UserResource,
    GroupResource,
    EmailAddressResource,
    CollectionResource,
    CollectionAssignmentResource,
)


def _load_dataset(path, fmt):
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    return Dataset().load(raw, format=fmt)


def _format_import_errors(result):
    parts = []
    if result.has_errors():
        row_errors = result.row_errors()
        parts.append(f"row errors: {row_errors[:20]}")
        if len(row_errors) > 20:
            parts.append(f"... {len(row_errors) - 20} additional row errors")
    if result.has_validation_errors():
        invalid_rows = result.invalid_rows
        parts.append(f"validation errors: {invalid_rows[:20]}")
        if len(invalid_rows) > 20:
            parts.append(f"... {len(invalid_rows) - 20} additional validation errors")
    return "\n".join(parts) or "unknown import error"


def _import_or_raise(resource, dataset, label):
    result = resource.import_data(dataset, dry_run=False)
    if result.has_errors() or result.has_validation_errors():
        raise CommandError(f"Errors importing {label}:\n{_format_import_errors(result)}")
    return result


def _assignment_keep_ids(dataset):
    keep_filter = Q()
    for row in dataset.dict:
        username = (row.get("user") or "").strip()
        collection_name = (row.get("collection") or "").strip()
        if not username or not collection_name:
            continue
        keep_filter |= Q(user__username=username, collection__name=collection_name)

    if not keep_filter:
        return []

    return list(
        CollectionAssignment.objects.filter(keep_filter).values_list("pk", flat=True)
    )


def _missing_collection_names(dataset):
    if dataset is None:
        return set()

    missing = set()
    for row in dataset.dict:
        name = (row.get("name") or "").strip()
        if name and not Collection.objects.filter(name=name).exists():
            missing.add(name)
    return missing


def _without_skipped_collection_assignments(dataset, skipped_collection_names):
    if not skipped_collection_names:
        return dataset, 0

    filtered = Dataset(headers=dataset.headers)
    skipped = 0
    for row in dataset.dict:
        if (row.get("collection") or "").strip() in skipped_collection_names:
            skipped += 1
            continue
        filtered.append([row.get(header) for header in dataset.headers])
    return filtered, skipped


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
        collection_dataset = None
        skipped_collection_names = set()

        # Dry-run validation still performs writes inside this outer transaction
        # so later files can resolve rows imported by earlier files. The whole
        # transaction is rolled back at the end when dry_run is true.

        # --- Groups first (if any), so user->group relations can resolve ---
        if groups_path:
            group_dataset = _load_dataset(groups_path, fmt)
            _import_or_raise(group_res, group_dataset, "groups")
            self.stdout.write(self.style.SUCCESS(f"Groups imported from {groups_path}"))
        else:
            self.stdout.write("Groups import skipped (no groups path provided).")

        # --- Users (required) ---
        user_dataset = _load_dataset(users_path, fmt)
        _import_or_raise(user_res, user_dataset, "users")
        self.stdout.write(self.style.SUCCESS(f"Users imported from {users_path}"))

        # --- Email addresses (optional; must come after users) ---
        if emails_path:
            email_dataset = _load_dataset(emails_path, fmt)
            _import_or_raise(email_res, email_dataset, "email addresses")
            self.stdout.write(
                self.style.SUCCESS(f"Email addresses imported from {emails_path}")
            )
        else:
            self.stdout.write(
                "Email address import skipped (no emails path provided)."
            )

        # --- State Collections (optional; after Users so audit fields can be
        # populated when a row needs to be created. Regions must already exist
        # on the destination.) ---
        if collections_path:
            collection_dataset = _load_dataset(collections_path, fmt)
            _import_or_raise(
                collection_res,
                collection_dataset,
                "state collections",
            )
            skipped_collection_names = _missing_collection_names(collection_dataset)
            self.stdout.write(
                self.style.SUCCESS(
                    f"State collections imported from {collections_path}"
                )
            )
            if skipped_collection_names:
                self.stdout.write(
                    self.style.WARNING(
                        "Skipped collection rows that conflict with local "
                        "Region ownership: "
                        + ", ".join(sorted(skipped_collection_names))
                    )
                )
        else:
            self.stdout.write(
                "State collections import skipped (no collections path provided)."
            )

        # --- Collection Assignments (optional; must come after both Users
        # and Collections, since each row references both) ---
        if assignments_path:
            assignment_dataset = _load_dataset(assignments_path, fmt)
            assignment_dataset, skipped_assignments = (
                _without_skipped_collection_assignments(
                    assignment_dataset,
                    skipped_collection_names,
                )
            )
            _import_or_raise(
                assignment_res,
                assignment_dataset,
                "collection assignments",
            )
            keep_ids = _assignment_keep_ids(assignment_dataset)
            deleted, _ = CollectionAssignment.objects.exclude(pk__in=keep_ids).delete()
            self.stdout.write(
                self.style.SUCCESS(
                    f"Collection assignments imported from {assignments_path}"
                )
            )
            if skipped_assignments:
                self.stdout.write(
                    self.style.WARNING(
                        "Skipped "
                        f"{skipped_assignments} assignment row(s) for skipped "
                        "collection rows."
                    )
                )
            self.stdout.write(
                self.style.SUCCESS(
                    f"Collection assignments mirrored; removed {deleted} stale rows."
                )
            )
        else:
            self.stdout.write(
                "Collection assignments import skipped "
                "(no assignments path provided)."
            )

        if dry_run:
            transaction.set_rollback(True)
            self.stdout.write(
                self.style.SUCCESS("Dry run completed; no data committed.")
            )
        else:
            self.stdout.write(
                self.style.SUCCESS("Auth import completed successfully.")
            )

###################################################################################################
