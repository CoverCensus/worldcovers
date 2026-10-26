"""Manual Postmaster entry through the API (Trello T71).

Both viewsets were read-only. Writes now follow the DateSeen shape: public
reads, Editor role plus responsibility for the office's region on tenures,
one audited SubmissionTransaction per write, no DELETE. Rows created here are
MANUAL rows; an edited IMPORT row keeps its origin and is logged.

Setup follows test_date_seen_permissions.py: a VA-assigned editor, an
unassigned MD region, a contributor and a superuser.
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import TestCase
from rest_framework.test import APIClient

from common.models import (
    Collection,
    CollectionAssignment,
    PostOffice,
    PostOfficeRegion,
    Postmaster,
    PostmasterTenure,
    Region,
    SubmissionTransaction,
)

User = get_user_model()
TENURES = "/api/v2/postmaster-tenures/"
PEOPLE = "/api/v2/postmasters/"


class PostmasterApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="pw")
        self.stamp = {"created_by": self.admin, "modified_by": self.admin}
        self.contributor = User.objects.create_user(username="contributor", password="pw")
        self.editor = User.objects.create_user(username="editor", password="pw")
        editors = Group.objects.create(name="Editors")
        editors.permissions.add(Permission.objects.get(codename="review_contribution"))
        self.editor.groups.add(editors)

        virginia = Region.objects.create(name="Virginia", abbrev="VA", region_tier="STATE", **self.stamp)
        maryland = Region.objects.create(name="Maryland", abbrev="MD", region_tier="STATE", **self.stamp)
        va_collection = Collection.objects.create(name="Virginia Collection", region=virginia, **self.stamp)
        Collection.objects.create(name="Maryland Collection", region=maryland, **self.stamp)
        CollectionAssignment.objects.create(user=self.editor, collection=va_collection, **self.stamp)

        self.richmond = self._office("Richmond", virginia)
        self.baltimore = self._office("Baltimore", maryland)
        self.conn = Postmaster.objects.create(name="Gerrard T. Conn", sort_name="Conn, Gerrard T.", **self.stamp)
        self.imported = PostmasterTenure.objects.create(
            post_office=self.richmond, postmaster=self.conn, event="appointment",
            date_appointed=date(1793, 4, 25), date_appointed_granularity="DAY",
            source_ref="T3:r15904", rules_version=2, **self.stamp)

    def _office(self, name, region):
        office = PostOffice.objects.create(name=name, **self.stamp)
        PostOfficeRegion.objects.create(post_office=office, region=region, **self.stamp)
        return office

    def _event(self, office, **over):
        payload = {
            "post_office": office.pk, "postmaster": self.conn.pk, "event": "reappointment",
            "date_appointed": "1801-01-01", "date_appointed_granularity": "YEAR",
            "source_note": "Register of appointments, p. 12",
        }
        payload.update(over)
        return payload

    def _txns(self, action):
        return SubmissionTransaction.objects.filter(action=action)

    # -- roles --------------------------------------------------------------

    def test_anonymous_can_read_but_not_write(self):
        self.assertEqual(self.client.get(TENURES).status_code, 200)
        self.assertEqual(self.client.get(PEOPLE).status_code, 200)
        self.assertIn(self.client.post(TENURES, self._event(self.richmond), format="json").status_code, (401, 403))
        self.assertIn(self.client.patch(f"{PEOPLE}{self.conn.pk}/", {"name": "x"}, format="json").status_code, (401, 403))

    def test_contributor_cannot_write(self):
        self.client.force_authenticate(self.contributor)
        self.assertEqual(self.client.post(TENURES, self._event(self.richmond), format="json").status_code, 403)
        self.assertEqual(self.client.post(PEOPLE, {"name": "Someone"}, format="json").status_code, 403)
        self.assertEqual(PostmasterTenure.objects.count(), 1)

    def test_scoped_editor_adds_event_in_own_region(self):
        self.client.force_authenticate(self.editor)
        response = self.client.post(TENURES, self._event(self.richmond), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        row = PostmasterTenure.objects.get(pk=response.data["tenure_id"])
        self.assertEqual(row.origin, "MANUAL")
        self.assertEqual(row.source_ref, "")
        self.assertEqual(row.source_note, "Register of appointments, p. 12")
        self.assertEqual(row.created_by, self.editor)
        self.assertEqual(response.data["origin"], "MANUAL")
        txns = self._txns(SubmissionTransaction.ACTION_POSTMASTER_EVENT_ADDED)
        self.assertEqual(txns.count(), 1)
        txn = txns.get()
        self.assertEqual(txn.actor, self.editor)
        self.assertEqual(txn.extra_payload["tenure_id"], row.pk)
        self.assertEqual(txn.extra_payload["post_office_id"], self.richmond.pk)
        self.assertEqual(txn.after_payload["origin"], "MANUAL")

    def test_editor_outside_region_is_refused(self):
        self.client.force_authenticate(self.editor)
        self.assertEqual(self.client.post(TENURES, self._event(self.baltimore), format="json").status_code, 403)
        md_row = PostmasterTenure.objects.create(
            post_office=self.baltimore, postmaster=self.conn, event="appointment", **self.stamp)
        self.assertEqual(
            self.client.patch(f"{TENURES}{md_row.pk}/", {"source_note": "x"}, format="json").status_code, 403)
        # Moving a VA row onto an MD office is refused against the NEW office.
        response = self.client.patch(
            f"{TENURES}{self.imported.pk}/", {"post_office": self.baltimore.pk}, format="json")
        self.assertEqual(response.status_code, 403)
        self.imported.refresh_from_db()
        self.assertEqual(self.imported.post_office, self.richmond)
        self.assertEqual(PostmasterTenure.objects.count(), 2)

    def test_superuser_bypasses_region(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(TENURES, self._event(self.baltimore), format="json").status_code, 201)

    # -- data rules ---------------------------------------------------------

    def test_editing_imported_row_keeps_origin_and_logs(self):
        self.client.force_authenticate(self.editor)
        response = self.client.patch(
            f"{TENURES}{self.imported.pk}/",
            {"date_appointed": "1794-01-01", "date_appointed_granularity": "YEAR",
             "source_note": "Corrected against the 1794 register"},
            format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.imported.refresh_from_db()
        self.assertEqual(self.imported.origin, "IMPORT")
        self.assertEqual(self.imported.source_ref, "T3:r15904")
        self.assertEqual(self.imported.date_appointed, date(1794, 1, 1))
        txn = self._txns(SubmissionTransaction.ACTION_POSTMASTER_EVENT_CHANGED).get()
        self.assertIn("date_appointed", [d["field"] for d in txn.diff_payload])
        self.assertEqual(txn.before_payload["date_appointed"], "1793-04-25")

    def test_duplicate_office_event_with_nulls_is_400(self):
        self.client.force_authenticate(self.editor)
        closure = self._event(self.richmond, postmaster=None, event="discontinued",
                              date_appointed=None, date_appointed_granularity=None)
        self.assertEqual(self.client.post(TENURES, closure, format="json").status_code, 201)
        response = self.client.post(TENURES, closure, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("non_field_errors", response.data)
        self.assertEqual(PostmasterTenure.objects.filter(event="discontinued").count(), 1)

    def _refused(self, payload, field):
        response = self.client.post(TENURES, payload, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn(field, response.data)

    def test_date_source_and_person_rules(self):
        self.client.force_authenticate(self.editor)
        self._refused(self._event(self.richmond, date_appointed_granularity=None), "date_appointed_granularity")
        self._refused(self._event(self.richmond, date_appointed=None), "date_appointed")
        self._refused(self._event(self.richmond, postmaster=None, event="appointment"), "postmaster")
        self._refused(self._event(self.richmond, source_note=""), "source_note")
        # A YEAR-precision date is stored as 1 January, whatever day was sent.
        response = self.client.post(
            TENURES, self._event(self.richmond, date_appointed="1801-06-15", date_appointed_granularity="YEAR"), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["date_appointed"], "1801-01-01")

    def test_update_rules_follow_the_effective_row(self):
        self.client.force_authenticate(self.editor)
        # Dropping the person from an appointment is refused on update too.
        response = self.client.patch(f"{TENURES}{self.imported.pk}/", {"postmaster": None}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("postmaster", response.data)
        # A MANUAL row keeps needing its source note.
        created = self.client.post(TENURES, self._event(self.richmond), format="json")
        self.assertEqual(created.status_code, 201, created.data)
        response = self.client.patch(f"{TENURES}{created.data['tenure_id']}/", {"source_note": ""}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("source_note", response.data)
        # An imported person-less row still takes a note-only correction.
        closure = PostmasterTenure.objects.create(
            post_office=self.richmond, postmaster=None, event="discontinued",
            source_ref="T3:r2", rules_version=2, **self.stamp)
        response = self.client.patch(f"{TENURES}{closure.pk}/", {"source_note": "Checked"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)

    def test_any_editor_adds_and_renames_person_never_merging(self):
        self.client.force_authenticate(self.editor)
        response = self.client.post(PEOPLE, {"name": "John Q. Public"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["sort_name"], "Public, John Q.")
        # Same name again is a second person: identity is never inferred from a name.
        self.assertEqual(self.client.post(PEOPLE, {"name": "John Q. Public"}, format="json").status_code, 201)
        self.assertEqual(Postmaster.objects.filter(name="John Q. Public").count(), 2)
        renamed = self.client.patch(f"{PEOPLE}{response.data['id']}/", {"name": "John Quincy Public"}, format="json")
        self.assertEqual(renamed.status_code, 200)
        # A PATCH that omits sort_name leaves the stored value alone.
        self.assertEqual(renamed.data["sort_name"], "Public, John Q.")
        # A derived sort name never overflows the column.
        long_name = "A" * 249 + " " + "B" * 5
        self.assertEqual(len(self.client.post(PEOPLE, {"name": long_name}, format="json").data["sort_name"]), 255)
        self.assertEqual(self._txns(SubmissionTransaction.ACTION_POSTMASTER_ADDED).count(), 3)
        self.assertEqual(self._txns(SubmissionTransaction.ACTION_POSTMASTER_CHANGED).count(), 1)
        self.assertEqual(self.client.delete(f"{PEOPLE}{self.conn.pk}/").status_code, 405)
        self.assertEqual(self.client.delete(f"{TENURES}{self.imported.pk}/").status_code, 405)
