"""
Tests for the supporting lookup viewsets exposed under /api/v2/.

The lookup endpoints (regions, post-offices, FAQ, collections) feed the
SPA's autocompletes and admin tooling; their permission and filtering
behavior is what's checked here.
"""
from __future__ import annotations

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from common.models import Collection, FAQEntry, Region
from common.tests.factories import (
    assign_editor,
    make_collection,
    make_editor,
    make_post_office,
    make_region,
    make_superuser,
    make_user,
)


class RegionViewSetTest(APITestCase):
    def setUp(self):
        self.admin = make_superuser()
        self.va = make_region(name="Virginia", abbrev="VA", creator=self.admin)
        self.oh = make_region(name="Ohio", abbrev="OH", creator=self.admin)

    def test_anonymous_can_list_regions(self):
        url = reverse("region-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_assigned_only_returns_only_users_regions(self):
        editor = make_editor()
        collection = make_collection(region=self.va, creator=self.admin)
        assign_editor(editor, collection, creator=self.admin)
        self.client.force_login(editor)
        response = self.client.get(reverse("region-list"), {"assigned_only": "true"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if "results" in response.data else response.data
        names = [r["name"] for r in results]
        self.assertIn("Virginia", names)
        self.assertNotIn("Ohio", names)

    def test_assigned_only_for_anonymous_returns_empty_results(self):
        response = self.client.get(reverse("region-list"), {"assigned_only": "true"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if "results" in response.data else response.data
        self.assertEqual(results, [])

    def test_assigned_only_sets_no_store_cache(self):
        editor = make_editor()
        self.client.force_login(editor)
        response = self.client.get(reverse("region-list"), {"assigned_only": "true"})
        self.assertIn("no-store", response["Cache-Control"])

    def test_search_by_abbrev(self):
        response = self.client.get(reverse("region-list"), {"search": "OH"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if "results" in response.data else response.data
        names = [r["name"] for r in results]
        self.assertIn("Ohio", names)


class PostOfficeTownOptionsTest(APITestCase):
    def test_returns_unique_town_state_pairs(self):
        admin = make_superuser()
        va = make_region(name="Virginia", abbrev="VA", creator=admin)
        oh = make_region(name="Ohio", abbrev="OH", creator=admin)
        make_post_office(name="Richmond", region=va, creator=admin)
        make_post_office(name="Columbus", region=oh, creator=admin)

        url = reverse("post-office-town-options")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        pairs = [(row["town"], row["state"]) for row in response.data]
        self.assertIn(("Richmond", "Virginia"), pairs)
        self.assertIn(("Columbus", "Ohio"), pairs)


class FAQEntryViewSetTest(APITestCase):
    def setUp(self):
        admin = make_superuser()
        FAQEntry.objects.create(
            question="Q1", answer="A1", is_active=True, display_order=1,
            created_by=admin, modified_by=admin,
        )
        FAQEntry.objects.create(
            question="Hidden", answer="A2", is_active=False, display_order=2,
            created_by=admin, modified_by=admin,
        )

    def test_public_endpoint_lists_only_active(self):
        url = reverse("faq-entry-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if "results" in response.data else response.data
        questions = [r["question"] for r in results]
        self.assertEqual(questions, ["Q1"])


class CollectionViewSetPermissionsTest(APITestCase):
    def setUp(self):
        self.admin = make_superuser()
        self.region = make_region(creator=self.admin)
        self.collection = make_collection(region=self.region, creator=self.admin)

    def test_anyone_authenticated_can_list(self):
        user = make_user("plain_user")
        self.client.force_login(user)
        response = self.client.get(reverse("collection-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_anonymous_cannot_list_collections(self):
        # CollectionViewSet uses IsAuthenticated for safe methods via get_permissions.
        response = self.client.get(reverse("collection-list"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_admin_cannot_create(self):
        user = make_user("not_admin")
        self.client.force_login(user)
        new_region = make_region(name="NewRegion", abbrev="NR", creator=self.admin)
        response = self.client.post(
            reverse("collection-list"),
            {"name": "New Coll", "region_id": new_region.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_assign_and_unassign_editor(self):
        editor = make_editor("editor_assign")
        self.client.force_login(self.admin)

        assign_url = reverse("collection-assign-editor", args=[self.collection.pk])
        response = self.client.post(assign_url, {"user_id": editor.pk}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.collection.editor_assignments.filter(user=editor).count(), 1)

        editors_url = reverse("collection-editors", args=[self.collection.pk])
        response = self.client.get(editors_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = [row["username"] for row in response.data]
        self.assertIn("editor_assign", usernames)

        unassign_url = reverse("collection-unassign-editor", args=[self.collection.pk, editor.pk])
        response = self.client.delete(unassign_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(self.collection.editor_assignments.filter(user=editor).exists())

    def test_unassign_missing_assignment_returns_404(self):
        editor = make_editor("never_assigned")
        self.client.force_login(self.admin)
        unassign_url = reverse("collection-unassign-editor", args=[self.collection.pk, editor.pk])
        response = self.client.delete(unassign_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class LookupCRUDDefaultsTest(APITestCase):
    """Behavioural pins for the simple lookup viewsets (Color, Shape).

    The serializers currently use `Meta.fields = "__all__"`, which exposes
    `created_by` / `modified_by` from `TimestampedModel` as required write
    fields. The viewsets' `perform_create` would stamp them from
    `request.user`, but DRF runs `serializer.is_valid()` before
    `perform_create`, so a payload that omits those FKs is rejected with 400
    before perform_create is ever reached.

    Until those serializers are tightened (mark the user FKs read-only or
    move to an explicit field list), POSTs from the SPA must include
    `created_by` / `modified_by` to succeed. These tests pin both the
    current 400-when-missing behaviour AND the 201 path when the IDs are
    passed, so a future cleanup flips the first one without needing to
    rediscover the wart.
    """

    def setUp(self):
        self.user = make_user("lookup_writer", password="pa$$word123")
        self.client.force_login(self.user)

    def test_create_color_without_user_fks_currently_returns_400(self):
        response = self.client.post(
            reverse("color-list"),
            {"name": "Magenta", "hex_val": "#FF00FF"},
            format="json",
        )
        # Pin: this should ideally be 201, but the "__all__" serializer
        # currently exposes created_by/modified_by as required.
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("created_by", response.data)
        self.assertIn("modified_by", response.data)

    def test_create_color_succeeds_when_user_fks_are_supplied(self):
        response = self.client.post(
            reverse("color-list"),
            {
                "name": "Magenta",
                "hex_val": "#FF00FF",
                "created_by": self.user.pk,
                "modified_by": self.user.pk,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        from common.models import Color
        color = Color.objects.get(name="Magenta")
        # perform_update / perform_create still overwrite these with
        # request.user, which matches the audit story.
        self.assertEqual(color.created_by_id, self.user.pk)
        self.assertEqual(color.modified_by_id, self.user.pk)

    def test_create_shape_succeeds_when_user_fks_are_supplied(self):
        response = self.client.post(
            reverse("shape-list"),
            {
                "name": "Octagon",
                "code": "OCT",
                "created_by": self.user.pk,
                "modified_by": self.user.pk,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_anonymous_cannot_create_lookup(self):
        self.client.logout()
        response = self.client.post(reverse("color-list"), {"name": "Cyan"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
