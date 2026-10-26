from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from common.api.v2.permissions import (
    _user_is_responsible_for_cover,
    _user_is_responsible_for_marking,
)
from common.contribution_apply import _resolve_post_office
from common.models import (
    Collection, CollectionAssignment, Cover, CoverMarking, Marking,
    PostOffice, PostOfficeRegion, Region,
)


class CountyPermissionInheritanceTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser("admin")
        self.editor = get_user_model().objects.create_user("editor")
        self.other_editor = get_user_model().objects.create_user("other")
        self.audit = {"created_by": self.admin, "modified_by": self.admin}
        self.state = self.region("Virginia", "STATE")
        self.other_state = self.region("Maryland", "STATE")
        self.county = self.region("Accomack", "COUNTY", self.state)
        for user, state in ((self.editor, self.state), (self.other_editor, self.other_state)):
            collection = Collection.objects.create(name=state.name, region=state, **self.audit)
            CollectionAssignment.objects.create(user=user, collection=collection, **self.audit)
        self.office = PostOffice.objects.create(name="Accomack C.H.", **self.audit)
        PostOfficeRegion.objects.create(post_office=self.office, region=self.county, **self.audit)
        self.marking = Marking.objects.create(
            post_office=self.office, type="TOWNMARK", inscription_txt="ACCOMACK",
            is_manuscript=True, **self.audit,
        )
        self.client = APIClient()

    def region(self, name, tier, parent=None):
        return Region.objects.create(
            name=name, abbrev="", region_tier=tier, parent_region=parent, **self.audit,
        )

    def cover(self, *markings):
        cover = Cover.objects.create(type="FC", **self.audit)
        for marking in markings:
            CoverMarking.objects.create(cover=cover, marking=marking, **self.audit)
        return cover

    def test_county_only_office_inherits_primary_parent(self):
        for tier in ("STATE", "TERRITORY", "DISTRICT"):
            with self.subTest(tier=tier):
                self.state.region_tier = tier
                self.state.save()
                self.assertEqual(self.office.region, self.state)
                self.assertTrue(_user_is_responsible_for_marking(self.editor, self.marking))
                self.assertFalse(_user_is_responsible_for_marking(self.other_editor, self.marking))
        self.assertEqual(self.office.post_office_regions.count(), 1)
        self.assertFalse(Collection.objects.filter(region=self.county).exists())

    def test_direct_state_link_keeps_precedence(self):
        PostOfficeRegion.objects.create(
            post_office=self.office, region=self.other_state, **self.audit,
        )
        self.assertEqual(self.office.region, self.other_state)
        self.assertFalse(_user_is_responsible_for_marking(self.editor, self.marking))
        self.assertTrue(_user_is_responsible_for_marking(self.other_editor, self.marking))

    def test_missing_or_non_primary_parent_grants_no_permission(self):
        country = self.region("United States", "COUNTRY")
        for parent in (None, country, self.county):
            with self.subTest(parent=parent.pk if parent else None):
                self.county.parent_region = parent
                self.county.save()
                self.assertIsNone(self.office.region)
                self.assertFalse(_user_is_responsible_for_marking(self.editor, self.marking))

    def test_cover_requires_responsibility_for_every_marking(self):
        owned = self.cover(self.marking)
        self.assertTrue(_user_is_responsible_for_cover(self.editor, owned))
        self.assertFalse(_user_is_responsible_for_cover(self.other_editor, owned))
        unknown_office = PostOffice.objects.create(name="Unknown", **self.audit)
        unknown = Marking.objects.create(
            post_office=unknown_office, type="TOWNMARK", is_manuscript=True, **self.audit,
        )
        mixed = self.cover(self.marking, unknown)
        self.assertFalse(_user_is_responsible_for_cover(self.editor, mixed))

    def test_assigned_list_and_remove_use_inherited_scope(self):
        self.client.force_authenticate(self.editor)
        response = self.client.get("/api/v2/markings/my-assigned/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([row["id"] for row in response.data["results"]], [self.marking.pk])
        self.client.force_authenticate(self.other_editor)
        response = self.client.post(
            f"/api/v2/markings/{self.marking.pk}/remove/", {"reason": "Test"}, format="json",
        )
        self.assertEqual(response.status_code, 403, response.data)
        self.client.force_authenticate(self.editor)
        response = self.client.post(
            f"/api/v2/markings/{self.marking.pk}/remove/", {"reason": "Test"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)

    def test_approval_reuses_county_only_office_without_adding_state_link(self):
        for town in ("Accomack C.H.", "Accomack C. H."):
            with self.subTest(town=town):
                office = _resolve_post_office("Virginia", town, self.admin)
                self.assertEqual(office.pk, self.office.pk)
                self.assertEqual(PostOffice.objects.count(), 1)
                self.assertEqual(
                    list(office.post_office_regions.values_list("region_id", flat=True)),
                    [self.county.pk],
                )
