"""T39: a pending edit's review payload carries its target's current values."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from common.models import (
    Citation, Collection, Color, Contribution, Cover, CoverMarking, DateSeen, Marking,
    PostOffice, PostOfficeRegion, ReferenceWork, Region, Shape,
)


class EditBaselineTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.contributor = get_user_model().objects.create_user("contributor")
        self.editor = get_user_model().objects.create_superuser("editor")
        audit = {"created_by": self.editor, "modified_by": self.editor}
        region = Region.objects.create(name="Virginia", abbrev="VA", region_tier="STATE", **audit)
        self.collection = Collection.objects.create(name="Virginia", region=region, **audit)
        office = PostOffice.objects.create(name="Richmond", **audit)
        PostOfficeRegion.objects.create(post_office=office, region=region, **audit)
        self.marking = Marking.objects.create(
            type="TOWNMARK", inscription_txt="RICHMOND VA", is_manuscript=False,
            shape=Shape.objects.create(name="Circle", **audit),
            color=Color.objects.create(name="Black", **audit),
            width=Decimal("28.00"), desc="Double circle", post_office=office, **audit,
        )
        self.reference = ReferenceWork.objects.create(
            code="ASCC1", title="ASCC", authorship="A", publisher="P", publication_year=1900, **audit
        )
        Citation.objects.create(
            subject_type="MARKING", subject_id=self.marking.pk, reference_work=self.reference,
            citation_detail="p. 12 - https://example.com/12", **audit,
        )
        self.cover = Cover.objects.create(
            type="FC", is_institutional=True, description="Folded letter", **audit
        )
        self.link = CoverMarking.objects.create(
            cover=self.cover, marking=self.marking, is_backstamp=True, **audit
        )
        DateSeen.objects.create(
            subject_type=DateSeen.SUBJECT_COVER, subject_id=self.cover.pk,
            date_year=1851, date_month=3, granularity="MONTH", **audit,
        )

    def baseline(self, submitted_data, status=Contribution.STATUS_PENDING, viewer=None):
        contribution = Contribution.objects.create(
            contributor=self.contributor, collection=self.collection,
            submitted_data=submitted_data, status=status,
            created_by=self.contributor, modified_by=self.contributor,
        )
        self.client.force_authenticate(viewer or self.editor)
        response = self.client.get(f"/api/v2/contributions/{contribution.pk}/")
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["edit_baseline"]

    def test_marking_edit_baseline_matches_what_the_edit_form_prefills(self):
        # Form edits post the target id as a string.
        baseline = self.baseline({"edit_marking_id": str(self.marking.pk), "state": "VA"})

        self.assertEqual(
            {key: baseline[key] for key in (
                "town", "type", "inscription_txt", "is_manuscript", "shape", "color",
                "width_mm", "height_mm", "desc", "marking_erd", "marking_erd_granularity",
                "reference_work_ids", "reference_work_details",
            )},
            {
                "town": "Richmond", "type": "TOWNMARK", "inscription_txt": "RICHMOND VA",
                "is_manuscript": False, "shape": "Circle", "color": "Black",
                "width_mm": "28.00", "height_mm": "", "desc": "Double circle",
                # The derived range the form prefills: here, the linked cover's date.
                "marking_erd": "1851-03-01", "marking_erd_granularity": "MONTH",
                "reference_work_ids": [self.reference.pk],
                "reference_work_details": [{
                    "reference_work_id": self.reference.pk, "page_number": "12",
                    "url": "https://example.com/12",
                }],
            },
        )
        self.assertEqual(baseline["marking_lrd"], "1851-03-01")
        self.assertEqual((baseline["state"], baseline["state_abbrev"]), ("Virginia", "VA"))

    def test_marking_edit_baseline_carries_the_towns_county(self):
        # Trello T70: no county link -> empty; a county link -> name and id.
        baseline = self.baseline({"edit_marking_id": str(self.marking.pk)})
        self.assertEqual((baseline["county"], baseline["county_id"]), ("", None))

        audit = {"created_by": self.editor, "modified_by": self.editor}
        state = Region.objects.get(name="Virginia")
        county = Region.objects.create(
            name="Henrico", abbrev="VA", region_tier="COUNTY", parent_region=state, **audit)
        PostOfficeRegion.objects.create(
            post_office=self.marking.post_office, region=county, **audit)
        baseline = self.baseline({"edit_marking_id": str(self.marking.pk)})
        self.assertEqual((baseline["county"], baseline["county_id"]), ("Henrico", county.pk))
        # The county link does not change the town's state.
        self.assertEqual(baseline["state"], "Virginia")

    def test_cover_edit_baseline_reads_the_cover_and_its_link(self):
        baseline = self.baseline({
            "submission_kind": "cover", "edit_cover_id": str(self.cover.pk),
            "edit_cover_marking_id": str(self.link.pk), "parent_marking_id": self.marking.pk,
        })

        self.assertEqual(baseline["type"], "FC")
        self.assertIs(baseline["is_institutional"], True)
        self.assertIs(baseline["is_backstamp"], True)
        self.assertEqual(baseline["description"], "Folded letter")
        self.assertEqual((baseline["cover_date_year"], baseline["cover_date_month"]), ("1851", "3"))
        self.assertNotIn("cover_date_day", baseline)
        self.assertEqual(baseline["reference_work_ids"], [])

    def test_no_baseline_outside_a_reviewer_looking_at_a_pending_edit(self):
        edit = {"edit_marking_id": self.marking.pk, "state": "VA"}
        cases = {
            "new submission": ({"state": "VA", "town": "Richmond"}, Contribution.STATUS_PENDING, None),
            "approved edit": (edit, Contribution.STATUS_APPROVED, None),
            "contributor viewing": (edit, Contribution.STATUS_PENDING, self.contributor),
            "deleted target": ({"edit_marking_id": 999999}, Contribution.STATUS_PENDING, None),
        }
        for name, (data, status, viewer) in cases.items():
            with self.subTest(name):
                self.assertIsNone(self.baseline(data, status=status, viewer=viewer))
