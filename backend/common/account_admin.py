"""Apply email verification to staff login as well as public login."""
from django.contrib.admin.forms import AdminAuthenticationForm
from django.core.exceptions import ValidationError

from common.account_access import email_allows_login


class VerifiedAdminAuthenticationForm(AdminAuthenticationForm):
    def confirm_login_allowed(self, user):
        super().confirm_login_allowed(user)
        if not email_allows_login(user):
            raise ValidationError("Verify your email through the site before signing in.", code="unverified")
