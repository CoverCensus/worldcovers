"""
Tests for `common.filters.MarkingListFilter` -- the filter set wired into
`MarkingViewSet.list`. Each filter is exercised against a small fixture
so the assertions can rely on exact-set equality.
"""
from __future__ import annotations

from datetime import date

from django.http import QueryDict
from django.test import TestCase

from common.filters import MarkingListFilter
from common.models import Marking, MarkingType
from common.tests.factories import (
    make_color,
    make_cover,
    make_cover_date_seen,
    make_cover_marking,
    make_image_for_marking,
    make_lettering,
    make_marking,
    make_post_office,
    make_region,
    make_shape,
    make_user,
)


def _filter(qs, params):
    return MarkingListFilter(QueryDict(params), queryset=qs).qs


class MarkingListFilterTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = make_user("filters_user")
        cls.va = make_region(name="Virginia", abbrev="VA", creator=cls.user)
        cls.oh = make_region(name="Ohio", abbrev="OH", creator=cls.user)
        cls.richmond = make_post_office(name="Richmond", region=cls.va, creator=cls.user)
        cls.columbus = make_post_office(name="Columbus", region=cls.oh, creator=cls.user)
        cls.red = make_color(name="Red", creator=cls.user)
        cls.blue = make_color(name="Blue", creator=cls.user)
        cls.circle = make_shape(name="Circle", code="C", creator=cls.user)
        cls.serif = make_lettering(name="Serif", creator=cls.user)

        cls.tm_va = make_marking(
            type=MarkingType.TOWNMARK,
            code="VA-1",
            post_office=cls.richmond,
            color=cls.red,
            shape=cls.circle,
            lettering=cls.serif,
            creator=cls.user,
        )
        cls.rm_va = make_marking(
            type=MarkingType.RATEMARK,
            code="VA-R-1",
            post_office=cls.richmond,
            color=cls.blue,
            shape=cls.circle,
            lettering=cls.serif,
            creator=cls.user,
        )
        cls.tm_oh = make_marking(
            type=MarkingType.TOWNMARK,
            code="OH-1",
            post_office=cls.columbus,
            color=cls.red,
            shape=cls.circle,
            lettering=cls.serif,
            creator=cls.user,
        )
        cls.tm_ms = make_marking(
            type=MarkingType.AUXMARK,
            code="VA-MS-1",
            post_office=cls.richmond,
            color=cls.red,
            is_manuscript=True,
            creator=cls.user,
        )

        # DateSeen rows (polymorphic) so earliest/latest year filters have
        # something to aggregate; cover-side dates are attached with
        # subject_type='COVER' and reach the marking through cover_markings.
        cover = make_cover(creator=cls.user)
        make_cover_marking(cover, cls.tm_va, creator=cls.user)
        make_cover_date_seen(cover, date(1855, 5, 1), creator=cls.user)
        make_cover_date_seen(cover, date(1875, 7, 4), creator=cls.user)

        make_image_for_marking(cls.tm_va, uploader=cls.user)

    def _qs(self):
        return Marking.objects.all()

    def test_type_filter_matches_exact_type(self):
        qs = _filter(self._qs(), "type=TOWNMARK")
        codes = sorted(qs.values_list("code", flat=True))
        self.assertEqual(codes, ["OH-1", "VA-1"])

    def test_state_filter_matches_name_or_abbrev(self):
        by_name = sorted(_filter(self._qs(), "state=Virginia").values_list("code", flat=True))
        by_abbrev = sorted(_filter(self._qs(), "state=VA").values_list("code", flat=True))
        self.assertEqual(by_name, by_abbrev)
        self.assertEqual(by_name, ["VA-1", "VA-MS-1", "VA-R-1"])

    def test_town_filter_uses_icontains(self):
        qs = _filter(self._qs(), "town=rich")
        codes = sorted(qs.values_list("code", flat=True))
        self.assertEqual(codes, ["VA-1", "VA-MS-1", "VA-R-1"])

    def test_color_filter_is_case_insensitive(self):
        qs = _filter(self._qs(), "color=red")
        codes = sorted(qs.values_list("code", flat=True))
        self.assertEqual(codes, ["OH-1", "VA-1", "VA-MS-1"])

    def test_shape_filter_by_id(self):
        qs = _filter(self._qs(), f"shape={self.circle.pk}")
        # Manuscript markings have no shape, so they should be excluded.
        codes = sorted(qs.values_list("code", flat=True))
        self.assertEqual(codes, ["OH-1", "VA-1", "VA-R-1"])

    def test_is_manuscript_true(self):
        codes = sorted(_filter(self._qs(), "is_manuscript=true").values_list("code", flat=True))
        self.assertEqual(codes, ["VA-MS-1"])

    def test_is_manuscript_false(self):
        codes = sorted(_filter(self._qs(), "is_manuscript=false").values_list("code", flat=True))
        self.assertEqual(codes, ["OH-1", "VA-1", "VA-R-1"])

    def test_is_manuscript_ignored_for_other_values(self):
        # Any value other than 'true' / 'false' is treated as no-filter.
        codes = sorted(_filter(self._qs(), "is_manuscript=meow").values_list("code", flat=True))
        self.assertEqual(codes, ["OH-1", "VA-1", "VA-MS-1", "VA-R-1"])

    def test_has_images_only_returns_markings_with_images(self):
        codes = sorted(_filter(self._qs(), "has_images=true").values_list("code", flat=True))
        self.assertEqual(codes, ["VA-1"])

    def test_earliest_use_year_min_filter(self):
        codes = sorted(
            _filter(self._qs(), "earliest_use_year_min=1860").values_list("code", flat=True)
        )
        # tm_va has earliest_seen=1855, so the >=1860 filter excludes it.
        self.assertNotIn("VA-1", codes)

    def test_latest_use_year_max_filter(self):
        codes = sorted(
            _filter(self._qs(), "latest_use_year_max=1870").values_list("code", flat=True)
        )
        # tm_va has latest_seen=1875, so the <=1870 filter excludes it.
        self.assertNotIn("VA-1", codes)
