"""
Tests for the public submission endpoint plus the editor-only moderation
actions on the Contribution viewset (`editor-edit`, `approve`, `reject`,
`request-revision`) and the contributor-side resubmit-after-revision path.
"""
from __future__ import annotations

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from common.models import Contribution, SubmissionTransaction
from common.tests.factories import (
    assign_editor,
    make_collection,
    make_contributor,
    make_editor,
    make_region,
    make_superuser,
)


class ContributionSubmitTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = make_superuser("submit_admin")
        cls.region = make_region(name="Virginia", abbrev="VA", creator=cls.admin)
        cls.collection = make_collection(region=cls.region, creator=cls.admin)

    def setUp(self):
        self.contributor = make_contributor()
        self.client.force_login(self.contributor)

    def test_unauthenticated_post_rejected(self):
        self.client.logout()
        response = self.client.post(reverse("contribution-list"), {"state": "Virginia"}, format="json")
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_state_is_required(self):
        response = self.client.post(reverse("contribution-list"), {"type": "TOWNMARK"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("state", response.data["detail"].lower())

    def test_unknown_state_rejected(self):
        response = self.client.post(reverse("contribution-list"), {"state": "Atlantis"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_type_rejected(self):
        response = self.client.post(
            reverse("contribution-list"),
            {"state": "Virginia", "type": "PARADE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_successful_submission_creates_pending_contribution(self):
        response = self.client.post(
            reverse("contribution-list"),
            {
                "state": "Virginia",
                "town": "Richmond",
                "type": "TOWNMARK",
                "desc": "Black circular 32mm",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        contrib = Contribution.objects.get(pk=response.data["id"])
        self.assertEqual(contrib.status, Contribution.STATUS_PENDING)
        self.assertEqual(contrib.collection_id, self.collection.pk)
        self.assertEqual(contrib.contributor_id, self.contributor.pk)
        # And a submit-transaction is recorded.
        self.assertTrue(
            SubmissionTransaction.objects.filter(
                action=SubmissionTransaction.ACTION_SUBMIT,
                contribution=contrib,
            ).exists()
        )

    def test_can_be_saved_as_draft(self):
        response = self.client.post(
            reverse("contribution-list"),
            {"state": "Virginia", "save_as_draft": "true"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        contrib = Contribution.objects.get(pk=response.data["id"])
        self.assertEqual(contrib.status, Contribution.STATUS_DRAFT)


class ContributionListAccessTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = make_superuser()
        cls.region = make_region(creator=cls.admin)
        cls.collection = make_collection(region=cls.region, creator=cls.admin)
        cls.editor = make_editor("assigned_ed")
        assign_editor(cls.editor, cls.collection, creator=cls.admin)
        cls.contributor = make_contributor("listing_contrib")
        Contribution.objects.create(
            contributor=cls.contributor,
            collection=cls.collection,
            submitted_data={"state": "Virginia"},
        )

    def test_contributor_sees_only_their_own(self):
        other = make_contributor("other_contrib")
        Contribution.objects.create(
            contributor=other, collection=self.collection, submitted_data={"state": "Virginia"}
        )
        self.client.force_login(self.contributor)
        response = self.client.get(reverse("contribution-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if "results" in response.data else response.data
        contributor_ids = {row["contributor"] for row in results}
        self.assertEqual(contributor_ids, {self.contributor.pk})

    def test_assigned_editor_sees_contributions(self):
        self.client.force_login(self.editor)
        response = self.client.get(reverse("contribution-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if "results" in response.data else response.data
        self.assertGreaterEqual(len(results), 1)


class ContributionEditorEditTest(APITestCase):
    def setUp(self):
        self.admin = make_superuser()
        self.region = make_region(creator=self.admin)
        self.collection = make_collection(region=self.region, creator=self.admin)
        self.editor = make_editor()
        assign_editor(self.editor, self.collection, creator=self.admin)
        self.contributor = make_contributor()
        self.contrib = Contribution.objects.create(
            contributor=self.contributor,
            collection=self.collection,
            submitted_data={"state": "Virginia", "town": "Richmond"},
        )
        self.client.force_login(self.editor)

    def test_merges_payload_into_submitted_data(self):
        url = reverse("contribution-editor-edit", args=[self.contrib.pk])
        response = self.client.patch(url, {"town": "Fairfax", "width_mm": 32}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.contrib.refresh_from_db()
        self.assertEqual(self.contrib.submitted_data["town"], "Fairfax")
        self.assertEqual(self.contrib.submitted_data["state"], "Virginia")  # untouched
        self.assertEqual(self.contrib.submitted_data["width_mm"], 32)
        self.assertTrue(
            SubmissionTransaction.objects.filter(
                action=SubmissionTransaction.ACTION_EDITOR_EDIT,
                contribution=self.contrib,
            ).exists()
        )

    def test_non_pending_contribution_rejected(self):
        self.contrib.status = Contribution.STATUS_APPROVED
        self.contrib.save(update_fields=["status"])
        url = reverse("contribution-editor-edit", args=[self.contrib.pk])
        response = self.client.patch(url, {"town": "X"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_dict_payload_rejected(self):
        url = reverse("contribution-editor-edit", args=[self.contrib.pk])
        response = self.client.patch(url, ["not-a-dict"], format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ContributionRejectTest(APITestCase):
    """The reject action does not run the (unimplemented) apply pipeline."""

    def setUp(self):
        self.admin = make_superuser()
        self.region = make_region(creator=self.admin)
        self.collection = make_collection(region=self.region, creator=self.admin)
        self.editor = make_editor()
        assign_editor(self.editor, self.collection, creator=self.admin)
        self.contributor = make_contributor()
        self.contrib = Contribution.objects.create(
            contributor=self.contributor,
            collection=self.collection,
            submitted_data={"state": "Virginia"},
        )

    def test_assigned_editor_can_reject(self):
        self.client.force_login(self.editor)
        url = reverse("contribution-reject", args=[self.contrib.pk])
        response = self.client.post(url, {"review_notes": "Needs better image"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.contrib.refresh_from_db()
        self.assertEqual(self.contrib.status, Contribution.STATUS_REJECTED)
        self.assertEqual(self.contrib.reviewer_id, self.editor.pk)
        self.assertEqual(self.contrib.review_notes, "Needs better image")
        self.assertTrue(
            SubmissionTransaction.objects.filter(
                action=SubmissionTransaction.ACTION_REJECT,
                contribution=self.contrib,
            ).exists()
        )

    def test_cannot_reject_non_pending_contribution(self):
        self.contrib.status = Contribution.STATUS_REJECTED
        self.contrib.save(update_fields=["status"])
        self.client.force_login(self.editor)
        url = reverse("contribution-reject", args=[self.contrib.pk])
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unassigned_editor_cannot_see_contribution(self):
        """An editor without a CollectionAssignment to the contribution's
        Collection won't even see it in `get_queryset`, so the reject route
        404s instead of leaking object existence."""
        unassigned = make_editor("unassigned")
        self.client.force_login(unassigned)
        url = reverse("contribution-reject", args=[self.contrib.pk])
        response = self.client.post(url, {}, format="json")
        self.assertIn(
            response.status_code,
            (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND),
        )


class ContributionApproveTest(APITestCase):
    """Approve currently raises NotImplementedError during the Phase 1
    rewrite; the view surfaces that as 501."""

    def setUp(self):
        self.admin = make_superuser()
        self.region = make_region(creator=self.admin)
        self.collection = make_collection(region=self.region, creator=self.admin)
        self.editor = make_editor()
        assign_editor(self.editor, self.collection, creator=self.admin)
        self.contributor = make_contributor()
        self.contrib = Contribution.objects.create(
            contributor=self.contributor,
            collection=self.collection,
            submitted_data={"state": "Virginia"},
        )

    def test_approve_returns_501_while_apply_pipeline_unimplemented(self):
        self.client.force_login(self.editor)
        url = reverse("contribution-approve", args=[self.contrib.pk])
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_501_NOT_IMPLEMENTED)
        self.contrib.refresh_from_db()
        self.assertEqual(self.contrib.status, Contribution.STATUS_PENDING)


class ContributionRequestRevisionTest(APITestCase):
    """Editor returns a pending contribution to the contributor for changes."""

    def setUp(self):
        self.admin = make_superuser()
        self.region = make_region(creator=self.admin)
        self.collection = make_collection(region=self.region, creator=self.admin)
        self.editor = make_editor()
        assign_editor(self.editor, self.collection, creator=self.admin)
        self.contributor = make_contributor()
        self.contrib = Contribution.objects.create(
            contributor=self.contributor,
            collection=self.collection,
            submitted_data={"state": "Virginia", "town": "Richmond"},
        )

    def test_assigned_editor_can_request_revision(self):
        self.client.force_login(self.editor)
        url = reverse("contribution-request-revision", args=[self.contrib.pk])
        response = self.client.post(
            url, {"review_notes": "Please attach a clearer image."}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.contrib.refresh_from_db()
        self.assertEqual(self.contrib.status, Contribution.STATUS_NEEDS_REVISION)
        self.assertEqual(self.contrib.reviewer_id, self.editor.pk)
        self.assertEqual(self.contrib.review_notes, "Please attach a clearer image.")
        # submitted_data is not modified by the return action.
        self.assertEqual(self.contrib.submitted_data["town"], "Richmond")
        self.assertTrue(
            SubmissionTransaction.objects.filter(
                action=SubmissionTransaction.ACTION_EDIT_SUBMISSION,
                contribution=self.contrib,
                source=SubmissionTransaction.SOURCE_EDITOR_PORTAL,
            ).exists()
        )

    def test_review_notes_required(self):
        self.client.force_login(self.editor)
        url = reverse("contribution-request-revision", args=[self.contrib.pk])
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.contrib.refresh_from_db()
        self.assertEqual(self.contrib.status, Contribution.STATUS_PENDING)

    def test_whitespace_only_review_notes_rejected(self):
        self.client.force_login(self.editor)
        url = reverse("contribution-request-revision", args=[self.contrib.pk])
        response = self.client.post(url, {"review_notes": "   "}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_request_revision_when_not_pending(self):
        self.contrib.status = Contribution.STATUS_NEEDS_REVISION
        self.contrib.save(update_fields=["status"])
        self.client.force_login(self.editor)
        url = reverse("contribution-request-revision", args=[self.contrib.pk])
        response = self.client.post(url, {"review_notes": "again"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ContributionContributorResubmitTest(APITestCase):
    """Contributor edits a returned contribution and resubmits it for review."""

    def setUp(self):
        self.admin = make_superuser()
        self.region = make_region(name="Virginia", abbrev="VA", creator=self.admin)
        self.collection = make_collection(region=self.region, creator=self.admin)
        self.contributor = make_contributor()
        self.contrib = Contribution.objects.create(
            contributor=self.contributor,
            collection=self.collection,
            submitted_data={"state": "Virginia", "town": "Richmond"},
            status=Contribution.STATUS_NEEDS_REVISION,
            review_notes="Please attach a clearer image.",
        )

    def _post(self, payload):
        return self.client.post(reverse("contribution-list"), payload, format="multipart")

    def test_resubmit_after_revision_flips_back_to_pending(self):
        self.client.force_login(self.contributor)
        response = self._post({
            "state": "Virginia",
            "town": "Fairfax",
            "type": "TOWNMARK",
            "edit_contribution_id": str(self.contrib.pk),
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.contrib.refresh_from_db()
        self.assertEqual(self.contrib.pk, response.data["id"])
        self.assertEqual(self.contrib.status, Contribution.STATUS_PENDING)
        self.assertIsNone(self.contrib.reviewer_id)
        self.assertEqual(self.contrib.review_notes, "")
        self.assertEqual(self.contrib.submitted_data["town"], "Fairfax")
        self.assertEqual(self.contrib.submitted_data["state"], "Virginia")
        self.assertTrue(
            SubmissionTransaction.objects.filter(
                action=SubmissionTransaction.ACTION_EDIT_SUBMISSION,
                contribution=self.contrib,
                source=SubmissionTransaction.SOURCE_CONTRIBUTOR_PORTAL,
            ).exists()
        )

    def test_resubmit_against_rejected_contribution_is_404(self):
        self.contrib.status = Contribution.STATUS_REJECTED
        self.contrib.save(update_fields=["status"])
        self.client.force_login(self.contributor)
        response = self._post({
            "state": "Virginia",
            "town": "Fairfax",
            "edit_contribution_id": str(self.contrib.pk),
        })
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_other_contributor_cannot_resubmit(self):
        intruder = make_contributor("intruder")
        self.client.force_login(intruder)
        response = self._post({
            "state": "Virginia",
            "town": "Fairfax",
            "edit_contribution_id": str(self.contrib.pk),
        })
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.contrib.refresh_from_db()
        self.assertEqual(self.contrib.status, Contribution.STATUS_NEEDS_REVISION)
