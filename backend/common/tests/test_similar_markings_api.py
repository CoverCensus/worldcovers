"""The submission-time "similar Entries" lookup (Trello T48).

Pins what the panel promises: a MATCH is T47's full key across the #129 town
spelling split, RELATED is the same town and inscription with different device
details, other states / types / recycle-binned rows never appear, the edited
Entry is excluded, incomplete input is an empty 200 rather than an error, and
the payload carries no catalog code and no user identity.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from common.models import (
    Color,
    Image,
    Marking,
    MarkingRecycleBin,
    PostOffice,
    PostOfficeRegion,
    Region,
    Shape,
)
from common.tests.test_marking_public_user_fields import FORBIDDEN_KEYS, _collect

URL = "/api/v2/markings/similar/"


class SimilarMarkingsApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("census", password="x")
        self.client = APIClient()
        self.va = self._region("USA-VA1", "Virginia", "VA", "STATE")
        self.accomack = self._region(
            "USA-VA1-C1", "Accomack County", "VA", "COUNTY", parent=self.va)
        # Dated so the primary-region tie-break (defunct desc, then established
        # desc) prefers WV over an undated VA link on a town that carries both.
        self.wv = self._region("USA-WV1", "West Virginia", "WV", "STATE",
                               established=date(1863, 6, 20))

        self.office = self._office("USA-VA1-1", "Accomack C.H.", self.va, self.accomack)
        self.variant = self._office("USA-VA1-2", "ACCOMACK CH", self.va)
        self.martinsburg = self._office("USA-WV1-1", "Martinsburg", self.wv)

        self.blue_black = self._color("BLUE BLACK", "#102B59")
        self.black_blue = self._color("BLACK-BLUE", "#102B59")
        self.red = self._color("RED", "#FF0000")
        self.circle = Shape.objects.create(
            name="C - Circle", created_by=self.user, modified_by=self.user)

    # ------------------------------------------------------------ factories

    def _region(self, code, name, abbrev, tier, parent=None, established=None):
        return Region.objects.create(
            code=code, name=name, abbrev=abbrev, region_tier=tier,
            parent_region=parent, established_date=established,
            created_by=self.user, modified_by=self.user)

    def _office(self, code, name, *regions):
        office = PostOffice.objects.create(
            code=code, name=name, created_by=self.user, modified_by=self.user)
        for region in regions:
            PostOfficeRegion.objects.create(
                post_office=office, region=region,
                created_by=self.user, modified_by=self.user)
        return office

    def _color(self, name, hex_val):
        return Color.objects.create(
            name=name, hex_val=hex_val, created_by=self.user, modified_by=self.user)

    def _marking(self, office, inscription, *, color=None, shape=None,
                 width=None, height=None, type="TOWNMARK", is_manuscript=False):
        return Marking.objects.create(
            type=type, inscription_txt=inscription, color=color,
            shape=None if is_manuscript else shape, width=width, height=height,
            is_manuscript=is_manuscript, is_irreg=None if is_manuscript else False,
            post_office=office, created_by=self.user, modified_by=self.user)

    def _get(self, **params):
        base = {"state": "VA", "town": "Accomack C. H.", "type": "TOWNMARK",
                "inscription": "Accomack C.H."}
        base.update(params)
        response = self.client.get(URL, base)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    @staticmethod
    def _tiers(payload):
        return {row["id"]: row["tier"] for row in payload["results"]}

    # ---------------------------------------------------------------- tests

    def test_match_across_spelling_split_and_related_on_detail_differences(self):
        twin = self._marking(self.variant, "ACCOMACK  C H", color=self.black_blue,
                             shape=self.circle, width=Decimal("20.40"))
        red = self._marking(self.office, "ACCOMACK C.H.", color=self.red,
                            shape=self.circle, width=Decimal("20.00"))
        far = self._marking(self.office, "ACCOMACK C.H.", color=self.blue_black,
                            shape=self.circle, width=Decimal("21.50"))
        manuscript = self._marking(self.office, "ACCOMACK C.H.", color=self.blue_black,
                                   is_manuscript=True)
        self._marking(self.office, "ACCOMACK C.H.", color=self.blue_black,
                      shape=self.circle, type="RATEMARK")

        payload = self._get(color="blue black", shape=self.circle.pk, width="20",
                            is_manuscript="false")

        self.assertEqual(self._tiers(payload), {
            twin.pk: "match", red.pk: "related", far.pk: "related",
            manuscript.pk: "related",
        })
        self.assertEqual(payload["match_count"], 1)
        self.assertEqual(payload["related_count"], 3)
        self.assertEqual([r["id"] for r in payload["results"]][0], twin.pk)
        first = payload["results"][0]
        self.assertNotIn("code", first)
        self.assertEqual(first["town"], "ACCOMACK CH")
        self.assertEqual(first["state_abbrev"], "VA")
        self.assertEqual(first["color_hex"], "#102B59")
        keys, values = _collect(payload)
        self.assertFalse(keys & FORBIDDEN_KEYS, keys & FORBIDDEN_KEYS)
        self.assertNotIn(self.user.email, values)

    def test_other_state_binned_history_only_and_excluded_rows_never_appear(self):
        keep = self._marking(self.office, "ACCOMACK C.H.")
        binned = self._marking(self.office, "ACCOMACK C.H.")
        MarkingRecycleBin.objects.create(marking=binned, removed_by=self.user)
        self._marking(self.martinsburg, "ACCOMACK C.H.")
        # A town whose PRIMARY region is WV but which also carries a VA link.
        moved = self._office("USA-WV1-2", "Accomack CH", self.wv, self.va)
        self._marking(moved, "ACCOMACK C.H.")

        payload = self._get()
        self.assertEqual(set(self._tiers(payload)), {keep.pk})

        payload = self._get(exclude=keep.pk)
        self.assertEqual(payload["results"], [])
        self.assertEqual(payload["match_count"], 0)

    def test_incomplete_or_unknown_input_is_an_empty_200(self):
        self._marking(self.office, "ACCOMACK C.H.")
        empty = {"results": [], "match_count": 0, "related_count": 0}
        self.assertEqual(self._get(inscription=""), empty)
        self.assertEqual(self._get(state="Narnia"), empty)
        self.assertEqual(self._get(type="POSTMARK"), empty)
        self.assertEqual(self._get(town="..."), empty)
        with self.assertNumQueries(0):
            self.client.get(URL, {"state": "VA", "town": "Accomack", "type": "TOWNMARK"})
        # A malformed optional is unknown, not an error: still a MATCH.
        payload = self._get(width="twenty")
        self.assertEqual(set(self._tiers(payload).values()), {"match"})

    def test_query_budget_images_and_cap(self):
        with_image = self._marking(self.office, "ACCOMACK C.H.")
        for order, name in ((1, "second.png"), (0, "first.png")):
            Image.objects.create(
                subject_type=Image.SUBJECT_MARKING, subject_id=with_image.pk,
                original_filename=name, storage_filename=f"va/{name}",
                file_checksum="x", mime_type="image/png", image_width=8,
                image_height=6, file_size_bytes=10, image_view="FULL",
                display_order=order, uploaded_by=self.user,
                created_by=self.user, modified_by=self.user)
        for _ in range(11):
            self._marking(self.office, "ACCOMACK C.H.")

        # state term (name miss, then abbrev) + offices + markings + images
        with self.assertNumQueries(5):
            response = self.client.get(URL, {
                "state": "VA", "town": "Accomack C.H.", "type": "TOWNMARK",
                "inscription": "ACCOMACK C.H."})
        payload = response.json()
        self.assertEqual(len(payload["results"]), 10)
        self.assertEqual(payload["match_count"], 12)
        by_id = {row["id"]: row for row in payload["results"]}
        self.assertTrue(by_id[with_image.pk]["main_image_url"].endswith("/va/first.png"))
        others = [row["main_image_url"] for row in payload["results"] if row["id"] != with_image.pk]
        self.assertEqual(set(others), {None})
