"""Submit a new Marking and its Cover in one go (Trello T37, Ian 2026-10-16 / 10-19).

A contributor usually has one scan of the whole cover. Today the Cover cannot be
submitted until the Marking is approved. Now the Marking submission may carry a
`pending_cover`: the Cover's fields and its own uploads, stored inside the
Marking contribution. Approving the Marking creates an ordinary pending Cover
contribution for the new Marking, reviewed with the existing cover page -- two
approvals, one form. No model change.
"""
import io
import json
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image as PILImage
from rest_framework.test import APIClient

from common.models import (
    Collection, Contribution, Cover, CoverMarking, Image, Marking, PostOffice,
    PostOfficeRegion, Region, SubmissionTransaction,
)

MEDIA_ROOT = tempfile.mkdtemp(prefix="woco-pending-cover-tests-")
SUBMIT = "/api/v2/contributions/"


def _png(name, size=(40, 30)):
    output = io.BytesIO()
    PILImage.new("RGB", size, (200, 30, 30)).save(output, format="PNG")
    return SimpleUploadedFile(name, output.getvalue(), content_type="image/png")


def _cover(**overrides):
    fields = {
        "type": "ENV", "cover_date_unknown": False, "cover_date_year": "1851",
        "cover_date_month": "", "cover_date_day": "",
        "is_institutional": False, "is_backstamp": False,
        "description": "Whole cover, Richmond to Norfolk.",
    }
    fields.update(overrides)
    return json.dumps(fields)


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class PendingCoverTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.client = APIClient()
        self.contributor = get_user_model().objects.create_user("contributor", password="pw")
        self.editor = get_user_model().objects.create_superuser("editor", "e@example.com", "pw")
        audit = {"created_by": self.editor, "modified_by": self.editor}
        self.region = Region.objects.create(name="Virginia", abbrev="VA", region_tier="STATE", **audit)
        self.collection = Collection.objects.create(name="Virginia", region=self.region, **audit)
        office = PostOffice.objects.create(name="Richmond", **audit)
        PostOfficeRegion.objects.create(post_office=office, region=self.region, **audit)
        self.client.force_authenticate(self.contributor)

    def _marking_payload(self, **extra):
        payload = {
            "state": "VA", "town": "Richmond", "type": "TOWNMARK",
            "is_manuscript": True, "inscription_txt": "RICHMOND VA",
            "marking_image": [_png("crop.png")],
        }
        payload.update(extra)
        return payload

    def _submit(self, **extra):
        return self.client.post(SUBMIT, self._marking_payload(**extra), format="multipart")

    def _approve(self, pk, user=None):
        client = APIClient()
        client.force_authenticate(user or self.editor)
        return client.post(f"{SUBMIT}{pk}/approve/", {"review_notes": "ok"}, format="json")

    # ------------------------------------------------------------ submit

    def test_submit_stores_the_cover_and_its_image_inside_the_marking_contribution(self):
        response = self._submit(
            pending_cover=_cover(), pending_cover_image=[_png("whole-cover.png", (400, 250))],
        )

        self.assertEqual(response.status_code, 201, response.data)
        sd = Contribution.objects.get(pk=response.data["id"]).submitted_data
        self.assertEqual(sd["submission_kind"], "marking")
        self.assertEqual(len(sd["marking_image_metas"]), 1)
        pc = sd["pending_cover"]
        self.assertEqual(pc["type"], "ENV")
        self.assertEqual(pc["cover_date_year"], "1851")
        self.assertEqual(pc["description"], "Whole cover, Richmond to Norfolk.")
        self.assertEqual(len(pc["image_metas"]), 1)
        self.assertEqual(pc["image_metas"][0]["image_width"], 400)
        # The cover scan is a separate file from the marking crop.
        self.assertNotEqual(pc["image_metas"][0]["storage_filename"], sd["marking_image_metas"][0]["storage_filename"])
        # Raw transport keys are not persisted.
        self.assertNotIn("drop_pending_cover", sd)

    def test_final_submit_requires_cover_type_date_and_image(self):
        no_type = self._submit(pending_cover=_cover(type=""), pending_cover_image=[_png("c.png")])
        self.assertEqual(no_type.status_code, 400)
        self.assertIn("type", no_type.data["detail"].lower())

        no_date = self._submit(
            pending_cover=_cover(cover_date_year="", cover_date_unknown=False),
            pending_cover_image=[_png("c.png")],
        )
        self.assertEqual(no_date.status_code, 400)
        self.assertIn("date", no_date.data["detail"].lower())

        no_image = self._submit(pending_cover=_cover())
        self.assertEqual(no_image.status_code, 400)
        self.assertEqual(
            no_image.data["detail"],
            "Add at least one cover image or confirm no image is available.",
        )
        self.assertEqual(Contribution.objects.count(), 0)

    def test_a_draft_may_hold_an_incomplete_cover_and_a_resubmit_keeps_its_images(self):
        draft = self._submit(
            save_as_draft="true", pending_cover=_cover(type="", cover_date_year=""),
            pending_cover_image=[_png("whole-cover.png")],
        )
        self.assertEqual(draft.status_code, 201, draft.data)
        pk = draft.data["id"]
        saved_meta = Contribution.objects.get(pk=pk).submitted_data["pending_cover"]["image_metas"][0]

        # Resubmit: fields replaced, no new cover file, saved image kept.
        # A resubmit answers 200 (existing row), not 201. No new marking file either.
        done = self._submit(edit_contribution_id=pk, pending_cover=_cover(type="FC"), marking_image=[])
        self.assertEqual(done.status_code, 200, done.data)
        contrib = Contribution.objects.get(pk=pk)
        self.assertEqual(contrib.status, Contribution.STATUS_PENDING)
        pc = contrib.submitted_data["pending_cover"]
        self.assertEqual(pc["type"], "FC")
        self.assertEqual(pc["image_metas"], [saved_meta])

        # Removing the saved image by its displayed URL and adding a new one swaps them.
        swapped = self._submit(
            edit_contribution_id=pk, pending_cover=_cover(type="FC"), marking_image=[],
            pending_cover_removed_image_keys=json.dumps([f"/media/{saved_meta['storage_filename']}"]),
            pending_cover_image=[_png("replacement.png")],
        )
        self.assertEqual(swapped.status_code, 200, swapped.data)
        metas = Contribution.objects.get(pk=pk).submitted_data["pending_cover"]["image_metas"]
        self.assertEqual([m["original_filename"] for m in metas], ["replacement.png"])

        # Dropping the section removes the stored cover entirely.
        dropped = self._submit(edit_contribution_id=pk, drop_pending_cover="true", marking_image=[])
        self.assertEqual(dropped.status_code, 200, dropped.data)
        self.assertNotIn("pending_cover", Contribution.objects.get(pk=pk).submitted_data)

    def test_a_refused_submit_writes_no_cover_file_and_stamps_cannot_be_forged(self):
        import os
        before = sum(len(files) for _, _, files in os.walk(MEDIA_ROOT))
        refused = self._submit(pending_cover=_cover(type=""), pending_cover_image=[_png("c.png")], marking_image=[])
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(sum(len(files) for _, _, files in os.walk(MEDIA_ROOT)), before)

        forged = self._submit(pending_cover_contribution_id=999, created_from_contribution_id=998)
        self.assertEqual(forged.status_code, 201, forged.data)
        sd = Contribution.objects.get(pk=forged.data["id"]).submitted_data
        self.assertNotIn("pending_cover_contribution_id", sd)
        self.assertNotIn("created_from_contribution_id", sd)

    def test_a_draft_that_becomes_a_marking_edit_sheds_its_cover(self):
        audit = {"created_by": self.editor, "modified_by": self.editor}
        office = PostOffice.objects.get(name="Richmond")
        existing = Marking.objects.create(type="TOWNMARK", inscription_txt="RICHMOND", is_manuscript=True, post_office=office, **audit)
        draft = self._submit(save_as_draft="true", pending_cover=_cover(), pending_cover_image=[_png("c.png")])
        pk = draft.data["id"]

        turned = self._submit(edit_contribution_id=pk, edit_marking_id=existing.pk, marking_image=[])
        self.assertEqual(turned.status_code, 200, turned.data)
        self.assertNotIn("pending_cover", Contribution.objects.get(pk=pk).submitted_data)

        # Belt and braces: a stored cover on an edit row never produces a child on approval.
        edit_row = Contribution.objects.get(pk=pk)
        edit_row.submitted_data["pending_cover"] = {"type": "ENV", "image_metas": []}
        edit_row.save(update_fields=["submitted_data"])
        approved = self._approve(pk)
        self.assertEqual(approved.status_code, 200, approved.data)
        self.assertNotIn("pendingCoverContributionId", approved.data)

    # ------------------------------------------------------------ approve

    def test_approving_the_marking_creates_a_pending_cover_submission(self):
        created = self._submit(pending_cover=_cover(), pending_cover_image=[_png("whole-cover.png")])
        parent_pk = created.data["id"]

        response = self._approve(parent_pk)

        self.assertEqual(response.status_code, 200, response.data)
        marking_id = response.data["markingId"]
        child_pk = response.data["pendingCoverContributionId"]
        child = Contribution.objects.get(pk=child_pk)
        self.assertEqual(child.status, Contribution.STATUS_PENDING)
        self.assertEqual(child.contributor, self.contributor)
        self.assertEqual(child.collection, self.collection)
        sd = child.submitted_data
        self.assertEqual(sd["submission_kind"], "cover")
        self.assertEqual(sd["parent_marking_id"], marking_id)
        self.assertEqual(sd["state"], "VA")
        self.assertEqual(sd["type"], "ENV")
        self.assertEqual(sd["cover_date_year"], "1851")
        self.assertEqual(sd["created_from_contribution_id"], parent_pk)
        self.assertEqual(len(sd["cover_image_metas"]), 1)
        parent = Contribution.objects.get(pk=parent_pk)
        self.assertEqual(parent.status, Contribution.STATUS_APPROVED)
        self.assertEqual(parent.submitted_data["pending_cover_contribution_id"], child_pk)
        self.assertTrue(
            SubmissionTransaction.objects.filter(
                contribution=child, action=SubmissionTransaction.ACTION_SUBMIT,
                source=SubmissionTransaction.SOURCE_SYSTEM,
            ).exists()
        )

    def test_the_child_cover_approves_onto_the_new_marking_with_the_uncropped_scan(self):
        created = self._submit(pending_cover=_cover(), pending_cover_image=[_png("whole-cover.png")])
        approved = self._approve(created.data["id"])
        marking_id = approved.data["markingId"]
        child_pk = approved.data["pendingCoverContributionId"]
        scan = Contribution.objects.get(pk=child_pk).submitted_data["cover_image_metas"][0]["storage_filename"]

        response = self._approve(child_pk)

        self.assertEqual(response.status_code, 200, response.data)
        cover = Cover.objects.get(pk=response.data["coverId"])
        self.assertEqual(cover.type, "ENV")
        link = CoverMarking.objects.get(cover=cover)
        self.assertEqual(link.marking_id, marking_id)
        self.assertEqual(link.review_status, CoverMarking.REVIEW_APPROVED)
        images = list(Image.objects.filter(subject_type=Image.SUBJECT_COVER, subject_id=cover.pk))
        self.assertEqual([i.storage_filename for i in images], [scan])
        # The marking keeps its own crop.
        self.assertEqual(Image.objects.filter(subject_type=Image.SUBJECT_MARKING, subject_id=marking_id).count(), 1)

    def test_bulk_approve_creates_the_child_too(self):
        created = self._submit(pending_cover=_cover(), pending_cover_image=[_png("whole-cover.png")])
        client = APIClient()
        client.force_authenticate(self.editor)

        response = client.post(f"{SUBMIT}bulk-approve/", {"ids": [created.data["id"]]}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["approved"], [created.data["id"]])
        self.assertEqual(
            Contribution.objects.filter(submitted_data__created_from_contribution_id=created.data["id"]).count(), 1
        )

    def test_reject_and_a_plain_marking_create_nothing(self):
        with_cover = self._submit(pending_cover=_cover(), pending_cover_image=[_png("whole-cover.png")])
        client = APIClient()
        client.force_authenticate(self.editor)
        rejected = client.post(f"{SUBMIT}{with_cover.data['id']}/reject/", {"review_notes": "no"}, format="json")
        self.assertEqual(rejected.status_code, 200, rejected.data)

        plain = self._submit()
        approved = self._approve(plain.data["id"])
        self.assertEqual(approved.status_code, 200, approved.data)
        self.assertNotIn("pendingCoverContributionId", approved.data)
        self.assertEqual(Contribution.objects.filter(submitted_data__submission_kind="cover").count(), 0)
