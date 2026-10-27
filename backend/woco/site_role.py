"""Which site this install is (Trello T84).

The SPA bundle is identical on woco.dev and hellowoco.app, so the backend tells
it through GET /api/v2/site/. The role is derived from DJANGO_APP_HOSTNAME by
comparing it with the host of WOCO_PRODUCTION_URL (with or without "www."), so
neither server needs a new .env entry. WOCO_SITE_ROLE overrides the derivation
and is validated at start-up: a typo must fail loudly, because an unknown value
would otherwise read as production and bring back the stranded-request bug.
"""
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured

SITE_ROLES = ("production", "staging")


def production_host(production_url: str) -> str:
    return (urlsplit(production_url).hostname or "").lower()


def derive_site_role(hostname: str, production_url: str) -> str:
    host = (hostname or "").strip().lower()
    prod = production_host(production_url)
    bare = prod[4:] if prod.startswith("www.") else prod
    if host and host in {bare, f"www.{bare}"}:
        return "production"
    return "staging"


def absolute_frontend_url(value: str) -> str:
    """FRONTEND_BASE_URL with a scheme and no trailing slash.

    Production's .env holds a bare host ("hellowoco.app"). allauth treats a
    scheme-less frontend URL as relative and resolves it against the request
    path, so the signup confirm link pointed at /api/v2/auth/signup/... (T109).
    """
    url = value.strip().rstrip("/")
    if urlsplit(url).scheme.lower() not in ("http", "https"):
        url = f"https://{url.lstrip('/')}"
    return url


def validate_site_role(value: str) -> str:
    if value not in SITE_ROLES:
        raise ImproperlyConfigured(
            f"WOCO_SITE_ROLE must be one of {SITE_ROLES}, got {value!r}"
        )
    return value
