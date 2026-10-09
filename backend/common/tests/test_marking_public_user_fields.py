"""
Issue #178 / Trello T78 -- public marking detail must not identify users.

Anonymous ``GET /api/v2/markings/<id>/`` used to nest whole ``User`` objects
(username, email, is_staff, is_superuser) under ``created_by`` and
``modified_by``. Nothing on the client read them, and they identified
contributors who had opted out of credit. The only public identity a marking
may carry is the opt-in ``submitter_name``.
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import TestCase
from rest_framework.test import APIClient

from common.models import (
    Collection,
    CollectionAssignment,
    Color,
    Marking,
    PostOffice,
    PostOfficeRegion,
    Region,
)


User = get_user_model()

FORBIDDEN_KEYS = {"created_by", "modified_by", "email", "is_staff", "is_superuser"}


def _collect(payload, keys=None, values=None):
    """Walk a serialized response and gather every key and scalar value."""
    keys = set() if keys is None else keys
    values = set() if values is None else values
    if isinstance(payload, dict):
        for key, value in payload.items():
            keys.add(key)
            _collect(value, keys, values)
    elif isinstance(payload, (list, tuple)):
        for item in payload:
            _collect(item, keys, values)
    elif isinstance(payload, str):
        values.add(payload)
    return keys, values


class MarkingPublicUserFieldsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            "admin", email="admin-secret@example.com", password="pw",
            first_name="Ada", last_name="Admin",
        )
        self.editor = User.objects.create_user("editor", password="pw")
        editors_group = Group.objects.create(name="Editors")
        editors_group.permissions.add(
            Permission.objects.get(codename="review_contribution")
        )
        self.editor.groups.add(editors_group)

        region = Region.objects.create(
            name="Virginia", abbrev="VA", region_tier="STATE",
            created_by=self.admin, modified_by=self.admin,
        )
        collection = Collection.objects.create(
            name="Virginia Collection", region=region,
            created_by=self.admin, modified_by=self.admin,
        )
        CollectionAssignment.objects.create(
            user=self.editor, collection=collection,
            created_by=self.admin, modified_by=self.admin,
        )
        color = Color.objects.create(
            name="Black", created_by=self.admin, modified_by=self.admin
        )
        post_office = PostOffice.objects.create(
            name="Richmond", created_by=self.admin, modified_by=self.admin
        )
        PostOfficeRegion.objects.create(
            post_office=post_office, region=region,
            created_by=self.admin, modified_by=self.admin,
        )
        self.opted_out = Marking.objects.create(
            type="TOWNMARK", catalog_txt="RICHMOND", inscription_txt="RICHMOND",
            desc="", is_manuscript=True, color=color, post_office=post_office,
            display_submitter_name=False,
            created_by=self.admin, modified_by=self.admin,
        )
        self.opted_in = Marking.objects.create(
            type="TOWNMARK", catalog_txt="RICHMOND Va.", inscription_txt="RICHMOND Va.",
            desc="", is_manuscript=True, color=color, post_office=post_office,
            display_submitter_name=True,
            created_by=self.admin, modified_by=self.admin,
        )

    def _assert_no_user_identity(self, response):
        self.assertEqual(response.status_code, 200)
        keys, values = _collect(response.data)
        self.assertFalse(keys & FORBIDDEN_KEYS, keys & FORBIDDEN_KEYS)
        self.assertNotIn(self.admin.email, values)

    def test_anonymous_detail_has_no_user_identity(self):
        self._assert_no_user_identity(
            self.client.get(f"/api/v2/markings/{self.opted_out.id}/")
        )

    def test_editor_detail_has_no_user_object_either(self):
        self.client.force_authenticate(self.editor)
        self._assert_no_user_identity(
            self.client.get(f"/api/v2/markings/{self.opted_out.id}/")
        )

    def test_submitter_name_honours_opt_in(self):
        opted_in = self.client.get(f"/api/v2/markings/{self.opted_in.id}/")
        self.assertEqual(opted_in.data["submitter_name"], "Ada Admin")

        opted_out = self.client.get(f"/api/v2/markings/{self.opted_out.id}/")
        self.assertIsNone(opted_out.data["submitter_name"])
        # Opting out must not leave the name reachable anywhere else either.
        _, values = _collect(opted_out.data)
        self.assertNotIn("Ada Admin", values)
        self.assertNotIn("admin", values)
