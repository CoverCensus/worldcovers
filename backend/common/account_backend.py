"""Use the same account and password rules at every sign-in entry point."""
from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.core.exceptions import PermissionDenied

from common.account_access import resolve_login_identifier


def check_account_password(user, password: str) -> bool:
    if user.check_password(password):
        return True
    # Older signup/reset forms stored trimmed passwords. Try that one value
    # only after the exact value fails; never rewrite the saved password.
    trimmed = password.strip()
    return trimmed != password and bool(trimmed) and user.check_password(trimmed)


class AccountAuthenticationBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        identifier = username or kwargs.get("email")
        if not isinstance(identifier, str) or not isinstance(password, str):
            raise PermissionDenied
        user = resolve_login_identifier(identifier)
        if user is None:
            get_user_model()().set_password(password)
        elif check_account_password(user, password) and self.user_can_authenticate(user):
            return user
        # Stop fallback authentication. The old backend paths remain in settings
        # only so sessions created before this change can still load their user.
        raise PermissionDenied
