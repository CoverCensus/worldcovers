"""
GET /api/v2/cover-markings/?cover=<id> -- who sees which links.

The public cover detail page (frontend/src/pages/CoverDetail.tsx) lists the
markings linked to a cover through this query. It used to return nothing to
signed-out visitors and only their own links to plain contributors, so the
"Associated Markings" panel was empty for the public. It now mirrors the
?marking=<id> branch of CoverMarkingViewSet.get_queryset:
  - anonymous: approved links only
  - responsible editor or superuser: every link, even on a removed cover
  - other signed-in users: approved links plus their own

Run from repo root/backend:
  uv run python manage.py test common.tests.test_cover_markings_by_cover
Expected exit code 0.
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import TestCase
from rest_framework.test import APIClient

from common.models import (
    Collection,
    CollectionAssignment,
    Color,
    Cover,
    CoverMarking,
    CoverRecycleBin,
    Marking,
    PostOffice,
    PostOfficeRegion,
    Region,
)

User = get_user_model()


class CoverMarkingsByCoverTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser("admin", password="pw")
        stamp = {"created_by": self.admin, "modified_by": self.admin}

        self.contributor = User.objects.create_user("contributor", password="pw")
        self.other = User.objects.create_user("other", password="pw")
        self.editor = User.objects.create_user("editor", password="pw")
        editors = Group.objects.create(name="Editors")
        editors.permissions.add(Permission.objects.get(codename="review_submission"))
        self.editor.groups.add(editors)

        region = Region.objects.create(name="Virginia", abbrev="VA", region_tier="STATE", **stamp)
        collection = Collection.objects.create(name="Virginia Collection", region=region, **stamp)
        CollectionAssignment.objects.create(user=self.editor, collection=collection, **stamp)
        color = Color.objects.create(name="Black", **stamp)
        post_office = PostOffice.objects.create(name="Richmond", **stamp)
        PostOfficeRegion.objects.create(post_office=post_office, region=region, **stamp)

        def marking(text):
            return Marking.objects.create(
                type="TOWNMARK", catalog_txt=text, inscription_txt=text, desc="",
                is_manuscript=True, color=color, post_office=post_office, **stamp,
            )

        self.cover = Cover.objects.create(type="FC", **stamp)
        self.approved = CoverMarking.objects.create(
            cover=self.cover, marking=marking("RICHMOND"),
            review_status=CoverMarking.REVIEW_APPROVED, **stamp,
        )
        self.pending_own = CoverMarking.objects.create(
            cover=self.cover, marking=marking("RICHMOND Va."),
            review_status=CoverMarking.REVIEW_PENDING,
            created_by=self.contributor, modified_by=self.contributor,
        )

    def _ids(self):
        response = self.client.get(f"/api/v2/cover-markings/?cover={self.cover.pk}")
        self.assertEqual(response.status_code, 200)
        return {row["id"] for row in response.data["results"]}

    def test_anonymous_sees_approved_links_only(self):
        self.assertEqual(self._ids(), {self.approved.pk})

    def test_unrelated_user_sees_approved_links_only(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self._ids(), {self.approved.pk})

    def test_contributor_also_sees_own_pending_link(self):
        self.client.force_authenticate(self.contributor)
        self.assertEqual(self._ids(), {self.approved.pk, self.pending_own.pk})

    def test_responsible_editor_sees_every_link(self):
        self.client.force_authenticate(self.editor)
        self.assertEqual(self._ids(), {self.approved.pk, self.pending_own.pk})

    def test_removed_cover_hidden_from_public_but_not_from_editor(self):
        CoverRecycleBin.objects.create(cover=self.cover, removed_by=self.admin)
        self.assertEqual(self._ids(), set())
        self.client.force_authenticate(self.editor)
        self.assertEqual(self._ids(), {self.approved.pk, self.pending_own.pk})

    def test_unknown_cover_id_returns_empty(self):
        response = self.client.get("/api/v2/cover-markings/?cover=999999")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_non_numeric_cover_id_is_rejected_by_filterset(self):
        # CoverMarkingFilter validates `cover` as a number and answers 400
        # before get_queryset's own int() guard is reached.
        response = self.client.get("/api/v2/cover-markings/?cover=abc")
        self.assertEqual(response.status_code, 400)
