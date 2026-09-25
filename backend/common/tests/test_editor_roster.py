"""The editors-only roster (Trello T46, issues.md 177).

Ian, 2026-09-23: "It wouldn't hurt to have a listing of the editors that is
viewable only by the editors." Built live from CollectionAssignment, so it can
never show a proposed appointment, and gated to editors, so a contributor or a
guest never sees an email address.
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import TestCase
from rest_framework.test import APIClient

from common.models import Collection, CollectionAssignment, Region

User = get_user_model()


class EditorRosterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser("admin", "admin@example.com", "pw")
        self.contributor = User.objects.create_user("contributor", password="pw")
        self.va_editor = User.objects.create_user(
            "vaeditor", email="va@example.com", password="pw",
            first_name="Vera", last_name="Adams")
        self.md_editor = User.objects.create_user(
            "mdeditor", email="md@example.com", password="pw")
        self.former = User.objects.create_user(
            "former", email="former@example.com", password="pw", is_active=False)
        self.unassigned = User.objects.create_user(
            "reviewer", email="reviewer@example.com", password="pw")
        group = Group.objects.create(name="Editors")
        group.permissions.add(Permission.objects.get(codename="review_contribution"))
        self.unassigned.groups.add(group)  # role without a state: not a state editor

        self.va = self._collection("Virginia", "VA")
        self.md = self._collection("Maryland", "MD")
        self.closed = self._collection("Old Dominion", "OD", is_active=False)
        for user, coll in ((self.va_editor, self.va), (self.md_editor, self.md),
                           (self.md_editor, self.va), (self.former, self.va),
                           (self.va_editor, self.closed)):
            CollectionAssignment.objects.create(
                user=user, collection=coll, created_by=self.admin, modified_by=self.admin)

    def _collection(self, name, abbrev, is_active=True):
        region = Region.objects.create(
            code=f"USA-{abbrev}1", name=name, abbrev=abbrev, region_tier="STATE",
            created_by=self.admin, modified_by=self.admin)
        return Collection.objects.create(
            name=name, region=region, is_active=is_active,
            created_by=self.admin, modified_by=self.admin)

    def _get(self, user=None):
        if user is not None:
            self.client.force_authenticate(user)
        return self.client.get("/api/v2/editor-roster/")

    # ------------------------------------------------------------ access

    def test_anonymous_and_contributor_get_403(self):
        self.assertEqual(self._get().status_code, 403)
        self.assertEqual(self._get(self.contributor).status_code, 403)

    def test_editor_and_admin_get_200(self):
        self.assertEqual(self._get(self.va_editor).status_code, 200)
        self.assertEqual(self._get(self.admin).status_code, 200)

    # ------------------------------------------------------------ content

    def test_roster_is_grouped_by_state_with_name_email_and_states(self):
        rows = self._get(self.va_editor).json()
        by_state = {r["abbrev"]: r for r in rows}
        self.assertEqual(list(by_state), ["MD", "VA"])  # ordered by state name
        va = by_state["VA"]
        self.assertEqual(va["name"], "Virginia")
        names = [e["display_name"] for e in va["editors"]]
        # Full name when known, username otherwise; ordered by display name.
        self.assertEqual(names, ["mdeditor", "Vera Adams"])
        vera = next(e for e in va["editors"] if e["display_name"] == "Vera Adams")
        self.assertEqual(vera["email"], "va@example.com")
        self.assertEqual(vera["states"], ["VA"])
        md_in_va = next(e for e in va["editors"] if e["display_name"] == "mdeditor")
        self.assertEqual(md_in_va["states"], ["MD", "VA"])

    def test_inactive_users_inactive_collections_and_unassigned_roles_are_left_out(self):
        rows = self._get(self.admin).json()
        everyone = {e["display_name"] for r in rows for e in r["editors"]}
        self.assertNotIn("former", everyone)          # is_active=False
        self.assertNotIn("reviewer", everyone)        # Editors group, no assignment
        self.assertNotIn("admin", everyone)           # superuser without a state
        self.assertNotIn("OD", {r["abbrev"] for r in rows})  # inactive collection

    # ------------------------------ the existing leak, closed in the same PR

    def test_collection_editors_endpoint_no_longer_lists_emails_to_contributors(self):
        self.client.force_authenticate(self.contributor)
        res = self.client.get(f"/api/v2/collections/{self.va.pk}/editors/")
        self.assertEqual(res.status_code, 403)
        self.client.force_authenticate(self.va_editor)
        res = self.client.get(f"/api/v2/collections/{self.va.pk}/editors/")
        self.assertEqual(res.status_code, 200)
