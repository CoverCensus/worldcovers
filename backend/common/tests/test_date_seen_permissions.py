"""Region scoping and audit for /api/v2/dates-seen/ (issue #128).

DateSeenViewSet was a bare ModelViewSet with a role-only permission class, so
any editor could add, alter or delete any marking's dates in any state, and
none of it was logged. These cover the scoping predicate on every write verb,
the audit rows each write now emits, and the two validation paths that used to
be a 500 or a silent relocation.

Setup follows test_entry_remove_permissions.py: a VA-assigned editor, an
unassigned MD region, and a superuser.
"""
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.db import IntegrityError
from django.test import TestCase
from rest_framework.test import APIClient

from common.models import (
    Collection,
    CollectionAssignment,
    Cover,
    CoverMarking,
    CoverVersion,
    DateSeen,
    Marking,
    MarkingVersion,
    PostOffice,
    PostOfficeRegion,
    Region,
    SubmissionTransaction,
)


User = get_user_model()


class DateSeenPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="pw",
        )
        self.editor = User.objects.create_user(username="editor", password="pw")
        editors = Group.objects.create(name="Editors")
        editors.permissions.add(
            Permission.objects.get(codename="review_contribution")
        )
        self.editor.groups.add(editors)

        self.virginia = self._region("Virginia", "VA")
        self.maryland = self._region("Maryland", "MD")
        virginia_collection = Collection.objects.create(
            name="Virginia Collection",
            region=self.virginia,
            created_by=self.admin,
            modified_by=self.admin,
        )
        Collection.objects.create(
            name="Maryland Collection",
            region=self.maryland,
            created_by=self.admin,
            modified_by=self.admin,
        )
        CollectionAssignment.objects.create(
            user=self.editor,
            collection=virginia_collection,
            created_by=self.admin,
            modified_by=self.admin,
        )

        self.virginia_marking = self._marking("Richmond", self.virginia)
        self.maryland_marking = self._marking("Baltimore", self.maryland)

    def _region(self, name, abbrev):
        return Region.objects.create(
            name=name,
            abbrev=abbrev,
            region_tier="STATE",
            created_by=self.admin,
            modified_by=self.admin,
        )

    def _marking(self, town, region):
        post_office = PostOffice.objects.create(
            name=town,
            created_by=self.admin,
            modified_by=self.admin,
        )
        PostOfficeRegion.objects.create(
            post_office=post_office,
            region=region,
            created_by=self.admin,
            modified_by=self.admin,
        )
        return Marking.objects.create(
            type="TOWNMARK",
            inscription_txt=town.upper(),
            is_manuscript=True,
            post_office=post_office,
            created_by=self.admin,
            modified_by=self.admin,
        )

    def _cover(self, *markings):
        cover = Cover.objects.create(
            type="FC",
            created_by=self.admin,
            modified_by=self.admin,
        )
        for marking in markings:
            CoverMarking.objects.create(
                cover=cover,
                marking=marking,
                created_by=self.admin,
                modified_by=self.admin,
            )
        return cover

    def _date(self, subject, subject_type=DateSeen.SUBJECT_MARKING, year=1850):
        return DateSeen.objects.create(
            subject_type=subject_type,
            subject_id=subject.pk,
            date_year=year,
            granularity=DateSeen.GRANULARITY_YEAR,
            created_by=self.admin,
            modified_by=self.admin,
        )

    def _post(self, subject, subject_type=DateSeen.SUBJECT_MARKING, year=1850):
        return self.client.post(
            "/api/v2/dates-seen/",
            {
                "subject_type": subject_type,
                "subject_id": subject.pk,
                "date_year": year,
                "granularity": DateSeen.GRANULARITY_YEAR,
            },
            format="json",
        )

    # --- scoping -----------------------------------------------------------

    def test_editor_cannot_create_date_on_marking_in_unassigned_state(self):
        self.client.force_authenticate(self.editor)
        response = self._post(self.maryland_marking)
        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(DateSeen.objects.count(), 0)

    def test_editor_can_create_date_on_assigned_marking_and_it_is_audited(self):
        self.client.force_authenticate(self.editor)
        response = self._post(self.virginia_marking)
        self.assertEqual(response.status_code, 201, response.data)

        txn = SubmissionTransaction.objects.get(
            marking=self.virginia_marking,
            action=SubmissionTransaction.ACTION_RECORD_CREATE,
        )
        self.assertEqual(txn.actor, self.editor)
        self.assertEqual(txn.extra_payload["date_seen_id"], response.data["id"])
        version = MarkingVersion.objects.get(marking=self.virginia_marking)
        self.assertEqual(len(version.snapshot["dates_seen"]), 1)

    def test_editor_cannot_update_or_delete_date_on_unassigned_marking(self):
        row = self._date(self.maryland_marking)
        self.client.force_authenticate(self.editor)

        patched = self.client.patch(
            f"/api/v2/dates-seen/{row.pk}/", {"date_year": 1851}, format="json"
        )
        self.assertEqual(patched.status_code, 403, patched.data)

        deleted = self.client.delete(f"/api/v2/dates-seen/{row.pk}/")
        self.assertEqual(deleted.status_code, 403, deleted.data)

        row.refresh_from_db()
        self.assertEqual(row.date_year, 1850)

    # --- audit -------------------------------------------------------------

    def test_delete_writes_tombstone_and_version(self):
        row = self._date(self.virginia_marking)
        self.client.force_authenticate(self.editor)

        response = self.client.delete(f"/api/v2/dates-seen/{row.pk}/")
        self.assertIn(response.status_code, (200, 204))
        self.assertFalse(DateSeen.objects.filter(pk=row.pk).exists())

        txn = SubmissionTransaction.objects.get(
            marking=self.virginia_marking,
            action=SubmissionTransaction.ACTION_RECORD_DELETE,
        )
        self.assertEqual(txn.extra_payload["deleted_date_seen_id"], row.pk)
        self.assertEqual(len(txn.before_payload["dates_seen"]), 1)

        version = MarkingVersion.objects.filter(
            marking=self.virginia_marking
        ).first()
        self.assertEqual(version.snapshot["dates_seen"], [])

    def test_cover_date_scoped_to_all_linked_marking_regions(self):
        """A cover's region is the union of its markings' -- the editor must own all."""
        self.client.force_authenticate(self.editor)

        mixed = self._cover(self.virginia_marking, self.maryland_marking)
        denied = self._post(mixed, subject_type=DateSeen.SUBJECT_COVER)
        self.assertEqual(denied.status_code, 403, denied.data)

        virginia_only = self._cover(self.virginia_marking)
        allowed = self._post(virginia_only, subject_type=DateSeen.SUBJECT_COVER)
        self.assertEqual(allowed.status_code, 201, allowed.data)

        self.assertTrue(
            SubmissionTransaction.objects.filter(
                cover=virginia_only,
                action=SubmissionTransaction.ACTION_RECORD_CREATE,
            ).exists()
        )
        self.assertTrue(CoverVersion.objects.filter(cover=virginia_only).exists())

    # --- validation --------------------------------------------------------

    def test_duplicate_date_returns_400_not_500(self):
        self.client.force_authenticate(self.editor)
        self.assertEqual(self._post(self.virginia_marking).status_code, 201)

        duplicate = self._post(self.virginia_marking)
        self.assertEqual(duplicate.status_code, 400, duplicate.data)
        self.assertEqual(DateSeen.objects.count(), 1)

        # date_key varies by which parts are present, so a full date is not a
        # duplicate of the year-only row it shares a year with.
        full = self.client.post(
            "/api/v2/dates-seen/",
            {
                "subject_type": DateSeen.SUBJECT_MARKING,
                "subject_id": self.virginia_marking.pk,
                "date_year": 1850,
                "date_month": 3,
                "date_day": 4,
                "granularity": DateSeen.GRANULARITY_DAY,
            },
            format="json",
        )
        self.assertEqual(full.status_code, 201, full.data)

    def test_unrelated_integrity_error_is_not_reported_as_a_duplicate(self):
        """The race backstop matches on the constraint name, not IntegrityError.

        perform_create's atomic block also writes a version row, and
        create_marking_version reads max(version_no) then inserts against a
        unique_together -- so concurrent edits to one marking raise
        IntegrityError from the *version*, not the date. A bare except there
        would tell the editor their date was a duplicate when it was not.
        """
        self.client.force_authenticate(self.editor)
        with mock.patch(
            "common.api.v2.views.create_marking_version",
            side_effect=IntegrityError("Duplicate entry for key 'marking_id'"),
        ):
            with self.assertRaises(IntegrityError):
                self._post(self.virginia_marking)

    def test_subject_cannot_be_moved(self):
        row = self._date(self.virginia_marking)
        self.client.force_authenticate(self.editor)

        response = self.client.patch(
            f"/api/v2/dates-seen/{row.pk}/",
            {"subject_id": self.maryland_marking.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)

        row.refresh_from_db()
        self.assertEqual(row.subject_id, self.virginia_marking.pk)
