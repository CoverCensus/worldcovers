from django.test import SimpleTestCase

from common.images import extract_image_metadata


class ImageFormatTests(SimpleTestCase):
    def test_tiff_upload_is_not_accepted(self):
        self.assertIsNone(
            extract_image_metadata(b"II*\x00", "image/tiff")
        )
