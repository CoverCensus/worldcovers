"""Account-state answers from the auth endpoints (issue #150).

A user who requested a login was told "Invalid credentials." -- the same
sentence a wrong password gets -- and the Forgot Password flow then issued a
working reset link that could never lead to a successful sign-in, because
nothing on that path sets is_active. Every signal said "wrong password" and the
only self-service remedy could not succeed.

These are the first tests for this endpoint family, so they target that loop
rather than the permutation space.
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core import mail
from django.test import TestCase, override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient


User = get_user_model()

LOGIN_URL = "/api/v2/login/"
FORGOT_URL = "/api/v2/forgot-password/"
RESET_URL = "/api/v2/reset-password/"


class AuthAccountStateTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _pending(self, email="pending@example.com"):
        """A LoginRequestView account: inactive, unusable password, never logged in."""
        user = User(username=email, email=email, is_active=False)
        user.set_unusable_password()
        user.save()
        return user

    def _login(self, identifier, password):
        return self.client.post(
            LOGIN_URL, {"username": identifier, "password": password}, format="json"
        )

    # --- the reported loop ---------------------------------------------------

    def test_pending_account_is_not_told_its_password_is_wrong(self):
        self._pending()
        response = self._login("pending@example.com", "anything")

        self.assertEqual(response.status_code, 403, response.data)
        self.assertNotIn("Invalid credentials", response.data["detail"])
        self.assertIn("waiting for approval", response.data["detail"])

    def test_inactive_user_with_a_correct_password_is_not_told_invalid_credentials(self):
        """The regression test issue #150 asks for.

        This is the member who already walked the loop: they completed a reset,
        so they are inactive WITH a usable, correct password. Keying the copy on
        has_usable_password() instead of last_login would pass every other test
        in this file and still hand this person the wrong message.
        """
        user = User.objects.create_user(
            username="reset@example.com", email="reset@example.com", password="CorrectHorse1!"
        )
        user.is_active = False
        user.save(update_fields=["is_active"])

        response = self._login("reset@example.com", "CorrectHorse1!")

        self.assertEqual(response.status_code, 403, response.data)
        self.assertNotIn("Invalid credentials", response.data["detail"])
        self.assertIn("waiting for approval", response.data["detail"])

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_forgot_password_refuses_an_inactive_account_and_sends_no_mail(self):
        self._pending()
        login_detail = self._login("pending@example.com", "anything").data["detail"]

        response = self.client.post(
            FORGOT_URL, {"email": "pending@example.com"}, format="json"
        )

        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(len(mail.outbox), 0)
        # Equality, not "contains": the whole point is that a user who
        # disbelieves the login screen and tries Forgot Password reads the SAME
        # sentence rather than a second, different story.
        self.assertEqual(response.data["detail"], login_detail)

    def test_completed_reset_does_not_activate_the_account(self):
        """Guard against a future "just activate them on reset, it's one line" patch.

        Activation is an editorial decision (issue #151), not proof of email
        ownership -- otherwise anyone who can receive mail at the address
        bypasses approval entirely.
        """
        user = self._pending()
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = PasswordResetTokenGenerator().make_token(user)

        response = self.client.post(
            RESET_URL, {"uid": uid, "token": token, "password": "NewPass1!"}, format="json"
        )

        self.assertEqual(response.status_code, 403, response.data)
        user.refresh_from_db()
        self.assertFalse(user.is_active)
        self.assertFalse(user.check_password("NewPass1!"))

    # --- what must not regress ----------------------------------------------

    def test_active_user_with_correct_password_still_signs_in(self):
        user = User.objects.create_user(
            username="editor", email="editor@example.com", password="CorrectHorse1!"
        )
        response = self._login("editor", "CorrectHorse1!")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["user"]["id"], user.pk)

    def test_email_identifier_still_resolves_when_username_differs(self):
        """Pins the email -> username fallback, the thing this change endangers.

        It is the only reason accounts whose username is not their email can
        sign in at all, and nothing else in the suite covers it.
        """
        User.objects.create_user(
            username="editor2", email="editor2@example.com", password="CorrectHorse1!"
        )
        response = self._login("editor2@example.com", "CorrectHorse1!")

        self.assertEqual(response.status_code, 200, response.data)

    def test_unknown_identifier_and_wrong_password_both_stay_generic_401(self):
        """Disclosure widened for inactive accounts only -- never for unknown ones."""
        User.objects.create_user(
            username="editor3", email="editor3@example.com", password="CorrectHorse1!"
        )

        unknown = self._login("nobody@example.com", "anything")
        self.assertEqual(unknown.status_code, 401, unknown.data)
        self.assertIn("Invalid credentials", unknown.data["detail"])

        wrong = self._login("editor3", "WrongPassword1!")
        self.assertEqual(wrong.status_code, 401, wrong.data)
        self.assertIn("Invalid credentials", wrong.data["detail"])

    # --- reset password strength (issue #157) --------------------------------

    def _reset_payload(self, user, password):
        return {
            "uid": urlsafe_base64_encode(force_bytes(user.pk)),
            "token": PasswordResetTokenGenerator().make_token(user),
            "password": password,
        }

    def test_reset_password_rejects_a_four_character_password(self):
        """The reported hole: reset used to accept 4 chars where change-password demands 8+.

        Server-only -- ResetPassword.tsx already enforces all five rules, so a
        weak password could only arrive from a non-SPA client. That is precisely
        why it survived: the form's validation hid the missing server check.
        """
        user = User.objects.create_user(
            username="weak1", email="weak1@example.com", password="CorrectHorse1!"
        )

        response = self.client.post(
            RESET_URL, self._reset_payload(user, "abcd"), format="json"
        )

        self.assertEqual(response.status_code, 400, response.data)
        user.refresh_from_db()
        self.assertFalse(
            user.check_password("abcd"), "the weak password must NOT have been set"
        )
        self.assertTrue(user.check_password("CorrectHorse1!"), "the old password must survive")

    def test_reset_and_change_password_enforce_the_same_rule(self):
        """The actual point of #157: neither endpoint may be a way around the other.

        Asserting the same *message* rather than just the same status is what
        stops a future edit re-forking the two rules -- they share
        _validate_password_strength, and this fails the moment they stop.
        """
        user = User.objects.create_user(
            username="weak2", email="weak2@example.com", password="CorrectHorse1!"
        )
        weak = "abcdefgh"  # 8 chars, but no uppercase, digit or special

        reset = self.client.post(
            RESET_URL, self._reset_payload(user, weak), format="json"
        )

        self.client.force_authenticate(user=user)
        change = self.client.post(
            "/api/v2/change-password/",
            {"current_password": "CorrectHorse1!", "new_password": weak},
            format="json",
        )
        self.client.force_authenticate(user=None)

        self.assertEqual(reset.status_code, 400, reset.data)
        self.assertEqual(change.status_code, 400, change.data)
        self.assertEqual(reset.data["detail"], change.data["detail"])

    def test_reset_password_accepts_a_compliant_password(self):
        """Positive control -- the tightened rule must not block a legitimate reset."""
        user = User.objects.create_user(
            username="strong1", email="strong1@example.com", password="OldPassword1!"
        )

        response = self.client.post(
            RESET_URL, self._reset_payload(user, "NewPassword1!"), format="json"
        )

        self.assertEqual(response.status_code, 200, response.data)
        user.refresh_from_db()
        self.assertTrue(user.check_password("NewPassword1!"))
