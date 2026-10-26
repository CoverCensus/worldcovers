"""Apply email verification to staff login as well as public login."""
from django.contrib.admin.forms import AdminAuthenticationForm
from django.core.exceptions import ValidationError
from allauth.account.adapter import get_adapter
from allauth.core import ratelimit

from common.account_access import email_allows_login


class VerifiedAdminAuthenticationForm(AdminAuthenticationForm):
    def clean(self):
        username = self.cleaned_data.get("username")
        password = self.cleaned_data.get("password")
        if username and password:
            if not ratelimit.consume(self.request, action="login"):
                raise ValidationError("Too many attempts. Please wait before trying again.")
            self.user_cache = get_adapter().authenticate(self.request, username=username, password=password)
            if self.user_cache is None:
                raise self.get_invalid_login_error()
            self.confirm_login_allowed(self.user_cache)
        return self.cleaned_data

    def confirm_login_allowed(self, user):
        super().confirm_login_allowed(user)
        if not email_allows_login(user):
            raise ValidationError("Verify your email through the site before signing in.", code="unverified")
