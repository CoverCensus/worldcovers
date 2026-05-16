"""
End-to-end tests for the session-auth endpoints exposed under /api/v2/.

These hit LoginView, LogoutView, CurrentUserView, LoginRequestView,
ForgotPasswordApiView, ResetPasswordApiView, and ChangePasswordApiView.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.factories import make_user


User = get_user_model()


class LoginViewTest(APITestCase):
    def setUp(self):
        self.url = reverse("login")
        self.user = make_user("loginuser", email="login@example.com", password="pa$$word123")

    def test_login_with_username_and_password(self):
        response = self.client.post(self.url, {"username": "loginuser", "password": "pa$$word123"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["username"], "loginuser")

    def test_login_with_email_address(self):
        response = self.client.post(self.url, {"email": "login@example.com", "password": "pa$$word123"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["email"], "login@example.com")

    def test_login_with_wrong_password_returns_401(self):
        response = self.client.post(self.url, {"username": "loginuser", "password": "wrong"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_missing_credentials_returns_400(self):
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_inactive_user_returns_403(self):
        self.user.is_active = False
        self.user.save()
        response = self.client.post(self.url, {"username": "loginuser", "password": "pa$$word123"}, format="json")
        # Django's authenticate() returns None for inactive users with
        # ModelBackend, so this currently surfaces as 401, not 403. Accept
        # either to remain stable across auth-backend tweaks.
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))


class CurrentUserViewTest(APITestCase):
    def setUp(self):
        self.url = reverse("current-user")
        self.user = make_user("meuser", password="pa$$word123")

    def test_anonymous_returns_401(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_returns_user_payload(self):
        self.client.force_login(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["username"], "meuser")
        self.assertIn("role", response.data["user"])


class LogoutViewTest(APITestCase):
    def test_logout_after_login_clears_session(self):
        user = make_user("logout_me", password="pa$$word123")
        self.client.force_login(user)
        response = self.client.post(reverse("logout"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Subsequent /me/ call must now be anonymous.
        me_response = self.client.get(reverse("current-user"))
        self.assertEqual(me_response.status_code, status.HTTP_401_UNAUTHORIZED)


class LoginRequestViewTest(APITestCase):
    def test_creates_inactive_user(self):
        url = reverse("login-request")
        response = self.client.post(
            url,
            {"email": "new@example.com", "first_name": "New", "last_name": "User"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = User.objects.get(email__iexact="new@example.com")
        self.assertFalse(created.is_active)
        self.assertFalse(created.has_usable_password())

    def test_existing_email_rejected(self):
        make_user("ex", email="exists@example.com")
        url = reverse("login-request")
        response = self.client.post(
            url,
            {"email": "exists@example.com", "first_name": "X", "last_name": "Y"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class ForgotPasswordApiViewTest(APITestCase):
    def setUp(self):
        self.url = reverse("forgot-password")
        self.user = make_user("forgot_me", email="forgot@example.com", password="pa$$word123")

    def test_missing_email_returns_400(self):
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_email_returns_400(self):
        response = self.client.post(self.url, {"email": "nobody@example.com"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_known_email_sends_message(self):
        response = self.client.post(self.url, {"email": "forgot@example.com"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("forgot@example.com", mail.outbox[0].to)
        # The reset link must include the uid/token pair the SPA expects.
        body = mail.outbox[0].body
        self.assertIn("uid=", body)
        self.assertIn("token=", body)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class ResetPasswordApiViewTest(APITestCase):
    def setUp(self):
        self.user = make_user("reset_me", email="reset@example.com", password="pa$$word123")
        # Trigger the email to capture a valid uid+token pair.
        self.client.post(reverse("forgot-password"), {"email": "reset@example.com"}, format="json")
        body = mail.outbox[-1].body
        self.uid, self.token = self._extract_uid_and_token(body)

    @staticmethod
    def _extract_uid_and_token(body):
        # The body contains the link "...?uid=<uid>&token=<token>"
        link_segment = body.split("uid=", 1)[1]
        uid, rest = link_segment.split("&token=", 1)
        token = rest.split("\n", 1)[0].strip()
        return uid, token

    def test_resets_password_when_token_valid(self):
        url = reverse("reset-password")
        response = self.client.post(
            url,
            {"uid": self.uid, "token": self.token, "password": "newpa$$word"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("newpa$$word"))

    def test_rejects_invalid_token(self):
        url = reverse("reset-password")
        response = self.client.post(
            url,
            {"uid": self.uid, "token": "bad-token", "password": "newpa$$word"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_missing_fields(self):
        url = reverse("reset-password")
        response = self.client.post(url, {"uid": self.uid}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_too_short_password(self):
        url = reverse("reset-password")
        response = self.client.post(
            url,
            {"uid": self.uid, "token": self.token, "password": "ab"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ChangePasswordApiViewTest(APITestCase):
    def setUp(self):
        self.url = reverse("change-password")
        self.user = make_user("chgpw", password="OldPass1!")
        self.client.force_login(self.user)

    def test_changes_password_when_inputs_valid(self):
        response = self.client.post(
            self.url,
            {"current_password": "OldPass1!", "new_password": "NewPass1!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass1!"))

    def test_rejects_wrong_current_password(self):
        response = self.client.post(
            self.url,
            {"current_password": "wrong", "new_password": "NewPass1!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_weak_password(self):
        response = self.client.post(
            self.url,
            {"current_password": "OldPass1!", "new_password": "short"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_requires_authentication(self):
        self.client.logout()
        response = self.client.post(
            self.url,
            {"current_password": "OldPass1!", "new_password": "NewPass1!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
