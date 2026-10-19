"""Rotate a Marking image in quarter turns (Trello T66).

Editors asked for an easy way to fix a marking scanned on its side. The
rotated pixels replace the image in place (same row, position and caption)
in a new file, so the 30-day /media/ cache cannot show the old orientation;
the previous file is kept and named in the audit row.
"""
import io
import shutil
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import SimpleTestCase, TestCase, override_settings
from PIL import Image as PILImage
from rest_framework.test import APIClient

from common.images import RotateError, rotate_image_bytes
from common.models import (
    Collection,
    CollectionAssignment,
    Cover,
    Image,
    Marking,
    PostOffice,
    PostOfficeRegion,
    Region,
    SubmissionTransaction,
)


User = get_user_model()

MEDIA_ROOT = tempfile.mkdtemp(prefix="woco-rotate-tests-")

RED = (255, 0, 0)
GREEN = (0, 128, 0)


def _source_png() -> bytes:
    """80x60, red with a green top-right quarter."""
    image = PILImage.new("RGB", (80, 60), RED)
    image.paste(GREEN, (40, 0, 80, 30))
    output = io.BytesIO()
    image.save(output, format="PNG", dpi=(300, 150))
    return output.getvalue()


class RotateImageBytesTests(SimpleTestCase):
    def test_quarter_turns_are_clockwise(self):
        # Where the green top-right quarter lands after each turn.
        expected = {1: ((60, 80), "bottom-right"), 2: ((80, 60), "bottom-left"), 3: ((60, 80), "top-left")}
        for turns, (size, corner) in expected.items():
            with self.subTest(turns=turns):
                with PILImage.open(io.BytesIO(rotate_image_bytes(_source_png(), "image/png", turns))) as out:
                    self.assertEqual(out.size, size)
                    self.assertEqual(out.format, "PNG")
                    w, h = out.size
                    corners = {
                        "top-left": (2, 2),
                        "top-right": (w - 3, 2),
                        "bottom-left": (2, h - 3),
                        "bottom-right": (w - 3, h - 3),
                    }
                    for name, xy in corners.items():
                        self.assertEqual(out.getpixel(xy), GREEN if name == corner else RED, name)

    def test_odd_turn_swaps_resolution_axes(self):
        with PILImage.open(io.BytesIO(rotate_image_bytes(_source_png(), "image/png", 1))) as out:
            x_dpi, y_dpi = out.info["dpi"]
            self.assertAlmostEqual(x_dpi, 150, delta=1)
            self.assertAlmostEqual(y_dpi, 300, delta=1)

    def test_bad_turns_are_rejected(self):
        for turns in (0, 4, -1):
            with self.subTest(turns=turns), self.assertRaises(RotateError):
                rotate_image_bytes(_source_png(), "image/png", turns)


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class ImageRotateTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser("admin", password="pw")
        self.editor = User.objects.create_user("va-editor", password="pw")
        editors = Group.objects.create(name="Editors")
        editors.permissions.add(Permission.objects.get(codename="review_contribution"))
        self.editor.groups.add(editors)

        audit = {"created_by": self.admin, "modified_by": self.admin}
        region = Region.objects.create(name="Virginia", abbrev="VA", region_tier="STATE", **audit)
        collection = Collection.objects.create(name="Virginia Collection", region=region, **audit)
        CollectionAssignment.objects.create(user=self.editor, collection=collection, **audit)
        post_office = PostOffice.objects.create(name="Fetterman", **audit)
        PostOfficeRegion.objects.create(post_office=post_office, region=region, **audit)
        self.marking = Marking.objects.create(
            code="ASCC1-VA-M0001",
            type="TOWNMARK",
            inscription_txt="FETTERMAN VA",
            is_manuscript=False,
            post_office=post_office,
            **audit,
        )
        self.image = self._make_image(Image.SUBJECT_MARKING, self.marking.pk, "va/sideways.png")

    def _make_image(self, subject_type, subject_id, storage_filename):
        path = Path(MEDIA_ROOT) / storage_filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(_source_png())
        return Image.objects.create(
            subject_type=subject_type,
            subject_id=subject_id,
            original_filename=Path(storage_filename).name,
            storage_filename=storage_filename,
            file_checksum="seed",
            mime_type="image/png",
            image_width=80,
            image_height=60,
            file_size_bytes=path.stat().st_size,
            image_view="FULL" if subject_type == Image.SUBJECT_MARKING else "FRONT",
            image_description="Fetterman strike",
            display_order=0,
            uploaded_by=self.admin,
            created_by=self.admin,
            modified_by=self.admin,
        )

    def _rotate(self, image=None, **body):
        payload = {"quarter_turns": 1}
        payload.update(body)
        image = image or self.image
        return self.client.post(f"/api/v2/images/{image.pk}/rotate/", payload, format="json")

    def test_editor_rotates_the_image_in_place_and_keeps_the_original_file(self):
        self.client.force_authenticate(self.editor)
        original_path = Path(MEDIA_ROOT) / self.image.storage_filename
        original_bytes = original_path.read_bytes()

        response = self._rotate()

        self.assertEqual(response.status_code, 200, response.data)
        self.image.refresh_from_db()
        # Same row, position and caption; new file and recomputed metadata.
        self.assertEqual(response.data["image_id"], self.image.pk)
        self.assertEqual(self.image.display_order, 0)
        self.assertEqual(self.image.image_description, "Fetterman strike")
        self.assertEqual((self.image.image_width, self.image.image_height), (60, 80))
        self.assertTrue(self.image.storage_filename.startswith("va/"))
        self.assertNotEqual(self.image.storage_filename, "va/sideways.png")
        self.assertEqual(Image.objects.filter(subject_id=self.marking.pk).count(), 1)
        # The original file is untouched; the new one holds the turned pixels.
        self.assertEqual(original_path.read_bytes(), original_bytes)
        with PILImage.open(Path(MEDIA_ROOT) / self.image.storage_filename) as out:
            self.assertEqual(out.size, (60, 80))
        # One audit row naming the previous file, and a version snapshot.
        txn = SubmissionTransaction.objects.get(action=SubmissionTransaction.ACTION_IMAGE_ROTATED)
        self.assertEqual(txn.marking_id, self.marking.pk)
        self.assertEqual(txn.extra_payload["previous_storage_filename"], "va/sideways.png")
        self.assertEqual(txn.extra_payload["quarter_turns"], 1)
        self.assertEqual(self.marking.versions.count(), 1)

    def test_a_later_crop_uses_the_rotated_orientation(self):
        self.client.force_authenticate(self.editor)
        self._rotate()

        # (5, 65) is outside the unrotated 80x60 image, inside the 60x80 one.
        response = self.client.post(
            f"/api/v2/images/{self.image.pk}/crop/",
            {"x": 5, "y": 65, "width": 10, "height": 10},
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)

    def test_invalid_turns_are_rejected_without_writing(self):
        self.client.force_authenticate(self.editor)
        for turns in (0, 4, 1.5, True, "left", None):
            with self.subTest(turns=turns):
                self.assertEqual(self._rotate(quarter_turns=turns).status_code, 400)
        self.image.refresh_from_db()
        self.assertEqual(self.image.storage_filename, "va/sideways.png")

    def test_cover_images_are_not_rotated(self):
        self.client.force_authenticate(self.admin)
        cover = Cover.objects.create(
            code="ASCC1-VA-C0002", type="FC", created_by=self.admin, modified_by=self.admin
        )
        cover_image = self._make_image(Image.SUBJECT_COVER, cover.pk, "va/cover.png")

        response = self._rotate(image=cover_image)

        self.assertEqual(response.status_code, 400)

    def test_missing_source_file_is_reported_not_crashed(self):
        self.client.force_authenticate(self.editor)
        (Path(MEDIA_ROOT) / self.image.storage_filename).unlink()

        self.assertEqual(self._rotate().status_code, 404)

    def test_contributor_and_other_state_editor_cannot_rotate(self):
        contributor = User.objects.create_user("contributor", password="pw")
        other = User.objects.create_user("md-editor", password="pw")
        other.groups.add(Group.objects.get(name="Editors"))
        audit = {"created_by": self.admin, "modified_by": self.admin}
        md_region = Region.objects.create(name="Maryland", abbrev="MD", region_tier="STATE", **audit)
        md_collection = Collection.objects.create(name="Maryland Collection", region=md_region, **audit)
        CollectionAssignment.objects.create(user=other, collection=md_collection, **audit)

        for user in (contributor, other):
            with self.subTest(user=user.username):
                self.client.force_authenticate(user)
                self.assertEqual(self._rotate().status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self._rotate().status_code, (401, 403))
        self.assertFalse(
            SubmissionTransaction.objects.filter(action=SubmissionTransaction.ACTION_IMAGE_ROTATED).exists()
        )
