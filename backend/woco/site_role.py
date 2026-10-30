"""Which site this install is (Trello T84).

The SPA bundle is identical on woco.dev and hellowoco.app, so the backend tells
it through GET /api/v2/site/. The role is derived from DJANGO_APP_HOSTNAME by
comparing it with the host of WOCO_PRODUCTION_URL (with or without "www."), so
neither server needs a new .env entry. WOCO_SITE_ROLE overrides the derivation
and is validated at start-up: a typo must fail loudly, because an unknown value
would otherwise read as production and bring back the stranded-request bug.
"""
import re
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured

SITE_ROLES = ("production", "staging")

# A plain dotted hostname: no scheme, port, path, "*" or leading dot, so an
# extra name can never widen ALLOWED_HOSTS to a wildcard (T105 review).
PLAIN_HOSTNAME = re.compile(r"[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+")


def production_host(production_url: str) -> str:
    return (urlsplit(production_url).hostname or "").lower()


def derive_site_role(hostname: str, production_url: str) -> str:
    host = (hostname or "").strip().lower()
    prod = production_host(production_url)
    bare = prod[4:] if prod.startswith("www.") else prod
    if host and host in {bare, f"www.{bare}"}:
        return "production"
    return "staging"


def served_hostnames(primary: str, extras: str) -> list[str]:
    """Every public hostname this install answers on (Trello T105).

    DJANGO_APP_HOSTNAME stays the one name for emails, the site role and the
    from-address; DJANGO_APP_EXTRA_HOSTNAMES (comma-separated) adds names that
    serve the same site, e.g. americanpostmarkcatalog.org next to hellowoco.app.
    An extra that is not a plain hostname refuses to start, like
    WOCO_SITE_ROLE: "*" or ".org" would otherwise accept any host.
    """
    names = [primary.strip().lower()]
    for raw in extras.split(","):
        host = raw.strip().lower()
        if not host or host in names:
            continue
        if not PLAIN_HOSTNAME.fullmatch(host):
            raise ImproperlyConfigured(
                f"DJANGO_APP_EXTRA_HOSTNAMES entries must be plain hostnames, got {raw.strip()!r}"
            )
        names.append(host)
    return [name for name in names if name]


def allowed_hosts(hostnames: list[str]) -> list[str]:
    """Each served name and its www. form, for ALLOWED_HOSTS."""
    return [name for host in hostnames for name in (host, f"www.{host}")]


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
