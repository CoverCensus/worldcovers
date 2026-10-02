"""Keep JSON and form parsing within Django's request body size limit."""

from django.core.exceptions import RequestDataTooBig
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory
from rest_framework.views import APIView


@override_settings(DATA_UPLOAD_MAX_MEMORY_SIZE=64)
class RequestBodyLimitTests(SimpleTestCase):
    def test_json_and_form_size_limits(self):
        factory = APIRequestFactory()
        formats = (
            ("application/json", '{"value":"', '"}'),
            ("application/x-www-form-urlencoded", "value=", ""),
        )
        for content_type, prefix, suffix in formats:
            for size in (63, 64, 65):
                with self.subTest(content_type=content_type, size=size):
                    value = "a" * (size - len(prefix) - len(suffix))
                    request = factory.generic(
                        "POST", "/", prefix + value + suffix,
                        content_type=content_type,
                    )
                    parsed_request = APIView().initialize_request(request)
                    if size > 64:
                        with self.assertRaises(RequestDataTooBig):
                            _ = parsed_request.data
                    else:
                        self.assertEqual(parsed_request.data["value"], value)
