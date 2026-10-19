"""T43: per-upload captions travel from the submit form to Image rows."""
import io
import json
import shutil
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image as PILImage
from rest_framework.test import APIClient

from common.models import (
    Collection, Contribution, Image, Marking, PostOffice, PostOfficeRegion, Region,
)


MEDIA_ROOT = tempfile.mkdtemp(prefix="woco-caption-tests-")


def _png(name):
    output = io.BytesIO()
    PILImage.new("RGB", (40, 30), (200, 30, 30)).save(output, format="PNG")
    return SimpleUploadedFile(name, output.getvalue(), content_type="image/png")


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class ImageCaptionSubmissionTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user("contributor")
        self.editor = get_user_model().objects.create_superuser("editor")
        audit = {"created_by": self.editor, "modified_by": self.editor}
        region = Region.objects.create(name="Virginia", abbrev="VA", region_tier="STATE", **audit)
        Collection.objects.create(name="Virginia", region=region, **audit)
        office = PostOffice.objects.create(name="Richmond", **audit)
        PostOfficeRegion.objects.create(post_office=office, region=region, **audit)
        self.marking = Marking.objects.create(
            type="TOWNMARK", inscription_txt="RICHMOND", is_manuscript=True,
            post_office=office, **audit,
        )

    def payload(self, kind, captions):
        if kind == "MARKING":
            return {
                "state": "VA", "town": "Richmond", "type": "TOWNMARK",
                "is_manuscript": True, "inscription_txt": "RICHMOND",
                "marking_image": [_png("strike.png"), _png("tracing.png")],
                "marking_image_descriptions": json.dumps(captions),
            }
        return {
            "state": "VA", "submission_kind": "cover", "parent_marking_id": self.marking.pk,
            "type": "FC", "cover_date_unknown": True,
            "cover_image": [_png("front.png"), _png("back.png")],
            "cover_image_descriptions": json.dumps(captions),
        }

    def test_captions_reach_image_rows_in_upload_order(self):
        for kind, meta_key in (("MARKING", "marking_image_metas"), ("COVER", "cover_image_metas")):
            with self.subTest(kind=kind):
                self.client.force_authenticate(self.user)
                response = self.client.post(
                    "/api/v2/contributions/",
                    self.payload(kind, ["  Strike on the front  ", ""]),
                    format="multipart",
                )
                self.assertEqual(response.status_code, 201, response.data)
                contribution = Contribution.objects.get(pk=response.data["id"])
                metas = contribution.submitted_data[meta_key]
                self.assertEqual(
                    [m.get("image_description") for m in metas],
                    ["Strike on the front", None],
                )
                self.assertNotIn(meta_key.replace("metas", "descriptions"), contribution.submitted_data)

                self.client.force_authenticate(self.editor)
                approved = self.client.post(
                    f"/api/v2/contributions/{contribution.pk}/approve/", {}, format="json"
                )
                self.assertEqual(approved.status_code, 200, approved.data)
                contribution.refresh_from_db()
                subject_id = (
                    contribution.marking_id if kind == "MARKING" else approved.data["coverId"]
                )
                rows = Image.objects.filter(
                    subject_type=kind, subject_id=subject_id
                ).order_by("display_order")
                self.assertEqual(
                    [r.image_description for r in rows], ["Strike on the front", ""]
                )

    def test_overlong_caption_is_rejected_before_any_file_is_saved(self):
        files_before = sorted(Path(MEDIA_ROOT).rglob("*.png"))
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/v2/contributions/",
            self.payload("MARKING", ["ok", "x" * 501]),
            format="multipart",
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(
            response.data["detail"], "Caption for image 2 is longer than 500 characters."
        )
        self.assertFalse(Contribution.objects.exists())
        self.assertEqual(sorted(Path(MEDIA_ROOT).rglob("*.png")), files_before)
