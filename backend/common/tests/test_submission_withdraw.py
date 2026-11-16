"""
Issue #21 (Ian's email) item #22: a submitter may delete (withdraw) their own
UNapproved submissions, not just drafts. The DELETE /submissions/<pk>/ path is
gated by IsOwnDeletableSubmission: any non-approved status owned by the
requester is deletable; an approved submission never is (its published marking
goes through the recycle bin instead).
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from common.models import Collection, Submission, Region


User = get_user_model()


class SubmissionWithdrawTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="owner", password="pw")
        self.other = User.objects.create_user(username="other", password="pw")
        self.region = Region.objects.create(
            name="Virginia",
            abbrev="VA",
            region_tier="STATE",
            created_by=self.owner,
            modified_by=self.owner,
        )
        self.collection = Collection.objects.create(
            name="Virginia",
            region=self.region,
            created_by=self.owner,
            modified_by=self.owner,
        )
        self.client = APIClient()

    def _submission(self, status, contributor=None):
        return Submission.objects.create(
            contributor=contributor or self.owner,
            collection=self.collection,
            submitted_data={"submission_kind": "marking", "state": "VA"},
            status=status,
            created_by=contributor or self.owner,
            modified_by=contributor or self.owner,
        )

    def _url(self, submission):
        return f"/api/v2/submissions/{submission.pk}/"

    def test_owner_can_delete_own_pending_submission(self):
        contrib = self._submission(Submission.STATUS_PENDING)
        self.client.force_authenticate(self.owner)
        response = self.client.delete(self._url(contrib))
        self.assertEqual(response.status_code, 204, getattr(response, "data", None))
        self.assertFalse(Submission.objects.filter(pk=contrib.pk).exists())

    def test_owner_cannot_delete_own_approved_submission(self):
        contrib = self._submission(Submission.STATUS_APPROVED)
        self.client.force_authenticate(self.owner)
        response = self.client.delete(self._url(contrib))
        self.assertIn(response.status_code, (403, 404))
        self.assertTrue(Submission.objects.filter(pk=contrib.pk).exists())

    def test_non_owner_cannot_delete_others_pending_submission(self):
        contrib = self._submission(Submission.STATUS_PENDING, contributor=self.owner)
        self.client.force_authenticate(self.other)
        response = self.client.delete(self._url(contrib))
        self.assertIn(response.status_code, (403, 404))
        self.assertTrue(Submission.objects.filter(pk=contrib.pk).exists())
