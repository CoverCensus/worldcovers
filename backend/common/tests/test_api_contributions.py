"""
Tests for the public submission endpoint plus the editor-only moderation
actions on the Contribution viewset (`editor-edit`, `approve`, `reject`).
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
