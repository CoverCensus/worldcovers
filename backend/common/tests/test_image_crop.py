"""Crop a marking out of a whole-cover scan (issue #77).

Prerequisite for the #78 backfill: much of the catalog has a scan of a whole
cover sitting in a marking's image slot. The full scan belongs on a Cover, but
moving it there first would leave the marking with nothing -- 112 markings on
prod hold no other image. Cropping gives the marking a real closeup so the
original can then be moved with the existing PATCH (issue #48).
"""
import io
import shutil
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import TestCase, override_settings
from PIL import Image as PILImage
from rest_framework.test import APIClient

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
)


User = get_user_model()

MEDIA_ROOT = tempfile.mkdtemp(prefix="woco-crop-tests-")


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class ImageCropTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser("admin", password="pw")
        self.editor = User.objects.create_user("va-editor", password="pw")
        editors = Group.objects.create(name="Editors")
        editors.permissions.add(
            Permission.objects.get(codename="review_contribution")
        )
        self.editor.groups.add(editors)

        audit = {"created_by": self.admin, "modified_by": self.admin}
        self.region = Region.objects.create(
            name="Virginia", abbrev="VA", region_tier="STATE", **audit
        )
        collection = Collection.objects.create(
            name="Virginia Collection", region=self.region, **audit
        )
        CollectionAssignment.objects.create(
            user=self.editor, collection=collection, **audit
        )
        self.post_office = PostOffice.objects.create(name="Fetterman", **audit)
        PostOfficeRegion.objects.create(
            post_office=self.post_office, region=self.region, **audit
        )
        self.marking = Marking.objects.create(
            code="ASCC1-VA-M0001",
            type="TOWNMARK",
            inscription_txt="FETTERMAN VA",
            is_manuscript=False,
            post_office=self.post_office,
            **audit,
        )
        # A whole-cover scan filed as this marking's image -- the real shape of
        # the problem (prod image 2417 is 2631x1290).
        self.source = self._make_image("va/cover-scan.jpg", width=400, height=200)

    def _make_image(self, storage_filename, width, height):
        path = Path(MEDIA_ROOT) / storage_filename
        path.parent.mkdir(parents=True, exist_ok=True)
        PILImage.new("RGB", (width, height), color=(200, 180, 150)).save(path)
        content = path.read_bytes()
        return Image.objects.create(
            subject_type=Image.SUBJECT_MARKING,
            subject_id=self.marking.pk,
            original_filename=Path(storage_filename).name,
            storage_filename=storage_filename,
            file_checksum="seed",
            mime_type="image/jpeg",
            image_width=width,
            image_height=height,
            file_size_bytes=len(content),
            image_view="FULL",
            display_order=0,
            uploaded_by=self.admin,
            created_by=self.admin,
            modified_by=self.admin,
        )

    def _crop(self, **body):
        payload = {"x": 10, "y": 20, "width": 100, "height": 80}
        payload.update(body)
        return self.client.post(
            f"/api/v2/images/{self.source.pk}/crop/", payload, format="json"
        )

    # --- happy path ----------------------------------------------------------

    def test_editor_crops_a_marking_out_of_a_cover_scan(self):
        self.client.force_authenticate(self.editor)

        response = self._crop()

        self.assertEqual(response.status_code, 201, response.data)
        cropped = Image.objects.get(pk=response.data["image_id"])
        # Lands on the same marking, so the marking gains a usable image.
        self.assertEqual(cropped.subject_type, Image.SUBJECT_MARKING)
        self.assertEqual(cropped.subject_id, self.marking.pk)
        # Metadata is recomputed from the cropped bytes, not copied.
        self.assertEqual((cropped.image_width, cropped.image_height), (100, 80))
        self.assertNotEqual(cropped.file_checksum, self.source.file_checksum)
        self.assertEqual(cropped.cropped_from_id, self.source.pk)
        # Appended, never promoted over the existing default.
        self.assertEqual(cropped.display_order, 1)

        on_disk = Path(MEDIA_ROOT) / cropped.storage_filename
        self.assertTrue(on_disk.is_file())
        with PILImage.open(io.BytesIO(on_disk.read_bytes())) as img:
            self.assertEqual(img.size, (100, 80))

    def test_crop_is_non_destructive(self):
        self.client.force_authenticate(self.editor)
        before = (Path(MEDIA_ROOT) / self.source.storage_filename).read_bytes()

        self._crop()

        after = (Path(MEDIA_ROOT) / self.source.storage_filename).read_bytes()
        self.assertEqual(before, after)
        self.source.refresh_from_db()
        self.assertEqual(self.source.image_width, 400)

    def test_crop_is_stored_beside_its_source(self):
        """Media stays sorted by state rather than pooling in uploads/."""
        self.client.force_authenticate(self.editor)

        response = self._crop()

        self.assertTrue(response.data["storage_filename"].startswith("va/"))

    # --- validation ----------------------------------------------------------

    def test_crop_reaching_outside_the_image_is_rejected(self):
        self.client.force_authenticate(self.editor)

        response = self._crop(x=350, width=100)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Image.objects.filter(cropped_from=self.source).count(), 0)

    def test_zero_area_crop_is_rejected(self):
        self.client.force_authenticate(self.editor)

        self.assertEqual(self._crop(width=0).status_code, 400)
        self.assertEqual(self._crop(height=0).status_code, 400)

    def test_non_numeric_rectangle_is_rejected(self):
        self.client.force_authenticate(self.editor)

        self.assertEqual(self._crop(x="left").status_code, 400)

    def test_image_view_must_be_valid_for_the_subject(self):
        """FRONT is a cover view; the CheckConstraint would reject it anyway."""
        self.client.force_authenticate(self.editor)

        response = self._crop(image_view="FRONT")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Image.objects.filter(cropped_from=self.source).count(), 0)

    def test_missing_source_file_is_reported_not_crashed(self):
        self.client.force_authenticate(self.editor)
        (Path(MEDIA_ROOT) / self.source.storage_filename).unlink()

        response = self._crop()

        self.assertEqual(response.status_code, 404)

    # --- permissions ---------------------------------------------------------

    def test_editor_of_another_state_cannot_crop(self):
        other = User.objects.create_user("md-editor", password="pw")
        other.groups.add(Group.objects.get(name="Editors"))
        audit = {"created_by": self.admin, "modified_by": self.admin}
        md_region = Region.objects.create(
            name="Maryland", abbrev="MD", region_tier="STATE", **audit
        )
        md_collection = Collection.objects.create(
            name="Maryland Collection", region=md_region, **audit
        )
        CollectionAssignment.objects.create(
            user=other, collection=md_collection, **audit
        )
        self.client.force_authenticate(other)

        response = self._crop()

        self.assertEqual(response.status_code, 403)
        self.assertEqual(Image.objects.filter(cropped_from=self.source).count(), 0)

    def test_contributor_cannot_crop(self):
        contributor = User.objects.create_user("contributor", password="pw")
        self.client.force_authenticate(contributor)

        response = self._crop()

        self.assertEqual(response.status_code, 403)

    def test_anonymous_cannot_crop(self):
        response = self._crop()

        self.assertIn(response.status_code, (401, 403))


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class ImageCropIntoMarkingTests(TestCase):
    """Crop from a Cover into an associated Marking that has no image.

    Trello T37 (workspace issues.md #182): "If the associated Marking has no
    image, offer a crop into that existing Marking. Preserve the original
    image." The destination is validated server-side -- approved CoverMarking,
    zero images, responsibility for both subjects -- so this stays one request
    and one row with `cropped_from`, and never inherits the image PATCH's
    missing region scope (T73).
    """

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser("admin2", password="pw")
        self.editor = User.objects.create_user("va-editor-2", password="pw")
        editors, _ = Group.objects.get_or_create(name="Editors")
        editors.permissions.add(Permission.objects.get(codename="review_contribution"))
        self.editor.groups.add(editors)

        audit = {"created_by": self.admin, "modified_by": self.admin}
        self.region = Region.objects.create(name="Virginia", abbrev="VA", region_tier="STATE", **audit)
        collection = Collection.objects.create(name="Virginia Collection", region=self.region, **audit)
        CollectionAssignment.objects.create(user=self.editor, collection=collection, **audit)
        post_office = PostOffice.objects.create(name="Fetterman", **audit)
        PostOfficeRegion.objects.create(post_office=post_office, region=self.region, **audit)
        self.marking = Marking.objects.create(
            code="ASCC1-VA-M0002", type="TOWNMARK", inscription_txt="FETTERMAN VA",
            is_manuscript=False, post_office=post_office, **audit,
        )
        self.other_marking = Marking.objects.create(
            code="ASCC1-VA-M0003", type="TOWNMARK", inscription_txt="FETTERMAN VA 2",
            is_manuscript=False, post_office=post_office, **audit,
        )
        self.cover = Cover.objects.create(code="ASCC1-VA-C0002", type="FC", **audit)
        self.link = CoverMarking.objects.create(
            cover=self.cover, marking=self.marking,
            review_status=CoverMarking.REVIEW_APPROVED, **audit,
        )
        # The whole-cover scan sits on the Cover; the Marking has no image.
        path = Path(MEDIA_ROOT) / "va/cover-front.jpg"
        path.parent.mkdir(parents=True, exist_ok=True)
        PILImage.new("RGB", (400, 200), color=(190, 170, 140)).save(path)
        self.source = Image.objects.create(
            subject_type=Image.SUBJECT_COVER, subject_id=self.cover.pk,
            original_filename="cover-front.jpg", storage_filename="va/cover-front.jpg",
            file_checksum="seed", mime_type="image/jpeg", image_width=400, image_height=200,
            file_size_bytes=path.stat().st_size, image_view="FRONT", display_order=0,
            uploaded_by=self.admin, **audit,
        )

    def _crop_into(self, marking_id, **body):
        payload = {"x": 10, "y": 20, "width": 100, "height": 80,
                   "subject_type": "MARKING", "subject_id": marking_id}
        payload.update(body)
        return self.client.post(f"/api/v2/images/{self.source.pk}/crop/", payload, format="json")

    def test_editor_crops_the_marking_out_of_the_cover_into_the_imageless_marking(self):
        self.client.force_authenticate(self.editor)

        response = self._crop_into(self.marking.pk)

        self.assertEqual(response.status_code, 201, response.data)
        cropped = Image.objects.get(pk=response.data["image_id"])
        self.assertEqual((cropped.subject_type, cropped.subject_id), (Image.SUBJECT_MARKING, self.marking.pk))
        self.assertEqual(cropped.image_view, "FULL")
        self.assertEqual(cropped.display_order, 0)
        self.assertEqual(cropped.cropped_from_id, self.source.pk)
        # The original stays on the cover, untouched.
        self.source.refresh_from_db()
        self.assertEqual((self.source.subject_type, self.source.subject_id), (Image.SUBJECT_COVER, self.cover.pk))
        self.assertEqual(Image.objects.filter(subject_type=Image.SUBJECT_COVER, subject_id=self.cover.pk).count(), 1)

    def test_destination_must_be_an_approved_association(self):
        self.client.force_authenticate(self.editor)

        unlinked = self._crop_into(self.other_marking.pk)
        self.assertEqual(unlinked.status_code, 400, unlinked.data)

        CoverMarking.objects.create(
            cover=self.cover, marking=self.other_marking,
            review_status=CoverMarking.REVIEW_PENDING,
            created_by=self.admin, modified_by=self.admin,
        )
        pending = self._crop_into(self.other_marking.pk)
        self.assertEqual(pending.status_code, 400, pending.data)
        self.assertEqual(Image.objects.filter(cropped_from=self.source).count(), 0)

    def test_destination_must_have_no_image(self):
        self.client.force_authenticate(self.editor)
        Image.objects.create(
            subject_type=Image.SUBJECT_MARKING, subject_id=self.marking.pk,
            original_filename="x.jpg", storage_filename="va/x.jpg", file_checksum="x",
            mime_type="image/jpeg", image_width=10, image_height=10, file_size_bytes=1,
            image_view="FULL", display_order=0, uploaded_by=self.admin,
            created_by=self.admin, modified_by=self.admin,
        )

        response = self._crop_into(self.marking.pk)

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("already has an image", response.data["detail"])
        self.assertEqual(Image.objects.filter(cropped_from=self.source).count(), 0)

    def test_a_cover_view_is_rejected_for_a_marking_destination_before_any_write(self):
        self.client.force_authenticate(self.editor)
        before = {p.name for p in (Path(MEDIA_ROOT) / "va").iterdir()}

        response = self._crop_into(self.marking.pk, image_view="FRONT")

        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual({p.name for p in (Path(MEDIA_ROOT) / "va").iterdir()}, before)

    def test_editor_of_another_state_cannot_crop_into_the_marking(self):
        other = User.objects.create_user("md-editor-2", password="pw")
        other.groups.add(Group.objects.get(name="Editors"))
        audit = {"created_by": self.admin, "modified_by": self.admin}
        md_region = Region.objects.create(name="Maryland", abbrev="MD", region_tier="STATE", **audit)
        md_collection = Collection.objects.create(name="Maryland Collection", region=md_region, **audit)
        CollectionAssignment.objects.create(user=other, collection=md_collection, **audit)
        self.client.force_authenticate(other)

        response = self._crop_into(self.marking.pk)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(Image.objects.filter(cropped_from=self.source).count(), 0)
