"""Trello T70: approval links a submitted county to the town, add-only.

The Post Office is shared by every Marking at that town, so the rule is
conservative: a county is linked only when the town has none, a differing
county is left for the review comparison to surface, and a submission that
says nothing about the county (absent key or "") changes no links at all.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from common.contribution_apply import (
    ContributionApplyError, apply_contribution_to_catalog, describe_county_intent,
)
from common.models import (
    Collection, Contribution, Marking, PostOffice, PostOfficeRegion, Region,
)


class CountyFixture(TestCase):
    """Virginia with two counties, Maryland with one; Lynchburg (VA + Campbell), Richmond (VA only)."""

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


class CountyLinkOnApprovalTests(CountyFixture):
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
        with self.assertRaisesMessage(ContributionApplyError, "not a Region id"):
            self.apply(**self.payload("Onancock", county_id="abc"))

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

    def test_a_county_name_that_disagrees_with_the_id_is_refused(self):
        with self.assertRaisesMessage(ContributionApplyError, "does not match"):
            self.apply(**self.payload("Onancock", county_id=self.accomack.pk, county="Campbell"))
        # The approval view's transaction rolls the town back; here, no county link was written.
        self.assertFalse(PostOfficeRegion.objects.filter(region=self.accomack).exists())


class DescribeCountyIntentTests(CountyFixture):
    """The review verdict runs the same validation approval does, read-only."""

    def intent(self, town, **extra):
        return describe_county_intent(self.payload(town, **extra))

    def test_no_county_keys_means_no_verdict(self):
        self.assertIsNone(self.intent("Onancock"))
        self.assertIsNone(self.intent("Onancock", county_id="", county="", county_proposed=""))

    def test_new_town_will_link(self):
        verdict = self.intent("Onancock", county_id=str(self.accomack.pk), county="")
        self.assertEqual(
            {k: verdict[k] for k in ("county_name", "valid", "town_found", "current_county", "will_link", "note")},
            {"county_name": "Accomack", "valid": True, "town_found": False, "current_county": None,
             "will_link": True, "note": "Approval links the town to this county"},
        )
        self.assertFalse(PostOffice.objects.filter(name="Onancock").exists())

    def test_existing_county_is_reported_and_left_alone(self):
        verdict = self.intent("Lynchburg", county_id=self.accomack.pk, county="Accomack")
        self.assertEqual((verdict["town_found"], verdict["current_county"], verdict["will_link"]),
                         (True, "Campbell", False))
        self.assertEqual(verdict["note"], "Differs from the catalog's Campbell; approval leaves the county link unchanged")
        same = self.intent("Lynchburg", county_id=self.campbell.pk)
        self.assertEqual((same["will_link"], same["note"]), (False, "The town is already linked to this county"))

    def test_wrong_state_and_name_mismatch_are_errors(self):
        wrong = self.intent("Onancock", county_id=self.montgomery.pk)
        self.assertFalse(wrong["valid"])
        self.assertIn("not in 'Virginia'", wrong["error"])
        mismatch = self.intent("Onancock", county_id=self.accomack.pk, county="Campbell")
        self.assertFalse(mismatch["valid"])
        self.assertIn("does not match", mismatch["note"])

    def test_typed_county_only(self):
        verdict = self.intent("Onancock", county_proposed="Nansemond")
        self.assertEqual((verdict["county_id"], verdict["valid"], verdict["county_proposed"], verdict["note"]),
                         (None, False, "Nansemond", "Approval does not link a typed county"))
