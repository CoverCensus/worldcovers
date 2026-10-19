"""Rotate a Marking or Cover image by any angle (Trello T66, issue #193).

Editors asked for an easy way to fix a marking scanned on its side; Ian
extended it to Cover images on 2026-10-19. The
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
    CoverMarking,
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
    def test_right_angles_are_clockwise_and_exact(self):
        # Where the green top-right quarter lands. -90 and 450 show that only
        # where the handle ends up matters, however far it went round.
        expected = {
            90: ((60, 80), "bottom-right"),
            450: ((60, 80), "bottom-right"),
            180: ((80, 60), "bottom-left"),
            -90: ((60, 80), "top-left"),
        }
        for angle, (size, corner) in expected.items():
            with self.subTest(angle=angle):
                with PILImage.open(io.BytesIO(rotate_image_bytes(_source_png(), "image/png", angle))) as out:
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
                        # Exact colours: a right angle is never resampled.
                        self.assertEqual(out.getpixel(xy), GREEN if name == corner else RED, name)

    def test_other_angles_grow_the_canvas_with_white_corners(self):
        with PILImage.open(io.BytesIO(rotate_image_bytes(_source_png(), "image/png", 30))) as out:
            # Pillow's expand: ceil/floor of the turned corners.
            self.assertEqual(out.size, (100, 92))
            self.assertEqual(out.getpixel((0, 0)), (255, 255, 255))
            # 24 px below the centre comes from the red lower half of the source.
            self.assertEqual(out.getpixel((50, 70)), RED)

    def test_odd_turn_swaps_resolution_axes(self):
        with PILImage.open(io.BytesIO(rotate_image_bytes(_source_png(), "image/png", 90))) as out:
            x_dpi, y_dpi = out.info["dpi"]
            self.assertAlmostEqual(x_dpi, 150, delta=1)
            self.assertAlmostEqual(y_dpi, 300, delta=1)

    def test_no_turn_or_a_non_finite_angle_is_rejected(self):
        for angle in (0, 360, -720, float("nan"), float("inf")):
            with self.subTest(angle=angle), self.assertRaises(RotateError):
                rotate_image_bytes(_source_png(), "image/png", angle)


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
        payload = {"angle": 90}
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
        self.assertEqual(txn.extra_payload["angle"], 90)
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

    def test_invalid_angles_are_rejected_without_writing(self):
        self.client.force_authenticate(self.editor)
        for angle in (0, 360, True, "left", None, "nan"):
            with self.subTest(angle=angle):
                self.assertEqual(self._rotate(angle=angle).status_code, 400)
        self.image.refresh_from_db()
        self.assertEqual(self.image.storage_filename, "va/sideways.png")

    def test_editor_rotates_a_cover_image_and_logs_it_on_the_cover(self):
        audit = {"created_by": self.admin, "modified_by": self.admin}
        cover = Cover.objects.create(code="ASCC1-VA-C0002", type="FC", **audit)
        CoverMarking.objects.create(cover=cover, marking=self.marking, **audit)
        cover_image = self._make_image(Image.SUBJECT_COVER, cover.pk, "va/cover.png")
        self.client.force_authenticate(self.editor)

        response = self._rotate(image=cover_image)

        self.assertEqual(response.status_code, 200, response.data)
        cover_image.refresh_from_db()
        self.assertEqual((cover_image.image_width, cover_image.image_height), (60, 80))
        self.assertNotEqual(cover_image.storage_filename, "va/cover.png")
        self.assertTrue((Path(MEDIA_ROOT) / "va/cover.png").exists())
        # Logged on the Cover's own history, not on its linked Marking's.
        txn = SubmissionTransaction.objects.get(action=SubmissionTransaction.ACTION_IMAGE_ROTATED)
        self.assertEqual(txn.cover_id, cover.pk)
        self.assertIsNone(txn.marking_id)
        self.assertEqual(cover.versions.count(), 1)
        self.assertEqual(self.marking.versions.count(), 0)

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
