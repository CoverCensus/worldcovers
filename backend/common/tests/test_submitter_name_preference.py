"""An edit must not change another Contributor's public-name preference."""

from django.contrib.auth import get_user_model
from django.contrib import admin
from django.test import RequestFactory, TestCase
from rest_framework.test import APIClient

from common.models import (
    Collection, Cover, CoverMarking, Marking,
    PostOffice, PostOfficeRegion, Region,
)


class SubmitterNamePreferenceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        users = get_user_model().objects
        self.creator = users.create_user("original", first_name="Original Contributor")
        self.other = users.create_user("other")
        self.editor = users.create_superuser("reviewer")
        audit = {"created_by": self.creator, "modified_by": self.creator}
        region = Region.objects.create(
            name="Virginia", abbrev="VA", region_tier="STATE", **audit
        )
        Collection.objects.create(name="Virginia", region=region, **audit)
        office = PostOffice.objects.create(name="Richmond", **audit)
        PostOfficeRegion.objects.create(post_office=office, region=region, **audit)
        self.marking = Marking.objects.create(
            type="TOWNMARK", inscription_txt="RICHMOND", is_manuscript=True,
            post_office=office, **audit,
        )
        self.cover = Cover.objects.create(type="FC", **audit)
        CoverMarking.objects.create(cover=self.cover, marking=self.marking, **audit)

    def payload(self, entry):
        if isinstance(entry, Marking):
            return {
                "state": "VA", "town": "Richmond", "type": "TOWNMARK",
                "is_manuscript": True, "inscription_txt": "RICHMOND EDITED",
                "edit_marking_id": entry.pk, "no_marking_image": True,
            }
        return {
            "state": "VA", "submission_kind": "cover", "type": "FC",
            "parent_marking_id": self.marking.pk, "edit_cover_id": entry.pk,
            "description": "Edited description", "cover_date_unknown": True,
            "no_cover_image": True,
        }

    def url(self, entry):
        resource = "markings" if isinstance(entry, Marking) else "covers"
        return f"/api/v2/{resource}/{entry.pk}/"

    def approve_edit(self, entry, actor, preference, fmt="json"):
        data = self.payload(entry)
        if preference is not None:
            data["display_submitter_name"] = preference
        self.client.force_authenticate(actor)
        response = self.client.post("/api/v2/contributions/", data, format=fmt)
        self.assertEqual(response.status_code, 201, response.data)
        self.client.force_authenticate(self.editor)
        response = self.client.post(
            f"/api/v2/contributions/{response.data['id']}/approve/", {}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        entry.refresh_from_db()

    def test_other_contributor_or_editor_cannot_replace_either_choice(self):
        for entry in (self.marking, self.cover):
            for actor in (self.other, self.editor):
                for current in (False, True):
                    for fmt in ("json", "multipart"):
                        with self.subTest(entry=type(entry).__name__, actor=actor, current=current, fmt=fmt):
                            entry.display_submitter_name = current
                            entry.save()
                            self.approve_edit(entry, actor, not current, fmt)
                            self.assertEqual(entry.display_submitter_name, current)
                            self.assertEqual(entry.created_by_id, self.creator.pk)
                            self.assertEqual(entry.modified_by_id, actor.pk)
                            self.client.force_authenticate(None)
                            public = self.client.get(self.url(entry)).data
                            self.assertEqual(public["submitter_name"], "Original Contributor" if current else None)

    def test_creator_can_change_either_choice_with_a_different_reviewer(self):
        for entry in (self.marking, self.cover):
            for choice in (True, False):
                with self.subTest(entry=type(entry).__name__, choice=choice):
                    self.approve_edit(entry, self.creator, choice)
                    self.assertEqual(entry.display_submitter_name, choice)

    def test_omitted_preference_keeps_the_current_choice(self):
        for entry in (self.marking, self.cover):
            entry.display_submitter_name = True
            entry.save()
            self.approve_edit(entry, self.creator, None)
            self.assertTrue(entry.display_submitter_name)

    def test_direct_api_edit_cannot_bypass_consent(self):
        self.client.force_authenticate(self.editor)
        for entry in (self.marking, self.cover):
            for current in (False, True):
                with self.subTest(entry=type(entry).__name__, current=current):
                    entry.display_submitter_name = current
                    entry.save()
                    response = self.client.patch(
                        self.url(entry), {"display_submitter_name": not current}, format="json"
                    )
                    self.assertEqual(response.status_code, 400, response.data)
                    self.assertIn("display_submitter_name", response.data)
                    entry.refresh_from_db()
                    self.assertEqual(entry.display_submitter_name, current)
            entry.created_by = self.editor
            entry.save()
            for choice in (False, True):
                response = self.client.patch(
                    self.url(entry), {"display_submitter_name": choice}, format="json"
                )
                self.assertEqual(response.status_code, 200, response.data)
                entry.refresh_from_db()
                self.assertEqual(entry.display_submitter_name, choice)

    def test_api_reports_only_the_creators_ability_to_change_the_preference(self):
        for entry in (self.marking, self.cover):
            for user in (None, self.other, self.editor, self.creator):
                with self.subTest(entry=type(entry).__name__, user=user):
                    self.client.force_authenticate(user)
                    response = self.client.get(self.url(entry))
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.data["can_change_submitter_name"], user == self.creator)

    def test_admin_edit_form_excludes_another_contributors_preference(self):
        request = RequestFactory().get("/admin/")
        request.user = self.editor
        for entry in (self.marking, self.cover):
            model_admin = admin.site._registry[type(entry)]
            form = model_admin.get_form(request, entry)
            self.assertNotIn("display_submitter_name", form.base_fields)
            entry.created_by = self.editor
            form = model_admin.get_form(request, entry)
            self.assertIn("display_submitter_name", form.base_fields)

    def test_old_draft_cannot_replace_a_choice_changed_before_approval(self):
        for entry in (self.marking, self.cover):
            self.client.force_authenticate(self.other)
            response = self.client.post(
                "/api/v2/contributions/",
                {**self.payload(entry), "display_submitter_name": False, "save_as_draft": True},
                format="multipart",
            )
            self.assertEqual(response.status_code, 201, response.data)
            draft_id = response.data["id"]
            entry.display_submitter_name = True
            entry.save()
            response = self.client.post(
                "/api/v2/contributions/",
                {**self.payload(entry), "edit_contribution_id": draft_id}, format="multipart",
            )
            self.assertEqual(response.status_code, 200, response.data)
            self.client.force_authenticate(self.editor)
            response = self.client.post(f"/api/v2/contributions/{draft_id}/approve/", {}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            entry.refresh_from_db()
            self.assertTrue(entry.display_submitter_name)
