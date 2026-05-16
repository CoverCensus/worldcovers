"""
Tests for the audit/versioning helpers in `common.audit`.

These are pure-function helpers that build snapshots, log SubmissionTransactions,
create MarkingVersions, and restore a Marking from a snapshot. They underpin
the editor-portal record history view, so regressions here corrupt the audit
trail.
"""
from __future__ import annotations

from django.test import TestCase

from common.audit import (
    build_marking_snapshot,
    compute_payload_diff,
    create_marking_version,
    log_submission_transaction,
    restore_marking_from_snapshot,
)
from common.models import (
    Citation,
    ReferenceWork,
    SubmissionTransaction,
)
from common.tests.factories import (
    make_marking,
    make_post_office,
    make_superuser,
)


class BuildMarkingSnapshotTest(TestCase):
    def test_empty_for_none(self):
        self.assertEqual(build_marking_snapshot(None), {})

    def test_includes_core_scalar_fields(self):
        marking = make_marking(code="VA-100", inscription_txt="RICHMOND")
        snap = build_marking_snapshot(marking)
        self.assertEqual(snap["marking_id"], marking.pk)
        self.assertEqual(snap["code"], "VA-100")
        self.assertEqual(snap["inscription_txt"], "RICHMOND")
        self.assertEqual(snap["state"], marking.post_office.region.name)
        self.assertEqual(snap["town"], marking.post_office.name)
        self.assertIsNotNone(snap["captured_at"])

    def test_includes_citation_rows(self):
        marking = make_marking()
        ref = ReferenceWork.objects.create(
            title="Postal History",
            authorship="Doe",
            publisher="Press",
            publication_year=2020,
            created_by=marking.created_by,
            modified_by=marking.created_by,
        )
        Citation.objects.create(
            reference_work=ref,
            subject_type="MARKING",
            subject_id=marking.pk,
            citation_detail="p. 42",
            created_by=marking.created_by,
            modified_by=marking.created_by,
        )
        snap = build_marking_snapshot(marking)
        self.assertEqual(len(snap["citations"]), 1)
        self.assertEqual(snap["citations"][0]["citation_detail"], "p. 42")


class ComputePayloadDiffTest(TestCase):
    def test_diff_lists_changed_fields_only(self):
        before = {"code": "A-1", "town": "X", "shape_id": 1, "captured_at": "old"}
        after = {"code": "A-2", "town": "X", "shape_id": 2, "captured_at": "new"}
        diff = compute_payload_diff(before, after)
        fields = {row["field"] for row in diff}
        self.assertEqual(fields, {"code", "shape_id"})
        # captured_at should always be filtered out -- it changes every save
        # and isn't a semantically meaningful change to surface to editors.
        self.assertNotIn("captured_at", fields)

    def test_diff_handles_added_and_removed_keys(self):
        before = {"a": 1}
        after = {"b": 2}
        diff = compute_payload_diff(before, after)
        rows = {row["field"]: row for row in diff}
        self.assertIn("a", rows)
        self.assertIn("b", rows)
        self.assertEqual(rows["a"]["after"], None)
        self.assertEqual(rows["b"]["before"], None)

    def test_diff_handles_non_dict_inputs(self):
        self.assertEqual(compute_payload_diff(None, None), [])
        self.assertEqual(compute_payload_diff("string", None), [])


class LogSubmissionTransactionTest(TestCase):
    def test_records_action_and_actor(self):
        admin = make_superuser()
        marking = make_marking(creator=admin)
        txn = log_submission_transaction(
            action=SubmissionTransaction.ACTION_RECORD_UPDATE,
            actor=admin,
            marking=marking,
            source=SubmissionTransaction.SOURCE_EDITOR_PORTAL,
            before_payload={"code": "A"},
            after_payload={"code": "B"},
        )
        self.assertEqual(txn.actor_id, admin.pk)
        self.assertEqual(txn.marking_id, marking.pk)
        self.assertEqual(txn.action, SubmissionTransaction.ACTION_RECORD_UPDATE)
        # diff payload is auto-computed:
        self.assertTrue(any(row["field"] == "code" for row in txn.diff_payload))

    def test_anonymous_actor_is_stored_as_null(self):
        """A non-authenticated actor (e.g. AnonymousUser) must not be saved as actor."""
        class _AnonUser:
            is_authenticated = False

        txn = log_submission_transaction(
            action=SubmissionTransaction.ACTION_SUBMIT,
            actor=_AnonUser(),
        )
        self.assertIsNone(txn.actor)


class CreateMarkingVersionTest(TestCase):
    def test_version_numbers_increment_per_marking(self):
        admin = make_superuser()
        marking = make_marking(creator=admin)
        v1 = create_marking_version(marking, None, admin)
        v2 = create_marking_version(marking, None, admin)
        v3 = create_marking_version(marking, None, admin)
        self.assertEqual([v1.version_no, v2.version_no, v3.version_no], [1, 2, 3])

    def test_version_is_marking_scoped(self):
        admin = make_superuser()
        m1 = make_marking(code="M-1", creator=admin)
        m2 = make_marking(
            code="M-2",
            creator=admin,
            post_office=make_post_office(name="Other", creator=admin),
        )
        create_marking_version(m1, None, admin)
        create_marking_version(m1, None, admin)
        first_for_m2 = create_marking_version(m2, None, admin)
        self.assertEqual(first_for_m2.version_no, 1)


class RestoreMarkingFromSnapshotTest(TestCase):
    def test_restores_scalar_fields(self):
        admin = make_superuser()
        marking = make_marking(creator=admin, code="ORIG", inscription_txt="OLD")
        snapshot = build_marking_snapshot(marking)

        marking.code = "NEW"
        marking.inscription_txt = "NEW TEXT"
        marking.save()

        restored = restore_marking_from_snapshot(marking, snapshot, admin)
        restored.refresh_from_db()
        self.assertEqual(restored.code, "ORIG")
        self.assertEqual(restored.inscription_txt, "OLD")

    def test_restore_recreates_citations(self):
        admin = make_superuser()
        marking = make_marking(creator=admin)
        ref = ReferenceWork.objects.create(
            title="Ref", authorship="A", publisher="P", publication_year=1999,
            created_by=admin, modified_by=admin,
        )
        Citation.objects.create(
            reference_work=ref,
            subject_type="MARKING",
            subject_id=marking.pk,
            citation_detail="p. 1",
            created_by=admin,
            modified_by=admin,
        )
        snapshot = build_marking_snapshot(marking)

        # Caller has since added new citations; restore should wipe and reseed.
        Citation.objects.create(
            reference_work=ref,
            subject_type="MARKING",
            subject_id=marking.pk,
            citation_detail="p. 2",
            created_by=admin,
            modified_by=admin,
        )
        self.assertEqual(
            Citation.objects.filter(subject_type="MARKING", subject_id=marking.pk).count(),
            2,
        )
        restore_marking_from_snapshot(marking, snapshot, admin)
        remaining = list(
            Citation.objects.filter(subject_type="MARKING", subject_id=marking.pk)
            .values_list("citation_detail", flat=True)
        )
        self.assertEqual(remaining, ["p. 1"])

    def test_restore_short_circuits_for_invalid_snapshot(self):
        admin = make_superuser()
        marking = make_marking(creator=admin, code="STAY")
        restore_marking_from_snapshot(marking, "not a dict", admin)
        marking.refresh_from_db()
        self.assertEqual(marking.code, "STAY")
