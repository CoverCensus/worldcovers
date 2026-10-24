"""Every email the site sends names the product (SITE_NAME) and never the
retired names. Trello T98: the USPCS decided on 2026-10-23 that the catalog
presents as APMC. The old password mail also carried a typo ("WordCover")."""

from allauth.account.adapter import get_adapter
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from django.urls import reverse
from unittest import mock

from common.signals import _send_activation_email

User = get_user_model()
RETIRED_NAMES = ("WorldCovers", "WordCover")


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_HOST="smtp.example.test",
)
class BrandWordingTests(TestCase):
    def assert_branded(self, *texts):
        for text in texts:
            self.assertIn(settings.SITE_NAME, text)
            for name in RETIRED_NAMES:
                self.assertNotIn(name, text)

    def test_activation_email_names_the_product(self):
        # The helper refuses to send through the locmem backend; the wording is
        # what is under test, not the transport.
        with mock.patch("common.signals._mail_backend_configured", return_value=True):
            _send_activation_email("new-editor@example.com")
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[-1]
        self.assertTrue(message.alternatives)
        html = message.alternatives[0][0]
        self.assert_branded(message.subject, message.body, html)

    def test_password_reset_email_names_the_product(self):
        User.objects.create_user(
            username="brand", email="brand@example.com", password="CorrectHorse1!"
        )
        response = self.client.post(
            reverse("forgot-password"),
            {"email": "brand@example.com"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[-1]
        self.assertTrue(message.alternatives)
        self.assert_branded(message.subject, message.body, message.alternatives[0][0])

    def test_allauth_account_emails_name_the_product(self):
        adapter = get_adapter()
        user = User.objects.create_user(username="allauth", email="allauth@example.com")
        confirmation = adapter.render_mail(
            "account/email/email_confirmation_signup",
            user.email,
            {"user": user, "activate_url": "https://example.test/verify-email?key=k", "key": "k"},
        )
        exists = adapter.render_mail(
            "account/email/account_already_exists",
            user.email,
            {"user": user, "signup_url": "https://example.test/auth"},
        )
        self.assert_branded(
            confirmation.subject, confirmation.body, exists.subject, exists.body
        )
        # No "[example.com] " prefix from django.contrib.sites either.
        self.assertFalse(confirmation.subject.startswith("["), confirmation.subject)
