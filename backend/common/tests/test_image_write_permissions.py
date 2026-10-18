"""T73: image writes require responsibility for both subjects of a move."""
import hashlib
import io
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image as PILImage
from rest_framework.test import APIClient

from common.models import (
    Collection, CollectionAssignment, Cover, CoverMarking, Image,
    Marking, PostOffice, PostOfficeRegion, Region,
)


class ImageWritePermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = get_user_model().objects.create_superuser("admin")
        self.editor = get_user_model().objects.create_user("editor")
        self.contributor = get_user_model().objects.create_user("contributor")
        self.audit = {"created_by": self.admin, "modified_by": self.admin}
        self.markings = []
        for name, abbrev in (("Virginia", "VA"), ("Maryland", "MD")):
            region = Region.objects.create(name=name, abbrev=abbrev, region_tier="STATE", **self.audit)
            collection = Collection.objects.create(name=name, region=region, **self.audit)
            if abbrev == "VA":
                CollectionAssignment.objects.create(user=self.editor, collection=collection, **self.audit)
            office = PostOffice.objects.create(name=name, **self.audit)
            PostOfficeRegion.objects.create(post_office=office, region=region, **self.audit)
            self.markings.append(Marking.objects.create(
                type="TOWNMARK", inscription_txt=name, is_manuscript=True,
                post_office=office, **self.audit,
            ))
        self.owned_cover = self.cover(self.markings[0])
        self.mixed_cover = self.cover(*self.markings)
        self.unlinked_cover = self.cover()

    def cover(self, *markings):
        cover = Cover.objects.create(type="FC", **self.audit)
        for marking in markings:
            CoverMarking.objects.create(cover=cover, marking=marking, **self.audit)
        return cover

    def payload(self, kind, entry):
        return {
            "subject_type": kind, "subject_id": entry.pk,
            "image_view": "FULL" if kind == "MARKING" else "FRONT",
            "original_filename": "scan.jpg", "storage_filename": f"test/{kind}-{entry.pk}.jpg",
            "file_checksum": "test", "mime_type": "image/jpeg",
            "image_width": 10, "image_height": 10, "file_size_bytes": 10,
        }

    def image(self, kind, entry):
        return Image.objects.create(
            **self.payload(kind, entry), uploaded_by=self.admin, **self.audit
        )

    def test_editor_cannot_create_update_or_delete_outside_scope(self):
        self.client.force_authenticate(self.editor)
        for kind, entry in (("MARKING", self.markings[1]), ("COVER", self.mixed_cover),
                            ("COVER", self.unlinked_cover)):
            with self.subTest(kind=kind, entry=entry.pk):
                row = self.image(kind, entry)
                count = Image.objects.count()
                payload = {**self.payload(kind, entry), "storage_filename": "test/new.jpg"}
                response = self.client.post("/api/v2/images/", payload, format="json")
                self.assertEqual(response.status_code, 403, response.data)
                self.assertEqual(Image.objects.count(), count)
                url = f"/api/v2/images/{row.pk}/"
                for method in (self.client.patch, self.client.put):
                    response = method(url, {**self.payload(kind, entry), "image_description": "Changed"}, format="json")
                    self.assertEqual(response.status_code, 403, response.data)
                self.assertEqual(self.client.delete(url).status_code, 403)
                row.refresh_from_db()
                self.assertNotEqual(row.image_description, "Changed")

    def test_editor_cannot_move_from_or_to_unassigned_subject(self):
        self.client.force_authenticate(self.editor)
        for source_kind, source, target_kind, target in (
            ("MARKING", self.markings[0], "MARKING", self.markings[1]),
            ("MARKING", self.markings[1], "MARKING", self.markings[0]),
            ("MARKING", self.markings[0], "COVER", self.mixed_cover),
            ("COVER", self.mixed_cover, "MARKING", self.markings[0]),
            ("COVER", self.owned_cover, "COVER", self.unlinked_cover),
        ):
            with self.subTest(source=source_kind, target=target_kind):
                row = self.image(source_kind, source)
                response = self.client.patch(
                    f"/api/v2/images/{row.pk}/",
                    {"subject_type": target_kind, "subject_id": target.pk,
                     "image_view": "FULL" if target_kind == "MARKING" else "FRONT"},
                    format="json",
                )
                self.assertEqual(response.status_code, 403, response.data)
                row.refresh_from_db()
                self.assertEqual((row.subject_type, row.subject_id), (source_kind, source.pk))
                row.delete()

    def test_assigned_editor_and_administrator_can_write(self):
        for user, kind, entry in ((self.editor, "MARKING", self.markings[0]),
                                 (self.editor, "COVER", self.owned_cover),
                                 (self.admin, "MARKING", self.markings[1]),
                                 (self.admin, "COVER", self.mixed_cover),
                                 (self.admin, "COVER", self.unlinked_cover)):
            with self.subTest(user=user.username, kind=kind, entry=entry.pk):
                self.client.force_authenticate(user)
                response = self.client.post("/api/v2/images/", self.payload(kind, entry), format="json")
                self.assertEqual(response.status_code, 201, response.data)
                url = f"/api/v2/images/{response.data['image_id']}/"
                response = self.client.patch(url, {"image_description": "Caption"}, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data["image_description"], "Caption")
                self.assertEqual(self.client.delete(url).status_code, 204)

    def test_authorized_move_retains_file_and_default_order(self):
        row = self.image("MARKING", self.markings[0])
        self.client.force_authenticate(self.editor)
        response = self.client.patch(
            f"/api/v2/images/{row.pk}/",
            {"subject_type": "COVER", "subject_id": self.owned_cover.pk, "image_view": "FRONT"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        row.refresh_from_db()
        self.assertEqual(row.subject_id, self.owned_cover.pk)
        self.assertEqual(row.subject_type, "COVER")
        self.assertEqual(row.display_order, 0)
        self.assertEqual(row.storage_filename, f"test/MARKING-{self.markings[0].pk}.jpg")

    def test_guest_and_contributor_can_read_but_cannot_write(self):
        row = self.image("MARKING", self.markings[0])
        url = f"/api/v2/images/{row.pk}/"
        for user in (None, self.contributor):
            with self.subTest(user=user):
                self.client.force_authenticate(user)
                self.assertEqual(self.client.get(url).status_code, 200)
                self.assertEqual(self.client.get("/api/v2/images/").status_code, 200)
                self.assertIn(self.client.post("/api/v2/images/", self.payload("MARKING", self.markings[0]), format="json").status_code, (401, 403))
                self.assertIn(self.client.patch(url, {"image_description": "No"}, format="json").status_code, (401, 403))
                self.assertIn(self.client.delete(url).status_code, (401, 403))
                self.assertTrue(Image.objects.filter(pk=row.pk).exists())

    def test_denied_upload_does_not_write_a_file(self):
        content = io.BytesIO()
        PILImage.new("RGB", (10, 10)).save(content, format="PNG")
        self.client.force_authenticate(self.editor)
        with tempfile.TemporaryDirectory() as media, self.settings(MEDIA_ROOT=media):
            response = self.client.post("/api/v2/images/", {
                "subject_type": "MARKING", "subject_id": self.markings[1].pk,
                "image_view": "FULL",
                "file": SimpleUploadedFile("scan.png", content.getvalue(), content_type="image/png"),
            }, format="multipart")
            self.assertEqual(response.status_code, 403, response.data)
            self.assertEqual(list(Path(media).rglob("*")), [])

    def test_multipart_upload_stores_upright_png(self):
        source = PILImage.new("RGB", (80, 60), "blue")
        exif = PILImage.Exif()
        exif[274] = 6
        content = io.BytesIO()
        source.save(content, format="JPEG", exif=exif)
        self.client.force_authenticate(self.editor)
        with tempfile.TemporaryDirectory() as media, self.settings(MEDIA_ROOT=media):
            response = self.client.post("/api/v2/images/", {
                "subject_type": "MARKING", "subject_id": self.markings[0].pk,
                "image_view": "FULL",
                "file": SimpleUploadedFile("scan.jpg", content.getvalue(), content_type="image/jpeg"),
            }, format="multipart")
            self.assertEqual(response.status_code, 201, response.data)
            row = Image.objects.get(pk=response.data["image_id"])
            self.assertEqual(row.original_filename, "scan.jpg")
            self.assertEqual(row.mime_type, "image/png")
            self.assertTrue(row.storage_filename.endswith(".png"))
            stored = (Path(media) / row.storage_filename).read_bytes()
            self.assertEqual(row.file_checksum, hashlib.sha256(stored).hexdigest())
            self.assertEqual(row.file_size_bytes, len(stored))
            self.assertEqual((row.image_width, row.image_height), (60, 80))
            with PILImage.open(io.BytesIO(stored)) as result:
                self.assertEqual(result.format, "PNG")
                self.assertIsNone(result.getexif().get(274))

    def test_invalid_multipart_upload_writes_nothing(self):
        self.client.force_authenticate(self.editor)
        count = Image.objects.count()
        with tempfile.TemporaryDirectory() as media, self.settings(MEDIA_ROOT=media):
            response = self.client.post("/api/v2/images/", {
                "subject_type": "MARKING", "subject_id": self.markings[0].pk,
                "image_view": "FULL",
                "file": SimpleUploadedFile("scan.jpg", b"broken", content_type="image/jpeg"),
            }, format="multipart")
            self.assertEqual(response.status_code, 400, response.data)
            self.assertEqual(Image.objects.count(), count)
            self.assertEqual(list(Path(media).rglob("*")), [])
