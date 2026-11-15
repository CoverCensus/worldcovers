"""Tests for migration 0026's data step (Contribution -> Submission).

The test database is built with 0026 already applied, so each test writes
rows that still carry the OLD names, runs `convert_stored_names`, and checks
the stored result.

Run (cwd = repo root, MariaDB running, `mysql.cnf` present):
    uv run python backend/manage.py test common.tests.test_rename_stored_names
Expected exit code: 0.
"""

import importlib
import json

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.db import connection
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from reversion.models import Revision, Version

from common.models import (
    Collection,
    CollectionTransferMap,
    Region,
    Submission,
    SubmissionTransaction,
)

# The module name starts with a digit, so it cannot be imported with `import`.
migration = importlib.import_module("common.migrations.0026_rename_contribution_to_submission")

User = get_user_model()


class RenameJsonTests(SimpleTestCase):
    def test_keys_are_renamed_at_any_depth_in_the_same_letter_case(self):
        before = {
            "created_from_contribution_id": 7,
            "editContributionId": 8,
            "nested": [{"CONTRIBUTION_KIND": "cover"}],
        }
        self.assertEqual(
            migration.rename_json(before),
            {
                "created_from_submission_id": 7,
                "editSubmissionId": 8,
                "nested": [{"SUBMISSION_KIND": "cover"}],
            },
        )

    def test_identifier_values_are_renamed_and_free_text_is_kept(self):
        before = {
            "model": "common.contribution",
            "action": "contribution_archived",
            "note": "my contribution to the catalog",
            "word": "Contribution",
        }
        self.assertEqual(
            migration.rename_json(before),
            {
                "model": "common.submission",
                "action": "submission_archived",
                "note": "my contribution to the catalog",
                "word": "Contribution",
            },
        )

    def test_values_that_are_not_text_or_containers_pass_through(self):
        self.assertEqual(migration.rename_json({"a": 1, "b": None, "c": True}), {"a": 1, "b": None, "c": True})


class ConvertStoredNamesTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username="admin", email="admin@example.com", password="pw")
        region = Region.objects.create(
            name="Virginia", abbrev="VA", region_tier="STATE", created_by=self.admin, modified_by=self.admin
        )
        self.collection = Collection.objects.create(
            name="Virginia Collection", region=region, created_by=self.admin, modified_by=self.admin
        )
        self.submission = Submission.objects.create(
            contributor=self.admin,
            collection=self.collection,
            created_by=self.admin,
            modified_by=self.admin,
            submitted_data={
                "town": "Richmond",
                "pending_cover_contribution_id": 42,
                "description": "A contribution from the Smith holding",
            },
        )

    def _convert(self):
        with connection.schema_editor() as schema_editor:
            migration.convert_stored_names(django_apps, schema_editor)

    def test_json_keys_in_submitted_data_are_renamed(self):
        self._convert()
        self.submission.refresh_from_db()
        self.assertEqual(
            self.submission.submitted_data,
            {
                "town": "Richmond",
                "pending_cover_submission_id": 42,
                "description": "A contribution from the Smith holding",
            },
        )

    def test_transaction_action_and_payload_are_renamed(self):
        row = SubmissionTransaction.objects.create(
            submission=self.submission,
            actor=self.admin,
            action="contribution_archived",
            extra_payload={"archived_contribution_id": self.submission.pk},
        )
        self._convert()
        row.refresh_from_db()
        self.assertEqual(row.action, SubmissionTransaction.ACTION_SUBMISSION_ARCHIVED)
        self.assertEqual(row.extra_payload, {"archived_submission_id": self.submission.pk})

    def test_permission_row_is_renamed_in_place(self):
        content_type = ContentType.objects.get_for_model(Submission)
        old = Permission.objects.create(
            content_type=content_type, codename="approve_contribution", name="Can approve contribution"
        )
        self._convert()
        old.refresh_from_db()
        self.assertEqual(old.codename, "approve_submission")
        self.assertEqual(old.name, "Can approve submission")

    def test_transfer_map_label_is_renamed(self):
        row = CollectionTransferMap.objects.create(
            source_instance="woco.dev",
            source_model="common.contribution",
            source_id="5",
            target_id="9",
            record_digest="0" * 64,
        )
        self._convert()
        row.refresh_from_db()
        self.assertEqual(row.source_model, "common.submission")

    def test_reversion_serialized_data_is_renamed(self):
        revision = Revision.objects.create(date_created=timezone.now())
        version = Version.objects.create(
            revision=revision,
            object_id=str(self.submission.pk),
            content_type=ContentType.objects.get_for_model(Submission),
            db="default",
            format="json",
            object_repr="Contribution #1 (pending)",
            serialized_data=json.dumps(
                [
                    {
                        "model": "common.contribution",
                        "pk": self.submission.pk,
                        "fields": {"submitted_data": {"created_from_contribution_id": 3}},
                    }
                ]
            ),
        )
        self._convert()
        version.refresh_from_db()
        self.assertEqual(
            json.loads(version.serialized_data),
            [
                {
                    "model": "common.submission",
                    "pk": self.submission.pk,
                    "fields": {"submitted_data": {"created_from_submission_id": 3}},
                }
            ],
        )
