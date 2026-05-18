"""
Integration tests for MarkingViewSet plus the custom non-router endpoints
(MarkingDateRangeView, DeleteMyMarkingView).
"""
from __future__ import annotations

from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from common.models import Marking, MarkingType, SubmissionTransaction
from common.tests.factories import (
    assign_editor,
    make_collection,
    make_color,
    make_contributor,
    make_cover,
    make_cover_date_seen,
    make_cover_marking,
    make_editor,
    make_lettering,
    make_marking,
    make_post_office,
    make_region,
    make_shape,
    make_superuser,
)


class MarkingListEndpointTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.editor = make_editor()
        cls.region = make_region(name="Virginia", abbrev="VA", creator=cls.editor)
        cls.post_office = make_post_office(name="Richmond", region=cls.region, creator=cls.editor)
        cls.collection = make_collection(creator=cls.editor, region=cls.region)
        assign_editor(cls.editor, cls.collection, creator=cls.editor)
        for code, mtype in [("VA-1", MarkingType.TOWNMARK), ("VA-R-1", MarkingType.RATEMARK)]:
            make_marking(
                code=code,
                type=mtype,
                creator=cls.editor,
                post_office=cls.post_office,
            )

    def test_list_is_public_readable(self):
        url = reverse("marking-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if "results" in response.data else response.data
        codes = sorted([row["code"] for row in results])
        self.assertEqual(codes, ["VA-1", "VA-R-1"])

    def test_list_supports_type_filter(self):
        url = reverse("marking-list")
        response = self.client.get(url, {"type": "RATEMARK"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if "results" in response.data else response.data
        self.assertEqual([row["code"] for row in results], ["VA-R-1"])

    def test_list_includes_state_annotation(self):
        url = reverse("marking-list")
        response = self.client.get(url)
        results = response.data["results"] if "results" in response.data else response.data
        self.assertEqual(results[0]["state"], "Virginia")
        self.assertEqual(results[0]["state_abbrev"], "VA")


class MarkingDetailEndpointTest(APITestCase):
    def setUp(self):
        self.editor = make_editor()
        self.region = make_region(creator=self.editor)
        self.collection = make_collection(creator=self.editor, region=self.region)
        assign_editor(self.editor, self.collection, creator=self.editor)
        self.marking = make_marking(
            creator=self.editor,
            post_office=make_post_office(region=self.region, creator=self.editor),
        )

    def test_retrieve_returns_full_detail(self):
        url = reverse("marking-detail", args=[self.marking.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("citations", response.data)
        self.assertIn("images", response.data)
        self.assertEqual(response.data["id"], self.marking.pk)


class MarkingCreateUpdateDeleteTest(APITestCase):
    """Editor-scoped write endpoints must record a SubmissionTransaction and
    create a MarkingVersion."""

    def setUp(self):
        self.editor = make_editor()
        self.region = make_region(creator=self.editor)
        self.collection = make_collection(creator=self.editor, region=self.region)
        assign_editor(self.editor, self.collection, creator=self.editor)
        self.po = make_post_office(region=self.region, creator=self.editor)
        self.color = make_color(creator=self.editor)
        self.shape = make_shape(creator=self.editor)
        self.lettering = make_lettering(creator=self.editor)

    def _payload(self, **overrides):
        data = {
            "type": MarkingType.TOWNMARK,
            "code": "NEW-1",
            "inscription_txt": "NEWTOWN",
            "is_manuscript": False,
            "is_irreg": False,
            "post_office": self.po.pk,
            "shape": self.shape.pk,
            "lettering": self.lettering.pk,
            "color": self.color.pk,
        }
        data.update(overrides)
        return data

    def test_create_requires_authentication(self):
        url = reverse("marking-list")
        response = self.client.post(url, self._payload(), format="json")
        # IsAuthenticatedOrReadOnly => 401/403 for unauthenticated writes.
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_create_emits_record_create_transaction(self):
        self.client.force_login(self.editor)
        url = reverse("marking-list")
        response = self.client.post(url, self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        marking_id = response.data["id"]
        # Audit row should exist with action=record_create and the new marking.
        self.assertTrue(
            SubmissionTransaction.objects.filter(
                action=SubmissionTransaction.ACTION_RECORD_CREATE,
                marking_id=marking_id,
            ).exists()
        )
        marking = Marking.objects.get(pk=marking_id)
        self.assertEqual(marking.versions.count(), 1)

    def test_update_records_change(self):
        marking = make_marking(creator=self.editor, post_office=self.po, color=self.color)
        url = reverse("marking-detail", args=[marking.pk])
        self.client.force_login(self.editor)
        response = self.client.patch(url, {"inscription_txt": "CHANGED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        marking.refresh_from_db()
        self.assertEqual(marking.inscription_txt, "CHANGED")
        self.assertTrue(
            SubmissionTransaction.objects.filter(
                action=SubmissionTransaction.ACTION_RECORD_UPDATE,
                marking=marking,
            ).exists()
        )

    def test_delete_emits_record_delete_transaction(self):
        marking = make_marking(creator=self.editor, post_office=self.po, color=self.color)
        marking_id = marking.pk
        url = reverse("marking-detail", args=[marking_id])
        self.client.force_login(self.editor)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Marking.objects.filter(pk=marking_id).exists())
        # The marking FK on the transaction will be nulled by SET_NULL after the
        # delete cascades, so we filter by the extra_payload pointer instead.
        self.assertTrue(
            SubmissionTransaction.objects.filter(
                action=SubmissionTransaction.ACTION_RECORD_DELETE,
                extra_payload__contains={"deleted_marking_id": marking_id},
            ).exists()
        )


class MarkingChangelogTest(APITestCase):
    """Changelog action returns transaction history for the marking."""

    def setUp(self):
        self.editor = make_editor()
        self.region = make_region(creator=self.editor)
        self.collection = make_collection(region=self.region, creator=self.editor)
        assign_editor(self.editor, self.collection, creator=self.editor)
        self.marking = make_marking(
            creator=self.editor,
            post_office=make_post_office(region=self.region, creator=self.editor),
        )

    def test_returns_events_and_versions(self):
        # Generate some history by editing the marking via the API.
        self.client.force_login(self.editor)
        url = reverse("marking-detail", args=[self.marking.pk])
        self.client.patch(url, {"inscription_txt": "EDIT 1"}, format="json")
        self.client.patch(url, {"inscription_txt": "EDIT 2"}, format="json")

        changelog_url = reverse("marking-changelog", args=[self.marking.pk])
        response = self.client.get(changelog_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["marking_id"], self.marking.pk)
        self.assertGreaterEqual(len(response.data["events"]), 2)
        self.assertGreaterEqual(len(response.data["versions"]), 2)

    def test_changelog_denied_for_unrelated_editor(self):
        self.client.force_login(self.editor)
        # Create a second marking owned by a different region; the editor isn't
        # assigned to it.
        other_region = make_region(name="Ohio", abbrev="OH", creator=self.editor)
        other_po = make_post_office(name="Columbus", region=other_region, creator=self.editor)
        foreign = make_marking(
            creator=self.editor,
            post_office=other_po,
            code="OH-FOREIGN",
        )
        url = reverse("marking-changelog", args=[foreign.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class MarkingDateRangeViewTest(APITestCase):
    def test_returns_null_when_no_data(self):
        url = reverse("markings-range")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["earliest_year"])
        self.assertIsNone(response.data["latest_year"])

    def test_returns_min_and_max_years(self):
        admin = make_superuser("range_admin")
        marking = make_marking(creator=admin)
        cover = make_cover(creator=admin)
        make_cover_marking(cover, marking, creator=admin)
        # MarkingDateRangeView aggregates DateSeen.date across every row,
        # regardless of subject_type, so cover-side DateSeen rows are enough
        # to exercise both bounds.
        make_cover_date_seen(cover, date(1850, 1, 1), creator=admin)
        make_cover_date_seen(cover, date(1900, 12, 31), creator=admin)
        url = reverse("markings-range")
        response = self.client.get(url)
        self.assertEqual(response.data["earliest_year"], 1850)
        self.assertEqual(response.data["latest_year"], 1900)


class DeleteMyMarkingViewTest(APITestCase):
    def setUp(self):
        self.admin = make_superuser("admin_delete")
        self.contributor = make_contributor("delete_contrib")
        self.region = make_region(creator=self.admin)
        self.po = make_post_office(region=self.region, creator=self.admin)

    def test_invalid_id_returns_400(self):
        self.client.force_login(self.admin)
        response = self.client.delete("/api/v2/markings/not-a-number/delete-mine/")
        # Django will treat 'not-a-number' as no match for int converter -> 404 from URL.
        # Either way we shouldn't 200/204.
        self.assertIn(response.status_code, (status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND))

    def test_missing_marking_returns_404(self):
        self.client.force_login(self.admin)
        url = reverse("marking-delete-mine", args=[999999])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_superuser_can_delete_any(self):
        marking = make_marking(creator=self.admin, post_office=self.po)
        self.client.force_login(self.admin)
        url = reverse("marking-delete-mine", args=[marking.pk])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Marking.objects.filter(pk=marking.pk).exists())

    def test_contributor_cannot_delete_others_marking(self):
        marking = make_marking(creator=self.admin, post_office=self.po)
        self.client.force_login(self.contributor)
        url = reverse("marking-delete-mine", args=[marking.pk])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Marking.objects.filter(pk=marking.pk).exists())
