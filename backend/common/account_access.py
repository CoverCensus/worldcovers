"""Email verification policy shared by each login entry point."""
from django.contrib.auth.base_user import AbstractBaseUser
from allauth.account.utils import has_verified_email


LEGACY_EMAIL_GROUP = "Legacy email verification exemption"


def has_legacy_access(user: AbstractBaseUser) -> bool:
    return user.groups.filter(name=LEGACY_EMAIL_GROUP).exists()


def email_allows_login(user: AbstractBaseUser) -> bool:
    return has_legacy_access(user) or has_verified_email(user, user.email)
