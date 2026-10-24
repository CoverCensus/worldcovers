"""Email verification policy shared by each login entry point."""
from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth import get_user_model
from allauth.account.utils import has_verified_email


LEGACY_EMAIL_GROUP = "Legacy email verification exemption"


def has_legacy_access(user: AbstractBaseUser) -> bool:
    return user.groups.filter(name=LEGACY_EMAIL_GROUP).exists()


def email_allows_login(user: AbstractBaseUser) -> bool:
    return has_legacy_access(user) or has_verified_email(user, user.email)


def resolve_login_identifier(identifier: str):
    """Choose a username first, then one unambiguous current email address."""
    User = get_user_model()
    for field in ("username__iexact", "email__iexact"):
        matches = list(User.objects.filter(**{field: identifier.strip()})[:2])
        if len(matches) == 1:
            return matches[0]
        if matches:
            return None
    return None
