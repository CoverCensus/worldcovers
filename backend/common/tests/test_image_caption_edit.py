"""T87: editors change a saved image's caption through an audited action."""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import TestCase
from rest_framework.test import APIClient

from common.models import (
    Collection, CollectionAssignment, Contribution, Cover, CoverMarking, Image, Marking,
    PostOffice, PostOfficeRegion, Region, SubmissionTransaction,
)

User = get_user_model()


class ImageCaptionEditTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser("admin", password="pw")
        self.editor = User.objects.create_user("va-editor", password="pw")
        editors = Group.objects.create(name="Editors")
        editors.permissions.add(Permission.objects.get(codename="review_contribution"))
        self.editor.groups.add(editors)
        audit = {"created_by": self.admin, "modified_by": self.admin}
        region = Region.objects.create(name="Virginia", abbrev="VA", region_tier="STATE", **audit)
        collection = Collection.objects.create(name="Virginia", region=region, **audit)
        CollectionAssignment.objects.create(user=self.editor, collection=collection, **audit)
        self.collection = collection
        office = PostOffice.objects.create(name="Fetterman", **audit)
        PostOfficeRegion.objects.create(post_office=office, region=region, **audit)
        self.marking = Marking.objects.create(
            type="TOWNMARK", inscription_txt="FETTERMAN VA", is_manuscript=False,
            post_office=office, **audit,
        )
        self.cover = Cover.objects.create(type="FC", **audit)
        CoverMarking.objects.create(cover=self.cover, marking=self.marking, **audit)
        self.marking_image = self._image(Image.SUBJECT_MARKING, self.marking.pk, "FULL")
        self.cover_image = self._image(Image.SUBJECT_COVER, self.cover.pk, "FRONT")

    def _image(self, subject_type, subject_id, view):
        return Image.objects.create(
            subject_type=subject_type, subject_id=subject_id, original_filename="a.png",
            storage_filename=f"va/{subject_type.lower()}.png", file_checksum="x", mime_type="image/png",
            image_width=8, image_height=6, file_size_bytes=10, image_view=view,
            image_description="Front", display_order=0, uploaded_by=self.admin,
            created_by=self.admin, modified_by=self.admin,
        )

    def caption(self, image, text, user=None):
        self.client.force_authenticate(user or self.editor)
        return self.client.post(
            f"/api/v2/images/{image.pk}/caption/", {"image_description": text}, format="json"
        )

    def test_caption_change_is_saved_logged_and_shown_in_each_entrys_history(self):
        for image, entry, history in (
            (self.marking_image, self.marking, f"/api/v2/markings/{self.marking.pk}/changelog/"),
            (self.cover_image, self.cover, f"/api/v2/covers/{self.cover.pk}/changelog/"),
        ):
            with self.subTest(subject=image.subject_type):
                response = self.caption(image, "  Strike on the front  ")
                self.assertEqual(response.status_code, 200, response.data)
                image.refresh_from_db()
                self.assertEqual(image.image_description, "Strike on the front")
                txn = SubmissionTransaction.objects.get(
                    action=SubmissionTransaction.ACTION_IMAGE_CAPTION_CHANGED,
                    extra_payload__image_id=image.pk,
                )
                self.assertEqual(
                    (txn.extra_payload["previous_caption"], txn.extra_payload["caption"]),
                    ("Front", "Strike on the front"),
                )
                self.assertEqual(entry.versions.count(), 1)

                events = self.client.get(history).data["events"]
                event = next(e for e in events if e["action"] == "image_caption_changed")
                self.assertEqual(event["action_label"], "Image caption changed")
                self.assertEqual(
                    event["caption_change"], {"previous": "Front", "caption": "Strike on the front"}
                )

    def test_only_a_responsible_editor_can_change_a_caption(self):
        outsider = User.objects.create_user("oh-editor")
        outsider.groups.add(Group.objects.get(name="Editors"))
        contributor = User.objects.create_user("contributor")
        for user in (outsider, contributor):
            with self.subTest(user=user.username):
                response = self.caption(self.marking_image, "Changed", user=user)
                self.assertIn(response.status_code, (403, 404))
        self.marking_image.refresh_from_db()
        self.assertEqual(self.marking_image.image_description, "Front")

    def test_overlong_or_unchanged_caption_writes_nothing(self):
        self.assertEqual(self.caption(self.marking_image, "x" * 501).status_code, 400)
        self.assertEqual(self.caption(self.marking_image, "Front").status_code, 200)
        self.assertFalse(SubmissionTransaction.objects.exists())
        self.assertEqual(self.marking.versions.count(), 0)

    def test_resumed_draft_recaptions_its_saved_image_and_approval_keeps_it(self):
        contributor = User.objects.create_user("contributor")
        draft = Contribution.objects.create(
            contributor=contributor, collection=self.collection, status=Contribution.STATUS_DRAFT,
            submitted_data={
                "state": "VA", "town": "Fetterman", "type": "TOWNMARK", "is_manuscript": True,
                "inscription_txt": "FETTERMAN VA",
                "marking_image_metas": [
                    {"storage_filename": "va/saved.png", "original_filename": "saved.png",
                     "image_description": "Old caption"},
                ],
            },
            created_by=contributor, modified_by=contributor,
        )
        self.client.force_authenticate(contributor)
        response = self.client.post("/api/v2/contributions/", {
            "edit_contribution_id": draft.pk, "state": "VA", "town": "Fetterman", "type": "TOWNMARK",
            "is_manuscript": True, "inscription_txt": "FETTERMAN VA",
            "existing_image_descriptions": {"/media/va/saved.png": "  New caption "},
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        draft.refresh_from_db()
        self.assertEqual(draft.submitted_data["marking_image_metas"][0]["image_description"], "New caption")
        self.assertNotIn("existing_image_descriptions", draft.submitted_data)

        self.client.force_authenticate(self.admin)
        approved = self.client.post(f"/api/v2/contributions/{draft.pk}/approve/", {}, format="json")
        self.assertEqual(approved.status_code, 200, approved.data)
        draft.refresh_from_db()
        row = Image.objects.get(subject_type=Image.SUBJECT_MARKING, subject_id=draft.marking_id)
        self.assertEqual(row.image_description, "New caption")
