"""
Trello T92: a cover draft created from a Marking edit is listed to its author
only. The record page lists the signed-in user's own cover drafts under
Associated Covers, so this pins the lenses the page relies on: the author's
default list carries the draft, another contributor's does not, and the editor
queue (?mode=editor) excludes drafts outright. The detail route is documented
as it is: another contributor gets 404, while an Editor assigned to the
Collection (and an Administrator) can still open the draft by id, which
predates this change and is not what the record page exposes.
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import TestCase
from rest_framework.test import APIClient

from common.models import (
    Collection,
    CollectionAssignment,
    Contribution,
    Marking,
    PostOffice,
    PostOfficeRegion,
    Region,
)


User = get_user_model()


class CoverDraftVisibilityTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="owner", password="pw")
        self.other = User.objects.create_user(username="other", password="pw")
        self.admin = User.objects.create_superuser("admin", "a@example.com", "pw")
        # An Editor assigned to the draft's own Collection: the strongest case
        # for the queue lens, since every other filter would let the row in.
        editors = Group.objects.create(name="Editors")
        editors.permissions.add(Permission.objects.get(codename="review_contribution"))
        self.editor = User.objects.create_user(username="va_editor", password="pw")
        self.editor.groups.add(editors)
        self.region = Region.objects.create(
            name="Virginia",
            abbrev="VA",
            region_tier="STATE",
            created_by=self.owner,
            modified_by=self.owner,
        )
        self.collection = Collection.objects.create(
            name="Virginia",
            region=self.region,
            created_by=self.owner,
            modified_by=self.owner,
        )
        CollectionAssignment.objects.create(
            user=self.editor,
            collection=self.collection,
            created_by=self.admin,
            modified_by=self.admin,
        )
        self.post_office = PostOffice.objects.create(
            name="Richmond",
            created_by=self.owner,
            modified_by=self.owner,
        )
        PostOfficeRegion.objects.create(
            post_office=self.post_office,
            region=self.region,
            created_by=self.owner,
            modified_by=self.owner,
        )
        self.marking = Marking.objects.create(
            type="TOWNMARK",
            inscription_txt="RICHMOND VA",
            is_manuscript=True,
            post_office=self.post_office,
            created_by=self.owner,
            modified_by=self.owner,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        # The same request the Marking edit form sends when the contributor
        # turns a cover-like upload into a Cover draft (minus the file).
        response = self.client.post(
            "/api/v2/contributions/",
            {
                "submission_kind": "cover",
                "save_as_draft": "true",
                "state": "VA",
                "parent_marking_id": self.marking.pk,
                "marking_id": self.marking.pk,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, getattr(response, "data", None))
        self.draft_id = response.data["id"]
        self.assertEqual(
            Contribution.objects.get(pk=self.draft_id).status, Contribution.STATUS_DRAFT
        )

    def _listed_ids(self, **params):
        response = self.client.get("/api/v2/contributions/", params)
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        data = response.data
        rows = data["results"] if isinstance(data, dict) else data
        return {row["id"] for row in rows}

    def test_author_lists_the_draft_with_its_parent_marking(self):
        ids = self._listed_ids(status="draft", page_size=100)
        self.assertIn(self.draft_id, ids)
        detail = self.client.get(f"/api/v2/contributions/{self.draft_id}/")
        self.assertEqual(detail.status_code, 200)
        sd = detail.data["submitted_data"]
        self.assertEqual(sd["submission_kind"], "cover")
        self.assertEqual(int(sd["parent_marking_id"]), self.marking.pk)

    def test_another_contributor_never_lists_or_opens_it(self):
        self.client.force_authenticate(self.other)
        self.assertNotIn(self.draft_id, self._listed_ids(status="draft", page_size=100))
        self.assertNotIn(self.draft_id, self._listed_ids(page_size=100))
        detail = self.client.get(f"/api/v2/contributions/{self.draft_id}/")
        self.assertEqual(detail.status_code, 404)

    def test_assigned_editor_can_still_open_it_by_id(self):
        # Documents the pre-existing retrieve rule rather than a T92 claim.
        self.client.force_authenticate(self.editor)
        detail = self.client.get(f"/api/v2/contributions/{self.draft_id}/")
        self.assertEqual(detail.status_code, 200)

    def test_editor_queue_excludes_drafts(self):
        for reviewer in (self.editor, self.admin):
            self.client.force_authenticate(reviewer)
            self.assertNotIn(self.draft_id, self._listed_ids(mode="editor", page_size=100))
            self.assertNotIn(self.draft_id, self._listed_ids(page_size=100))
