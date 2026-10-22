"""Site identity and the pending login-request list (Trello T84).

Eight people requested logins on woco.dev instead of hellowoco.app and nobody
noticed, because a login request is only an inactive User row and nothing
reports new rows. Two endpoints fix the two halves: GET /site/ tells the SPA
which site it is on (so the test site can point requesters at production), and
GET /login-requests/pending/ shows Administrators the rows waiting on them.
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

User = get_user_model()

SITE_URL = "/api/v2/site/"
PENDING_URL = "/api/v2/login-requests/pending/"
REQUEST_URL = "/api/v2/login-requests/"


class SiteInfoTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    @override_settings(
        DJANGO_APP_HOSTNAME="woco.dev",
        WOCO_SITE_ROLE="staging",
        WOCO_PRODUCTION_URL="https://hellowoco.app",
    )
    def test_anonymous_visitor_learns_the_site_role_and_where_production_is(self):
        response = self.client.get(SITE_URL)

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            response.data,
            {"hostname": "woco.dev", "role": "staging", "production_url": "https://hellowoco.app"},
        )

    @override_settings(DJANGO_APP_HOSTNAME="hellowoco.app", WOCO_SITE_ROLE="production")
    def test_production_answers_production(self):
        self.assertEqual(self.client.get(SITE_URL).data["role"], "production")


class PendingLoginRequestsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser("admin", "admin@example.com", "pw")
        self.contributor = User.objects.create_user("contributor", password="pw")
        self.editor = User.objects.create_user("editor", password="pw")
        group = Group.objects.create(name="Editors")
        group.permissions.add(Permission.objects.get(codename="review_contribution"))
        self.editor.groups.add(group)

        # The request: what LoginRequestView creates.
        self.pending = User(
            username="newcomer@example.com", email="newcomer@example.com",
            first_name="Nina", last_name="Newcomer", is_active=False,
        )
        self.pending.set_unusable_password()
        self.pending.save()
        # Not requests: a deactivated former member, and an ordinary active account.
        User.objects.create_user(
            "former", email="former@example.com", password="pw",
            is_active=False, last_login=timezone.now(),
        )

    def _get(self, user=None):
        if user is not None:
            self.client.force_authenticate(user)
        return self.client.get(PENDING_URL)

    def test_only_a_superuser_may_list_pending_requests(self):
        self.assertIn(self._get().status_code, (401, 403))
        self.assertEqual(self._get(self.contributor).status_code, 403)
        self.assertEqual(self._get(self.editor).status_code, 403)
        self.assertEqual(self._get(self.admin).status_code, 200)

    def test_lists_never_signed_in_inactive_users_with_an_admin_link(self):
        response = self._get(self.admin)

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([row["email"] for row in response.data], ["newcomer@example.com"])
        row = response.data[0]
        self.assertEqual(row["id"], self.pending.pk)
        self.assertEqual((row["first_name"], row["last_name"]), ("Nina", "Newcomer"))
        self.assertEqual(row["admin_url"], f"/admin/auth/user/{self.pending.pk}/change/")
        self.assertIsNotNone(row["requested_at"])

    def test_a_login_request_creates_a_pending_row(self):
        """AC5: the public form still creates the inactive user this list shows."""
        response = APIClient().post(
            REQUEST_URL,
            {"first_name": "Rob", "last_name": "Requester", "email": "Rob@Example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(email="rob@example.com")
        self.assertFalse(user.is_active)
        self.assertFalse(user.has_usable_password())
        self.assertIsNone(user.last_login)
        emails = [row["email"] for row in self._get(self.admin).data]
        self.assertEqual(emails, ["rob@example.com", "newcomer@example.com"])
