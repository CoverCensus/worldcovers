"""Account failures observed during the October 24 local audit."""
from io import StringIO
from unittest.mock import patch

from allauth.account.adapter import get_adapter
from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.test import Client, RequestFactory, TestCase, override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from common.account_access import LEGACY_EMAIL_GROUP


User = get_user_model()
PASSWORD = "CorrectHorse1!"
LOGIN_PATHS = ["/api/v2/auth/login", "/api/v2/login/", "/api/login/", "/api/login", "/api/v2/auth/login/"]
LOGOUT_PATHS = ["/api/v2/logout/", "/api/logout/", "/api/logout"]


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AuthReliabilityTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user("member", "member@example.com", PASSWORD)
        self.user.groups.add(Group.objects.get(name=LEGACY_EMAIL_GROUP))
        self.client = Client(enforce_csrf_checks=True)

    def post(self, path, data, client=None):
        client = client or self.client
        if "csrftoken" not in client.cookies:
            client.get("/api/v2/me/")
        return client.post(path, data, content_type="application/json",
                           HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)

    def test_logout_is_repeatable_and_still_protects_an_active_session(self):
        for path in LOGOUT_PATHS:
            with self.subTest(path=path):
                self.client.force_login(self.user)
                self.assertEqual(self.client.post(path).status_code, 403)
                self.assertEqual(self.post(path, {}).status_code, 200)
                self.assertEqual(self.post(path, {}).status_code, 200)
                self.assertNotIn("_auth_user_id", self.client.session)

    def test_all_login_aliases_require_csrf_and_allow_username_or_email(self):
        for path in LOGIN_PATHS:
            with self.subTest(path=path):
                self.client.logout()
                data = {"username": self.user.email, "password": PASSWORD}
                self.assertEqual(self.client.post(path, data, content_type="application/json").status_code, 403)
                self.assertEqual(self.post(path, data).status_code, 200)

    def test_account_routes_answer_with_and_without_trailing_slash(self):
        # T109: hellowoco.app's nginx 301s slashless /api/v2/auth/* URLs, and a
        # browser replays a redirected POST as a GET. Both forms must reach the view.
        for route in ("signup", "login", "email/verify", "session"):
            for path in (f"/api/v2/auth/{route}", f"/api/v2/auth/{route}/"):
                with self.subTest(path=path):
                    response = self.client.get(path)
                    self.assertNotIn(response.status_code, (301, 404))
                    self.assertEqual(response.headers["Cache-Control"], "no-store")
                    self.assertIn("X-Request-ID", response.headers)

    def test_password_change_ends_both_sessions_and_preserves_spaces(self):
        self.user.set_password(" " + PASSWORD + " ")
        self.user.save()
        second = Client()
        for client in (self.client, second):
            client.force_login(self.user)
        values = {"current_password": " " + PASSWORD + " ", "new_password": " AnotherPass1! "}
        self.assertEqual(self.client.post("/api/v2/change-password/", values,
                                         content_type="application/json").status_code, 403)
        response = self.post("/api/v2/change-password/", values)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn("sign in", response.json()["detail"].lower())
        self.assertNotIn("_auth_user_id", self.client.session)
        self.assertEqual(second.get("/api/v2/me/").status_code, 401)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(values["new_password"]))
        self.assertFalse(self.user.check_password(values["new_password"].strip()))

    def test_reset_preserves_spaces_and_rejects_token_reuse(self):
        data = {"uid": urlsafe_base64_encode(force_bytes(self.user.pk)),
                "token": PasswordResetTokenGenerator().make_token(self.user),
                "password": " AnotherPass1! "}
        self.assertEqual(self.post("/api/v2/reset-password/", data).status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(data["password"]))
        self.assertEqual(self.post("/api/v2/reset-password/", data).status_code, 400)

    def test_signup_preserves_password_and_all_login_paths_accept_it(self):
        password = " " + PASSWORD + " "
        response = self.post("/api/v2/auth/signup", {
            "first_name": "New", "last_name": "Collector", "email": "new@example.com", "password": password,
        })
        self.assertEqual(response.status_code, 401, response.content)
        user = User.objects.get(email="new@example.com")
        self.assertTrue(user.check_password(password))
        self.assertFalse(user.check_password(password.strip()))
        EmailAddress.objects.filter(user=user).update(verified=True)
        for path in LOGIN_PATHS:
            self.client.logout()
            cache.clear()
            response = self.post(path, {"username": user.username, "password": password})
            self.assertEqual(response.status_code, 200, response.content)

    def test_email_shaped_username_and_old_trimmed_password_still_work(self):
        self.user.username = "old@example.com"
        self.user.save()
        for path in LOGIN_PATHS:
            self.client.logout()
            cache.clear()
            response = self.post(path, {"username": self.user.username, "password": " " + PASSWORD + " "})
            self.assertEqual(response.status_code, 200, response.content)

    def test_username_wins_over_another_accounts_email(self):
        other = User.objects.create_user("other", self.user.username, "OtherPass1!")
        other.groups.add(Group.objects.get(name=LEGACY_EMAIL_GROUP))
        for path in LOGIN_PATHS:
            self.client.logout()
            cache.clear()
            response = self.post(path, {"username": self.user.username, "password": "OtherPass1!"})
            self.assertNotEqual(response.status_code, 200)
            self.assertNotIn("_auth_user_id", self.client.session)

    def test_duplicate_email_reset_is_controlled_and_sends_nothing(self):
        User.objects.create_user("duplicate", self.user.email, PASSWORD)
        response = self.post("/api/v2/forgot-password/", {"email": self.user.email})
        self.assertEqual(response.status_code, 409)
        self.assertIn("contact", response.json()["detail"].lower())
        self.assertEqual(len(mail.outbox), 0)

    def test_bad_shapes_and_field_types_return_400(self):
        for path, values in [
            ("/api/v2/login/", {"username": 123, "password": PASSWORD}),
            ("/api/v2/forgot-password/", {"email": ["bad"]}),
            ("/api/v2/reset-password/", {"uid": [], "token": "bad", "password": PASSWORD}),
            ("/api/v2/auth/signup", {"email": 123, "password": PASSWORD}),
        ]:
            for data in (values, []):
                with self.subTest(path=path, data=data):
                    response = self.post(path, data)
                    self.assertEqual(response.status_code, 400, response.content)

    @override_settings(ACCOUNT_RATE_LIMITS={"login": "2/m/ip"})
    def test_login_rate_limit_is_shared_by_aliases(self):
        for path in LOGIN_PATHS[:2]:
            self.assertNotEqual(self.post(path, {"username": "missing", "password": PASSWORD}).status_code, 429)
        self.assertEqual(self.post(LOGIN_PATHS[2], {"username": "missing", "password": PASSWORD}).status_code, 429)

    def test_proxy_uses_last_trusted_hop_not_forged_prefix(self):
        factory = RequestFactory()
        addresses = []
        for address in ("192.0.2.1", "198.51.100.2"):
            request = factory.get("/", REMOTE_ADDR="127.0.0.1",
                                  HTTP_X_FORWARDED_FOR="203.0.113.9, " + address)
            addresses.append(get_adapter().get_client_ip(request))
        self.assertEqual(addresses, ["192.0.2.1", "198.51.100.2"])

    def test_request_ids_correlate_errors_without_secrets(self):
        with patch("common.api.auth.send_mail", side_effect=OSError("secret@example.com private-token")):
            with self.assertLogs("common", level="INFO") as captured:
                response = self.post("/api/v2/forgot-password/", {"email": self.user.email})
        self.assertEqual(response.status_code, 503)
        request_id = response.headers["X-Request-ID"]
        output = "\n".join(captured.output)
        self.assertIn(request_id, output)
        for secret in (self.user.email, "secret@example.com", "private-token", PASSWORD):
            self.assertNotIn(secret, output)

    def test_operator_password_change_does_not_activate(self):
        self.user.is_active = False
        self.user.save()
        call_command("set_user_password", self.user.username, "AnotherPass1!", stdout=StringIO())
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)
        self.assertTrue(self.user.check_password("AnotherPass1!"))

    def test_old_verified_address_does_not_verify_the_current_address(self):
        self.user.groups.clear()
        EmailAddress.objects.create(user=self.user, email="old@example.com", verified=True)
        EmailAddress.objects.create(user=self.user, email=self.user.email, verified=False, primary=True)
        for path in LOGIN_PATHS:
            self.client.logout()
            cache.clear()
            response = self.post(path, {"username": self.user.username, "password": PASSWORD})
            self.assertNotEqual(response.status_code, 200, response.content)
            self.assertNotIn("_auth_user_id", self.client.session)

    def test_passwordless_activation_message_requires_password_setup(self):
        from common.signals import _send_activation_email
        with patch("common.signals._mail_backend_configured", return_value=True):
            _send_activation_email(self.user.email, password_ready=False)
        self.assertIn("Forgot password", mail.outbox[-1].body)
        self.assertNotIn("You can now sign in", mail.outbox[-1].body)
        html = mail.outbox[-1].alternatives[0][0]
        self.assertIn("Forgot password", html)
        self.assertNotIn("You can now sign in", html)

    def test_admin_preserves_password_spaces_and_requires_current_verification(self):
        self.user.is_staff = True
        self.user.username = "old@example.com"
        self.user.set_password(" " + PASSWORD + " ")
        self.user.save()
        self.client.get("/admin/login/")
        response = self.client.post("/admin/login/", {
            "username": "OLD@example.com", "password": " " + PASSWORD + " ", "next": "/admin/",
        }, HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value)
        self.assertEqual(response.status_code, 302)
        self.client.logout()
        self.user.groups.clear()
        EmailAddress.objects.create(user=self.user, email="old@example.com", verified=True)
        self.client.get("/admin/login/")
        response = self.client.post("/admin/login/", {
            "username": self.user.username, "password": " " + PASSWORD + " ",
        }, HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value)
        self.assertContains(response, "Verify your email")
        self.assertNotIn("_auth_user_id", self.client.session)

    @override_settings(ACCOUNT_RATE_LIMITS={"login": "1/m/ip"})
    def test_admin_login_shares_the_api_limit(self):
        self.post(LOGIN_PATHS[0], {"username": "missing", "password": PASSWORD})
        self.client.get("/admin/login/")
        response = self.client.post("/admin/login/", {
            "username": "member", "password": PASSWORD,
        }, HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value)
        self.assertContains(response, "Too many attempts")
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_csrf_rotation_rejects_old_token_without_ending_session(self):
        self.client.get("/api/v2/me/")
        old_token = self.client.cookies["csrftoken"].value
        self.assertEqual(self.post(LOGIN_PATHS[0], {"username": "member", "password": PASSWORD}).status_code, 200)
        response = self.client.post("/api/v2/logout/", {}, content_type="application/json",
                                    HTTP_X_CSRFTOKEN=old_token)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.get("/api/v2/me/").status_code, 200)
        self.assertEqual(self.post("/api/v2/logout/", {}).status_code, 200)

    def test_reset_get_does_not_consume_a_link_and_cross_browser_post_works(self):
        token = PasswordResetTokenGenerator().make_token(self.user)
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.client.get("/reset-password", {"uid": uid, "token": token})
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(PASSWORD))
        other = Client(enforce_csrf_checks=True)
        response = self.post("/api/v2/reset-password/", {
            "uid": uid, "token": token, "password": "AnotherPass1!",
        }, other)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("_auth_user_id", other.session)

    def test_session_recovery_respects_username_before_email(self):
        other = User.objects.create_user("other", self.user.username, PASSWORD)
        self.client.force_login(other)
        response = self.client.get("/api/v2/me/", {"login_identifier": self.user.username})
        self.assertIs(response.json().get("matches_login_identifier"), False)
        response = self.client.get("/api/v2/me/", {"login_identifier": other.username.upper()})
        self.assertIs(response.json().get("matches_login_identifier"), True)

    def test_local_access_log_does_not_record_link_query_tokens(self):
        with self.assertLogs("django.server", level="INFO") as captured:
            import logging
            logging.getLogger("django.server").info('"%s" %s %s',
                "GET /reset-password?uid=MQ&token=private-reset-key HTTP/1.1", 200, 100)
        output = "\n".join(captured.output)
        self.assertIn("/reset-password", output)
        self.assertNotIn("private-reset-key", output)
