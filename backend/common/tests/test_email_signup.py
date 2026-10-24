"""Exercise real allauth browser views and every remaining login path."""
import importlib
import re
from datetime import timedelta
from unittest.mock import patch
from urllib.parse import unquote

from django.apps import apps
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.contrib.auth.models import Group
from django.core import mail
from django.core.cache import cache
from django.db import connection
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from allauth.account.models import EmailAddress
from common.account_access import LEGACY_EMAIL_GROUP
from common.models import CollectionAssignment


User = get_user_model()
PASSWORD = "CorrectHorse1!"
AUTH = "/api/v2/auth/"


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class EmailSignupTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = Client()

    def post(self, path, data, client=None):
        return (client or self.client).post(path, data, content_type="application/json")

    def signup(self, email="new@example.com", **extra):
        return self.post(AUTH + "signup", {
            "email": email, "password": PASSWORD,
            "first_name": "New", "last_name": "Collector", **extra,
        })

    def key(self):
        return unquote(re.search(r"verify-email\?key=([^\s]+)", mail.outbox[-1].body).group(1))

    def login(self, email="new@example.com", client=None):
        return self.post(AUTH + "login", {"email": email, "password": PASSWORD}, client)

    def test_signup_confirmation_and_contributor_login(self):
        response = self.signup()
        self.assertEqual(response.status_code, 401, response.content)
        self.assertIn({"id": "verify_email", "is_pending": True}, response.json()["data"]["flows"])
        user = User.objects.get(email="new@example.com")
        self.assertEqual((user.first_name, user.last_name), ("New", "Collector"))
        self.assertTrue(user.check_password(PASSWORD))
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff or user.is_superuser)
        self.assertEqual(list(user.groups.values_list("name", flat=True)), ["Contributors"])
        self.assertFalse(CollectionAssignment.objects.filter(user=user).exists())
        self.assertNotIn("_auth_user_id", self.client.session)
        self.assertEqual(len(mail.outbox), 1)
        mail.outbox[0].body.encode("ascii")
        key = self.key()
        other = Client()
        self.assertEqual(other.get(AUTH + "email/verify", HTTP_X_EMAIL_VERIFICATION_KEY=key).status_code, 200)
        self.assertFalse(EmailAddress.objects.get(user=user).verified)
        confirmed = self.post(AUTH + "email/verify", {"key": key}, other)
        self.assertEqual(confirmed.status_code, 401, confirmed.content)
        self.assertTrue(EmailAddress.objects.get(user=user).verified)
        self.assertNotIn("_auth_user_id", other.session)
        self.assertEqual(self.post(AUTH + "email/verify", {"key": key}, other).status_code, 400)
        self.assertEqual(self.login(client=other).status_code, 200)
        payload = other.get("/api/v2/me/").json()["user"]
        self.assertEqual(payload["role"], "contributor")

    def test_invalid_and_expired_links(self):
        self.signup()
        key = self.key()
        self.assertEqual(self.post(AUTH + "email/verify", {"key": "bad"}).status_code, 400)
        with patch("django.core.signing.time.time", return_value=(timezone.now() + timedelta(days=4)).timestamp()):
            self.assertEqual(self.post(AUTH + "email/verify", {"key": key}).status_code, 400)
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_all_login_paths_block_unverified_accounts(self):
        self.signup()
        self.assertEqual(self.login().status_code, 401)
        for path in ["/api/v2/login/", "/api/login/", "/api/login"]:
            response = self.post(path, {"email": "new@example.com", "password": PASSWORD})
            self.assertEqual(response.status_code, 403, response.content)
            self.assertEqual(response.json()["code"], "email_verification_required")
        user = User.objects.get(email="new@example.com")
        user.is_staff = True
        user.save(update_fields=["is_staff"])
        response = self.client.post("/admin/login/", {"username": user.username, "password": PASSWORD})
        self.assertContains(response, "Verify your email")
        self.assertNotIn("_auth_user_id", self.client.session)
        self.assertEqual(self.client.get("/api-auth/login/").status_code, 404)

    def test_duplicate_signup_does_not_change_existing_account(self):
        self.signup()
        response = self.signup(first_name="Changed")
        self.assertEqual(response.status_code, 401, response.content)
        self.assertEqual(User.objects.filter(email="new@example.com").count(), 1)
        self.assertEqual(User.objects.get(email="new@example.com").first_name, "New")

    def test_rejects_privileges_and_weak_passwords(self):
        for extra in [{"is_staff": True}, {"groups": ["Editors"]}, {"password": "weak"}]:
            response = self.signup(**extra)
            self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(User.objects.filter(email="new@example.com").exists())

    def test_mail_failure_can_retry_by_login_and_rate_limit_applies(self):
        with patch("django.core.mail.message.EmailMessage.send", side_effect=OSError("offline")):
            with self.assertLogs("common.api.account", level="ERROR"):
                self.assertEqual(self.signup().status_code, 503)
        self.assertFalse(EmailAddress.objects.get(email="new@example.com").verified)
        cache.clear()
        self.assertEqual(self.login().status_code, 401)
        self.assertEqual(len(mail.outbox), 1)
        self.login()
        self.assertEqual(len(mail.outbox), 1)

    def test_csrf_is_required_and_session_primes_cookie(self):
        client = Client(enforce_csrf_checks=True)
        data = {"email": "new@example.com", "password": PASSWORD}
        self.assertEqual(self.post(AUTH + "login", data, client).status_code, 403)
        self.assertEqual(client.get(AUTH + "session").status_code, 401)
        token = client.cookies["csrftoken"].value
        response = client.post(AUTH + "signup", {
            **data, "first_name": "New", "last_name": "Collector",
        }, content_type="application/json", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 401, response.content)
        self.assertTrue(User.objects.filter(email="new@example.com").exists())

    def test_legacy_migration_keeps_access_without_verifying_email(self):
        # A data migration runs once; the existing group also makes replay safe.
        Group.objects.filter(name=LEGACY_EMAIL_GROUP).delete()
        active = User.objects.create_user("old", "old@example.com", PASSWORD)
        pending = User.objects.create_user("pending", "pending@example.com", is_active=False)
        migration = importlib.import_module("common.migrations.0024_legacy_email_verification_exemption")
        with connection.schema_editor(atomic=False) as editor:
            migration.exempt_existing_accounts(apps, editor)
        newer = User.objects.create_user("later", "later@example.com", PASSWORD)
        with connection.schema_editor(atomic=False) as editor:
            migration.exempt_existing_accounts(apps, editor)
        self.assertFalse(newer.groups.filter(name=LEGACY_EMAIL_GROUP).exists())
        self.assertTrue(pending.groups.filter(name=LEGACY_EMAIL_GROUP).exists())
        self.assertFalse(pending.is_active)
        self.assertEqual(self.login("old@example.com").status_code, 200)
        self.assertFalse(EmailAddress.objects.filter(user=active, verified=True).exists())
        self.client.logout()
        pending.set_password(PASSWORD)
        pending.save(update_fields=["password"])
        self.assertNotEqual(self.login("pending@example.com").status_code, 200)
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_verification_does_not_reactivate_suspended_account(self):
        self.signup()
        key = self.key()
        User.objects.filter(email="new@example.com").update(is_active=False)
        self.post(AUTH + "email/verify", {"key": key})
        response = self.login()
        self.assertNotEqual(response.status_code, 200)
        self.assertIn("deactivated", response.json()["detail"])
        self.assertFalse(User.objects.get(email="new@example.com").is_active)

    def test_old_request_endpoint_is_retired(self):
        response = self.post("/api/v2/login-requests/", {"email": "old-request@example.com"})
        self.assertEqual(response.status_code, 410)
        self.assertFalse(User.objects.filter(email="old-request@example.com").exists())

    def test_password_reset_does_not_bypass_verification(self):
        self.signup()
        user = User.objects.get(email="new@example.com")
        response = self.post("/api/v2/reset-password/", {
            "uid": urlsafe_base64_encode(force_bytes(user.pk)),
            "token": PasswordResetTokenGenerator().make_token(user),
            "password": "AnotherPass1!",
        })
        self.assertEqual(response.status_code, 200)
        self.assertFalse(EmailAddress.objects.get(user=user).verified)
        response = self.post(AUTH + "login", {"email": user.email, "password": "AnotherPass1!"})
        self.assertEqual(response.status_code, 401)
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_legacy_username_and_admin_login_and_pending_message(self):
        user = User.objects.create_user("staff", "staff@example.com", PASSWORD, is_staff=True)
        user.groups.add(Group.objects.get(name=LEGACY_EMAIL_GROUP))
        response = self.post(AUTH + "login", {"username": "staff", "password": PASSWORD})
        self.assertEqual(response.status_code, 200)
        self.client.logout()
        response = self.client.post("/admin/login/", {"username": "staff", "password": PASSWORD, "next": "/admin/"})
        self.assertEqual(response.status_code, 302)
        self.client.logout()
        user.is_active = False
        user.last_login = None
        user.set_unusable_password()
        user.save()
        response = self.login(user.email)
        self.assertEqual(response.status_code, 403)
        self.assertIn("waiting for approval", response.json()["detail"])

    def test_selected_routes_only_and_json_validation(self):
        for data in [[], "text", None]:
            response = self.post(AUTH + "signup", data)
            self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get(AUTH + "account/email").status_code, 404)
        self.assertRedirects(self.client.get("/accounts/login/"), "/auth", fetch_redirect_response=False)
        self.assertRedirects(self.client.get("/accounts/signup/"), "/auth", fetch_redirect_response=False)
