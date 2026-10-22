"""Editors add and edit Reference Works through the API (Trello S19)."""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import TestCase
from rest_framework.test import APIClient

from common.models import Citation, Collection, CollectionAssignment, ReferenceWork, Region

User = get_user_model()


class ReferenceWorkApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="pw",
        )
        self.stamp = {"created_by": self.admin, "modified_by": self.admin}
        self.contributor = User.objects.create_user(username="contributor", password="pw")
        # Legacy group-based Editor: Editors group with the review permission only.
        self.group_editor = User.objects.create_user(username="group-editor", password="pw")
        editors = Group.objects.create(name="Editors")
        editors.permissions.add(Permission.objects.get(codename="review_contribution"))
        self.group_editor.groups.add(editors)
        # Scoped Editor: a CollectionAssignment and nothing else.
        self.scoped_editor = User.objects.create_user(username="scoped-editor", password="pw")
        region = Region.objects.create(name="Virginia", abbrev="VA", region_tier="STATE", **self.stamp)
        collection = Collection.objects.create(name="Virginia Collection", region=region, **self.stamp)
        CollectionAssignment.objects.create(user=self.scoped_editor, collection=collection, **self.stamp)

        self.ascc = ReferenceWork.objects.create(
            code="ASCC6", title="American Stampless Cover Catalog",
            authorship="David G. Phillips", publisher="David G. Phillips Publishing",
            publication_year=1997, edition="6", **self.stamp,
        )
        self.payload = {
            "code": "FPHC2",
            "title": "Florida Postal History 1763-1861",
            "authorship": "Deane R. Briggs; Francis Ferguson; Thomas M. Lera",
            "publisher": "Florida Postal History Society",
            "publication_year": 2021,
            "edition": "2",
        }

    def test_anonymous_cannot_read_or_write(self):
        self.assertIn(self.client.get("/api/v2/reference-works/").status_code, (401, 403))
        self.assertIn(
            self.client.post("/api/v2/reference-works/", self.payload, format="json").status_code,
            (401, 403),
        )

    def test_contributor_can_read_but_not_write(self):
        self.client.force_authenticate(self.contributor)
        self.assertEqual(self.client.get("/api/v2/reference-works/").status_code, 200)
        self.assertEqual(
            self.client.post("/api/v2/reference-works/", self.payload, format="json").status_code, 403,
        )
        self.assertEqual(
            self.client.patch(
                f"/api/v2/reference-works/{self.ascc.pk}/", {"title": "x"}, format="json",
            ).status_code,
            403,
        )
        self.assertEqual(ReferenceWork.objects.count(), 1)

    def test_group_editor_can_add_and_edit_but_not_delete(self):
        self.client.force_authenticate(self.group_editor)
        response = self.client.post("/api/v2/reference-works/", self.payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        work = ReferenceWork.objects.get(code="FPHC2")
        self.assertEqual(work.created_by, self.group_editor)

        response = self.client.patch(
            f"/api/v2/reference-works/{work.pk}/", {"volume": " 1 "}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        work.refresh_from_db()
        self.assertEqual(work.volume, "1")
        self.assertEqual(work.modified_by, self.group_editor)

        self.assertEqual(self.client.delete(f"/api/v2/reference-works/{work.pk}/").status_code, 403)
        self.assertTrue(ReferenceWork.objects.filter(pk=work.pk).exists())

    def test_scoped_editor_can_add(self):
        self.client.force_authenticate(self.scoped_editor)
        response = self.client.post("/api/v2/reference-works/", self.payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)

    def test_duplicate_title_and_edition_is_refused(self):
        self.client.force_authenticate(self.group_editor)
        duplicate = dict(
            self.payload, code=None, title="american stampless cover catalog", edition=" 6 ",
        )
        response = self.client.post("/api/v2/reference-works/", duplicate, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("title", response.data)
        self.assertIn("ASCC6", str(response.data["title"]))

        other_edition = dict(duplicate, edition="7")
        response = self.client.post("/api/v2/reference-works/", other_edition, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(ReferenceWork.objects.count(), 2)

    def test_blank_code_is_null_and_year_is_bounded(self):
        self.client.force_authenticate(self.group_editor)
        response = self.client.post(
            "/api/v2/reference-works/", dict(self.payload, code="   "), format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(ReferenceWork.objects.get(title=self.payload["title"]).code)

        response = self.client.post(
            "/api/v2/reference-works/",
            dict(self.payload, title="Another", publication_year=999),
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("publication_year", response.data)

    def test_code_cannot_change_once_cited(self):
        Citation.objects.create(
            reference_work=self.ascc, subject_type="MARKING", subject_id=1,
            citation_detail="p. 1", **self.stamp,
        )
        self.client.force_authenticate(self.group_editor)
        response = self.client.patch(
            f"/api/v2/reference-works/{self.ascc.pk}/", {"code": "ASCC7"}, format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("code", response.data)

        response = self.client.patch(
            f"/api/v2/reference-works/{self.ascc.pk}/", {"title": "American Stampless Cover Catalogue"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.ascc.refresh_from_db()
        self.assertEqual(self.ascc.code, "ASCC6")
