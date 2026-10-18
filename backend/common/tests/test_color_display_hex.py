from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from rest_framework.test import APIClient

from common.models import Color, Marking, PostOffice


class ColorDisplayHexTests(TestCase):
    def setUp(self):
        self.actor = get_user_model().objects.create_user(username="color-editor")
        self.red = Color.objects.create(
            name="RED", pantone_code="keep", created_by=self.actor, modified_by=self.actor,
        )

    def test_preview_apply_and_repeat_preserve_existing_data(self):
        custom = Color.objects.create(
            name="BLUE", hex_val="#123456", created_by=self.actor, modified_by=self.actor,
        )
        unknown = Color.objects.create(
            name="UNMAPPED", created_by=self.actor, modified_by=self.actor,
        )
        call_command("set_color_display_hex", dry_run=True, stdout=StringIO())
        self.red.refresh_from_db()
        self.assertEqual(self.red.hex_val, "#FFFFFF")
        with self.assertRaises(CommandError):
            call_command("set_color_display_hex", stdout=StringIO())
        call_command("set_color_display_hex", actor=self.actor.pk, stdout=StringIO())
        self.red.refresh_from_db()
        custom.refresh_from_db()
        unknown.refresh_from_db()
        self.assertEqual(self.red.hex_val, "#C62828")
        self.assertEqual(self.red.name, "RED")
        self.assertEqual(self.red.pantone_code, "keep")
        self.assertEqual(self.red.modified_by_id, self.actor.pk)
        self.assertEqual(custom.hex_val, "#123456")
        self.assertEqual(unknown.hex_val, "#FFFFFF")
        output = StringIO()
        call_command("set_color_display_hex", actor=self.actor.pk, stdout=output)
        self.assertIn("Updated 0 Color records.", output.getvalue())

    def test_list_and_detail_return_stored_hex_and_handle_no_color(self):
        self.red.hex_val = "#C62828"
        self.red.save()
        office = PostOffice.objects.create(
            name="Test Town", created_by=self.actor, modified_by=self.actor,
        )
        marking = Marking.objects.create(
            type="TOWNMARK", inscription_txt="TEST", is_manuscript=True,
            color=self.red, post_office=office, created_by=self.actor, modified_by=self.actor,
        )
        client = APIClient()
        for color, expected_hex, expected_name in [(self.red, "#C62828", "RED"), (None, "", "")]:
            marking.color = color
            marking.save()
            for path in ["/api/v2/markings/", f"/api/v2/markings/{marking.pk}/"]:
                response = client.get(path)
                self.assertEqual(response.status_code, 200)
                row = response.data["results"][0] if "results" in response.data else response.data
                self.assertEqual(row["color_hex"], expected_hex)
                self.assertEqual(row["color_name"], expected_name)
