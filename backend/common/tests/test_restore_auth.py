import csv
import tempfile
from pathlib import Path

from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from common.models import Collection, CollectionAssignment, Region


User = get_user_model()


class RestoreAuthCommandTests(TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.tmp_path = Path(self.tmp.name)

        self.admin = User.objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="pw",
        )
        self.editor = User.objects.create_user(
            username="editor@example.com",
            email="editor@example.com",
            password="pw",
        )
        self.other = User.objects.create_user(
            username="other@example.com",
            email="other@example.com",
            password="pw",
        )
        self.editors_group = Group.objects.create(name="Editors")

        self.virginia_region = self._region("Virginia", "VA")
        self.texas_region = self._region("Texas", "TX")
        self.virginia = self._collection("Virginia", self.virginia_region)
        self.texas = self._collection("Texas", self.texas_region)

    def _csv(self, name, header, rows):
        path = self.tmp_path / name
        with path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(header)
            writer.writerows(rows)
        return str(path)

    def _users_csv(self):
        return self._csv(
            "users.csv",
            ["id", "username"],
            [
                [999, self.admin.username],
                [998, self.editor.username],
                [997, self.other.username],
            ],
        )

    def _region(self, name, abbrev):
        return Region.objects.create(
            name=name,
            abbrev=abbrev,
            region_tier="STATE",
            created_by=self.admin,
            modified_by=self.admin,
        )

    def _collection(self, name, region):
        return Collection.objects.create(
            name=name,
            region=region,
            created_by=self.admin,
            modified_by=self.admin,
        )

    def _assignment(self, user, collection):
        return CollectionAssignment.objects.create(
            user=user,
            collection=collection,
            created_by=self.admin,
            modified_by=self.admin,
        )

    def test_assignment_import_uses_user_collection_not_exported_id(self):
        existing = self._assignment(self.editor, self.virginia)
        assignments = self._csv(
            "assignments.csv",
            ["id", "user", "collection"],
            [[999999, self.editor.username, self.virginia.name]],
        )

        call_command(
            "restore_auth",
            self._users_csv(),
            assignments_file=assignments,
            verbosity=0,
        )

        self.assertEqual(CollectionAssignment.objects.count(), 1)
        existing.refresh_from_db()
        self.assertEqual(existing.user, self.editor)
        self.assertEqual(existing.collection, self.virginia)

    def test_new_assignment_gets_audit_fields_and_editor_group(self):
        assignments = self._csv(
            "assignments.csv",
            ["id", "user", "collection"],
            [[12345, self.editor.username, self.virginia.name]],
        )

        call_command(
            "restore_auth",
            self._users_csv(),
            assignments_file=assignments,
            verbosity=0,
        )

        assignment = CollectionAssignment.objects.get(
            user=self.editor,
            collection=self.virginia,
        )
        self.assertIsNotNone(assignment.created_date)
        self.assertIsNotNone(assignment.modified_date)
        self.assertIsNotNone(assignment.created_by_id)
        self.assertIsNotNone(assignment.modified_by_id)
        self.assertTrue(self.editor.groups.filter(name="Editors").exists())

    def test_email_import_uses_user_email_not_exported_id(self):
        email = EmailAddress.objects.create(
            user=self.editor,
            email="editor@example.com",
            verified=False,
            primary=True,
        )
        emails = self._csv(
            "emails.csv",
            ["id", "user", "email", "verified", "primary"],
            [[999999, self.editor.username, "editor@example.com", "1", "1"]],
        )

        call_command(
            "restore_auth",
            self._users_csv(),
            emails_file=emails,
            verbosity=0,
        )

        self.assertEqual(EmailAddress.objects.count(), 1)
        email.refresh_from_db()
        self.assertTrue(email.verified)

    def test_assignment_restore_exactly_mirrors_backup(self):
        keep = self._assignment(self.editor, self.virginia)
        remove = self._assignment(self.other, self.texas)
        assignments = self._csv(
            "assignments.csv",
            ["id", "user", "collection"],
            [[999999, self.editor.username, self.virginia.name]],
        )

        call_command(
            "restore_auth",
            self._users_csv(),
            assignments_file=assignments,
            verbosity=0,
        )

        self.assertTrue(CollectionAssignment.objects.filter(pk=keep.pk).exists())
        self.assertFalse(CollectionAssignment.objects.filter(pk=remove.pk).exists())

    def test_assignment_failure_rolls_back_and_does_not_prune(self):
        keep = self._assignment(self.editor, self.virginia)
        stale = self._assignment(self.other, self.texas)
        assignments = self._csv(
            "assignments.csv",
            ["id", "user", "collection"],
            [[999999, self.editor.username, "Missing Collection"]],
        )

        with self.assertRaises(CommandError):
            call_command(
                "restore_auth",
                self._users_csv(),
                assignments_file=assignments,
                verbosity=0,
            )

        self.assertTrue(CollectionAssignment.objects.filter(pk=keep.pk).exists())
        self.assertTrue(CollectionAssignment.objects.filter(pk=stale.pk).exists())

    def test_existing_collection_keeps_local_region(self):
        collections = self._csv(
            "collections.csv",
            ["id", "name", "description", "region", "is_active"],
            [[999999, self.virginia.name, "Imported description", self.texas_region.name, "1"]],
        )

        call_command(
            "restore_auth",
            self._users_csv(),
            collections_file=collections,
            verbosity=0,
        )

        self.virginia.refresh_from_db()
        self.assertEqual(self.virginia.region, self.virginia_region)
        self.assertEqual(self.virginia.description, "Imported description")

    def test_new_collection_with_existing_region_is_skipped(self):
        collections = self._csv(
            "collections.csv",
            ["id", "name", "description", "region", "is_active"],
            [[999999, "Backup Test Collection", "", self.virginia_region.name, "1"]],
        )

        call_command(
            "restore_auth",
            self._users_csv(),
            collections_file=collections,
            verbosity=0,
        )

        self.assertFalse(
            Collection.objects.filter(name="Backup Test Collection").exists()
        )
        self.assertEqual(Collection.objects.get(region=self.virginia_region), self.virginia)

    def test_assignment_for_skipped_collection_is_skipped(self):
        collections = self._csv(
            "collections.csv",
            ["id", "name", "description", "region", "is_active"],
            [[999999, "Backup Test Collection", "", self.virginia_region.name, "1"]],
        )
        assignments = self._csv(
            "assignments.csv",
            ["id", "user", "collection"],
            [
                [12345, self.editor.username, "Backup Test Collection"],
                [12346, self.editor.username, self.virginia.name],
            ],
        )

        call_command(
            "restore_auth",
            self._users_csv(),
            collections_file=collections,
            assignments_file=assignments,
            verbosity=0,
        )

        self.assertFalse(
            CollectionAssignment.objects.filter(
                user=self.editor,
                collection__name="Backup Test Collection",
            ).exists()
        )
        self.assertTrue(
            CollectionAssignment.objects.filter(
                user=self.editor,
                collection=self.virginia,
            ).exists()
        )
