import hashlib
import io
import tempfile
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from PIL import Image, ImageCms, ImageOps, PngImagePlugin

from common.api.v2.views import _save_contribution_image
from common.images import crop_image_bytes, extract_image_metadata, normalize_image_upload


class ImageFormatTests(SimpleTestCase):
    def test_tiff_upload_is_not_accepted(self):
        self.assertIsNone(
            extract_image_metadata(b"II*\x00", "image/tiff")
        )


class ImageUploadNormalizationTests(SimpleTestCase):
    def _jpeg(self) -> bytes:
        image = Image.new("RGB", (80, 60), "red")
        image.paste("blue", (0, 30, 80, 60))
        exif = Image.Exif()
        exif[274] = 6
        exif[315] = "Scan contributor"
        exif[33432] = "Scan credit"
        exif[256], exif[257] = image.size
        exif[282], exif[283], exif[296] = 300, 600, 2
        profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
        output = io.BytesIO()
        image.save(output, format="JPEG", exif=exif, icc_profile=profile, dpi=(300, 600),
                   xmp=b'<x:xmpmeta xmlns:x="adobe:ns:meta/" tiff:Orientation="6">credit</x:xmpmeta>')
        return output.getvalue()

    def test_jpeg_pixels_orientation_and_useful_metadata_are_preserved(self):
        content = self._jpeg()
        with Image.open(io.BytesIO(content)) as source:
            expected = ImageOps.exif_transpose(source)
            normalized = normalize_image_upload(content, "image/jpeg")
            with Image.open(io.BytesIO(normalized)) as result:
                self.assertEqual(result.format, "PNG")
                self.assertEqual(result.size, (60, 80))
                self.assertEqual(result.tobytes(), expected.tobytes())
                self.assertEqual(result.info["icc_profile"], source.info["icc_profile"])
                self.assertIsNone(result.getexif().get(274))
                self.assertEqual(result.getexif()[315], "Scan contributor")
                self.assertEqual(result.getexif()[33432], "Scan credit")
                self.assertEqual((result.getexif()[256], result.getexif()[257]), result.size)
                self.assertEqual((result.getexif()[282], result.getexif()[283]), (600, 300))
                self.assertEqual(tuple(round(v) for v in result.info["dpi"]), (600, 300))
                xmp = result.info["XML:com.adobe.xmp"]
                self.assertIn("credit", xmp)
                self.assertNotIn('tiff:Orientation="6"', xmp)

    def test_normalizing_again_keeps_pixels_and_metadata(self):
        first = normalize_image_upload(self._jpeg(), "image/jpeg")
        second = normalize_image_upload(first, "image/png")
        with Image.open(io.BytesIO(first)) as before, Image.open(io.BytesIO(second)) as after:
            self.assertEqual(after.tobytes(), before.tobytes())
            self.assertEqual(after.getexif(), before.getexif())
            self.assertEqual(after.info["icc_profile"], before.info["icc_profile"])

    def test_png_keeps_transparency_text_and_gamma(self):
        source = Image.new("RGBA", (12, 10), (40, 80, 120, 100))
        text = PngImagePlugin.PngInfo()
        text.add_text("Copyright", "Scan credit")
        text.add(b"gAMA", b"\x00\x00\xb1\x8f")
        output = io.BytesIO()
        source.save(output, format="PNG", pnginfo=text)
        normalized = normalize_image_upload(output.getvalue(), "image/png")
        with Image.open(io.BytesIO(normalized)) as result:
            self.assertEqual(result.mode, "RGBA")
            self.assertEqual(result.tobytes(), source.tobytes())
            self.assertEqual(result.info["Copyright"], "Scan credit")
            self.assertEqual(result.info["gamma"], 0.45455)

    def test_cmyk_jpeg_can_be_saved_as_png(self):
        source = Image.new("CMYK", (12, 10), (0, 128, 128, 0))
        output = io.BytesIO()
        source.save(output, format="JPEG")
        normalized = normalize_image_upload(output.getvalue(), "image/jpeg")
        with Image.open(io.BytesIO(normalized)) as result:
            self.assertEqual(result.format, "PNG")
            self.assertEqual(result.mode, "RGB")

    def test_crop_of_jpeg_has_no_additional_compression_loss(self):
        content = self._jpeg()
        cropped = crop_image_bytes(content, "image/jpeg", (5, 5, 20, 30))
        with Image.open(io.BytesIO(content)) as source, Image.open(io.BytesIO(cropped)) as result:
            expected = ImageOps.exif_transpose(source).crop((5, 5, 25, 35))
            self.assertEqual(result.format, "PNG")
            self.assertEqual(result.tobytes(), expected.tobytes())

    def test_invalid_or_unsupported_upload_is_rejected(self):
        for content, mime_type in ((b"broken", "image/jpeg"), (b"II*\x00", "image/tiff")):
            with self.subTest(mime_type=mime_type), self.assertRaises(ValueError):
                normalize_image_upload(content, mime_type)
        output = io.BytesIO()
        Image.new("RGB", (12, 10)).save(output, format="BMP")
        with self.assertRaises(ValueError):
            normalize_image_upload(output.getvalue(), "image/png")

    def test_contribution_upload_stores_png_and_recomputes_metadata(self):
        upload = SimpleUploadedFile("scan.jpg", self._jpeg(), content_type="image/jpeg")
        with tempfile.TemporaryDirectory() as media, self.settings(MEDIA_ROOT=media):
            metadata = _save_contribution_image(upload, "WV")
            self.assertEqual(metadata["original_filename"], "scan.jpg")
            self.assertTrue(metadata["storage_filename"].endswith(".png"))
            content = (Path(media) / metadata["storage_filename"]).read_bytes()
            self.assertEqual(metadata["mime_type"], "image/png")
            self.assertEqual((metadata["image_width"], metadata["image_height"]), (60, 80))
            self.assertEqual(metadata["file_size_bytes"], len(content))
            self.assertEqual(metadata["file_checksum"], hashlib.sha256(content).hexdigest())

    def test_invalid_contribution_upload_writes_nothing(self):
        upload = SimpleUploadedFile("scan.jpg", b"broken", content_type="image/jpeg")
        with tempfile.TemporaryDirectory() as media, self.settings(MEDIA_ROOT=media):
            self.assertIsNone(_save_contribution_image(upload, "WV"))
            self.assertEqual(list(Path(media).rglob("*")), [])
