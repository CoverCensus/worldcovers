"""Catalog pages must load display data only for their selected Markings."""
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.request import Request
from rest_framework.test import APIClient, APIRequestFactory

from common.api.v2.serializers import MarkingListSerializer
from common.api.v2.views import MarkingViewSet, _marking_list_queryset
from common.models import Image, Marking, MarkingRecycleBin, PostOffice, PostOfficeRegion, Region


class CatalogPageQueryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user("catalog-reader")
        stamps = {"created_by": cls.user, "modified_by": cls.user}
        cls.state = Region.objects.create(name="Virginia", abbrev="VA", region_tier="STATE", **stamps)
        cls.county = Region.objects.create(
            name="Accomack", abbrev="VA", region_tier="COUNTY", parent_region=cls.state, **stamps,
        )
        cls.markings = []
        for index in range(30):
            office = PostOffice.objects.create(name=f"Town {index:02d}", **stamps)
            # Include primary, County-only, and unlinked offices on one page.
            if index % 3 != 2:
                PostOfficeRegion.objects.create(post_office=office, region=cls.county, **stamps)
            if index % 3 == 0:
                PostOfficeRegion.objects.create(post_office=office, region=cls.state, **stamps)
            cls.markings.append(Marking.objects.create(
                code=f"QUERY-{index}", type="TOWNMARK", is_manuscript=False,
                post_office=office, **stamps,
            ))
        for order in (2, 0, 1):
            Image.objects.create(
                subject_type=Image.SUBJECT_MARKING, subject_id=cls.markings[0].pk,
                storage_filename=f"catalog-query-{order}.png", display_order=order, **stamps,
                image_width=100, image_height=100, file_size_bytes=100,
                image_view="FULL", uploaded_by=cls.user,
            )
        # A Cover with the same numeric ID must not supply a Marking image.
        Image.objects.create(
            subject_type=Image.SUBJECT_COVER, subject_id=cls.markings[1].pk,
            storage_filename="unrelated-cover.png", **stamps,
            image_width=100, image_height=100, file_size_bytes=100,
            image_view="FRONT", uploaded_by=cls.user,
        )

    def setUp(self):
        self.client = APIClient()

    def test_counts_do_not_load_records_and_exclude_removed_markings(self):
        MarkingRecycleBin.objects.create(marking=self.markings[-1], removed_by=self.user)
        for path, expected in (("markings", 29), ("post-offices", 30)):
            with self.subTest(path=path), self.assertNumQueries(1):
                response = self.client.get(f"/api/v2/{path}/count/")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data, {"count": expected})

    def test_query_count_stays_bounded_as_page_size_grows(self):
        for size in (1, 25):
            with self.subTest(size=size), CaptureQueriesContext(connection) as queries:
                response = self.client.get("/api/v2/markings/", {"page_size": size})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(response.data["results"]), size)
            self.assertLessEqual(len(queries), 6)
            # The first limited SELECT chooses IDs, not full display rows.
            page_query = next(q["sql"] for q in queries if "LIMIT" in q["sql"] and "COUNT(" not in q["sql"])
            self.assertNotIn("catalog_txt", page_query)
            self.assertNotIn("cross_listed_pre_statehood", page_query)

    def test_default_page_matches_previous_full_row_query(self):
        request = Request(APIRequestFactory().get("/api/v2/markings/"))
        expected = MarkingListSerializer(
            _marking_list_queryset().order_by(*MarkingViewSet.default_ordering)[:25],
            many=True, context={"request": request},
        ).data
        response = self.client.get("/api/v2/markings/", {"page_size": 25})
        self.assertEqual(response.data["results"], expected)
        by_id = {row["id"]: row for row in response.data["results"]}
        first = by_id[self.markings[0].pk]
        self.assertEqual(first["main_image"]["storage_filename"], "catalog-query-0.png")
        self.assertEqual(first["second_image"]["storage_filename"], "catalog-query-1.png")
        county_only = by_id[self.markings[1].pk]
        self.assertEqual(county_only["state"], "Virginia")
        self.assertEqual(county_only["state_abbrev"], "VA")
        self.assertIsNone(county_only["main_image"])

    def test_explicit_order_and_deferred_count_keep_page_boundaries(self):
        expected = [row.pk for row in reversed(self.markings)][10:20]
        for defer in (False, True):
            params = {"ordering": "-id", "page_size": 10, "page": 2}
            if defer:
                params["include_count"] = "false"
            response = self.client.get("/api/v2/markings/", params)
            self.assertEqual(response.status_code, 200)
            self.assertEqual([row["id"] for row in response.data["results"]], expected)
            self.assertEqual(response.data["count"], None if defer else 30)
            self.assertIn("page=3", response.data["next"])
            self.assertIsNotNone(response.data["previous"])

    def test_empty_and_last_pages_keep_existing_responses(self):
        empty = self.client.get("/api/v2/markings/", {"town": "Absent town"})
        self.assertEqual(empty.status_code, 200)
        self.assertEqual(empty.data["count"], 0)
        self.assertEqual(empty.data["results"], [])
        last = self.client.get("/api/v2/markings/", {"page_size": 25, "page": "last"})
        self.assertEqual(len(last.data["results"]), 5)
        self.assertIsNone(last.data["next"])
        invalid = self.client.get("/api/v2/markings/", {"page_size": 25, "page": 3})
        self.assertEqual(invalid.status_code, 404)

