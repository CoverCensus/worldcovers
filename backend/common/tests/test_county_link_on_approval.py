"""Trello T70: approval links a submitted county to the town, add-only.

The Post Office is shared by every Marking at that town, so the rule is
conservative: a county is linked only when the town has none, a differing
county is left for the review comparison to surface, and a submission that
says nothing about the county (absent key or "") changes no links at all.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from common.contribution_apply import ContributionApplyError, apply_contribution_to_catalog
from common.models import (
    Collection, Contribution, Marking, PostOffice, PostOfficeRegion, Region,
)


class CountyLinkOnApprovalTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user("editor")
        audit = {"created_by": cls.user, "modified_by": cls.user}
        cls.audit = audit
        cls.va = Region.objects.create(name="Virginia", abbrev="VA", region_tier="STATE", **audit)
        cls.md = Region.objects.create(name="Maryland", abbrev="MD", region_tier="STATE", **audit)
        cls.accomack = Region.objects.create(
            name="Accomack", abbrev="VA", region_tier="COUNTY", parent_region=cls.va, **audit)
        cls.campbell = Region.objects.create(
            name="Campbell", abbrev="VA", region_tier="COUNTY", parent_region=cls.va, **audit)
        cls.montgomery = Region.objects.create(
            name="Montgomery", abbrev="MD", region_tier="COUNTY", parent_region=cls.md, **audit)
        cls.collection = Collection.objects.create(name="Virginia", region=cls.va, **audit)
        cls.lynchburg = PostOffice.objects.create(name="Lynchburg", **audit)
        for region in (cls.va, cls.campbell):
            PostOfficeRegion.objects.create(post_office=cls.lynchburg, region=region, **audit)
        cls.richmond = PostOffice.objects.create(name="Richmond", **audit)
        PostOfficeRegion.objects.create(post_office=cls.richmond, region=cls.va, **audit)

    def links(self, office):
        return set(office.post_office_regions.values_list("region_id", flat=True))

    def payload(self, town, **extra):
        data = {
            "type": "TOWNMARK", "state": "Virginia", "town": town,
            "inscription_txt": town.upper(), "is_manuscript": "true", "no_marking_image": "true",
        }
        data.update(extra)
        return data

    def apply(self, **payload):
        contrib = Contribution.objects.create(
            contributor=self.user, collection=self.collection, submitted_data=payload,
            status=Contribution.STATUS_PENDING, **self.audit,
        )
        return apply_contribution_to_catalog(contrib)

    def test_new_town_gets_the_state_and_the_county(self):
        marking = self.apply(**self.payload("Onancock", county_id=str(self.accomack.pk)))
        self.assertEqual(self.links(marking.post_office), {self.va.pk, self.accomack.pk})
        # The county link must not displace the state as the town's primary region.
        self.assertEqual(marking.post_office.region, self.va)

    def test_a_town_that_already_has_a_county_keeps_it(self):
        self.apply(**self.payload("Lynchburg", county_id=self.accomack.pk))
        self.assertEqual(self.links(self.lynchburg), {self.va.pk, self.campbell.pk})

    def test_a_county_from_another_state_is_refused(self):
        with self.assertRaisesMessage(ContributionApplyError, "not in 'Virginia'"):
            self.apply(**self.payload("Onancock", county_id=self.montgomery.pk))

    def test_a_non_county_region_is_refused(self):
        with self.assertRaisesMessage(ContributionApplyError, "not a County region"):
            self.apply(**self.payload("Onancock", county_id=self.va.pk))

    def test_an_edit_that_says_nothing_about_the_county_changes_no_links(self):
        marking = Marking.objects.create(
            post_office=self.richmond, type="TOWNMARK", inscription_txt="RICHMOND",
            is_manuscript=True, **self.audit,
        )
        for county_value in ({}, {"county_id": ""}):
            with self.subTest(county=county_value):
                self.apply(**self.payload("Richmond", edit_marking_id=marking.pk, **county_value))
                self.assertEqual(self.links(self.richmond), {self.va.pk})

    def test_an_edit_adds_a_county_to_a_state_only_town(self):
        marking = Marking.objects.create(
            post_office=self.richmond, type="TOWNMARK", inscription_txt="RICHMOND",
            is_manuscript=True, **self.audit,
        )
        self.apply(**self.payload("Richmond", edit_marking_id=marking.pk, county_id=self.accomack.pk))
        self.assertEqual(self.links(self.richmond), {self.va.pk, self.accomack.pk})
