###################################################################################################
## WoCo Commons - API Views
## MPC: 2025/11/15
###################################################################################################
import csv
import logging
import hashlib
import io
import os
import re
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Optional, Tuple

from django.conf import settings
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import send_mail
from django.db import ProgrammingError
from django.db.models import Q, Count, Prefetch, Min, Max
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.text import slugify
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

from rest_framework import viewsets, filters, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated, IsAdminUser, BasePermission, AllowAny
from rest_framework.views import APIView
from rest_framework.renderers import JSONRenderer
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from django_filters.rest_framework import DjangoFilterBackend

from django.contrib.auth import get_user_model
from woco.pagination import PageSizePagination, LargePageSizePagination, PostmarkListPagination

logger = logging.getLogger(__name__)

_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_YEAR_RE = re.compile(r"^\d{4}$")
_YEAR_RANGE_RE = re.compile(r"^\s*(\d{4})\s*[-–—]\s*(\d{4})\s*$")


def _parse_dates_seen_from_payload(payload: dict) -> Tuple[date, date]:
    """
    Parse earliest/latest date seen from contribution payload.

    Supports:
    - first_seen/last_seen (or firstSeen/lastSeen) as YYYY or YYYY-MM-DD
    - date_range/dateRange as:
        - YYYY
        - YYYY-YYYY
        - YYYY-MM-DD
        - YYYY-MM-DD - YYYY-MM-DD (note spaces around dash)
    """
    def _get(*keys: str) -> str:
        for k in keys:
            v = payload.get(k)
            if v is None:
                continue
            s = str(v).strip()
            if s != "":
                return s
        return ""

    first_raw = _get("first_seen", "firstSeen")
    last_raw = _get("last_seen", "lastSeen")
    range_raw = _get("date_range", "dateRange")

    def _parse_token(tok: str, *, is_latest: bool) -> Optional[date]:
        t = (tok or "").strip()
        if not t:
            return None
        if _ISO_DATE_RE.match(t):
            try:
                return datetime.fromisoformat(t).date()
            except ValueError:
                return None
        if _YEAR_RE.match(t):
            y = max(1, min(int(t), 9999))
            return date(y, 12, 31) if is_latest else date(y, 1, 1)
        return None

    # Prefer explicit first/last fields when present
    if first_raw or last_raw:
        e = _parse_token(first_raw or last_raw, is_latest=False) or date(1900, 1, 1)
        l = _parse_token(last_raw or first_raw, is_latest=True) or date(1900, 12, 31)
        return (e, l) if e <= l else (l, e)

    # Fall back to date_range string
    s = (range_raw or "").strip()
    if not s:
        return date(1900, 1, 1), date(1900, 12, 31)


def _parse_dates_seen_rows_from_payload(payload: dict) -> list[Tuple[date, date]]:
    """
    Build one or more PostmarkDatesSeen rows from payload.
    - Primary row comes from existing first_seen/last_seen/date_range parsing.
    - Extra rows can come from dates_observed/datesObserved as:
      * array of date tokens
      * comma/newline-separated string
    Supported token formats: YYYY, YYYY-MM-DD, YYYY-YYYY, YYYY-MM-DD - YYYY-MM-DD.
    """
    primary = _parse_dates_seen_from_payload(payload)
    rows: list[Tuple[date, date]] = [primary]

    raw = _get_payload_value(payload, "dates_observed", "datesObserved")
    if raw is None or raw == "":
        return rows

    if isinstance(raw, (list, tuple)):
        tokens = [str(v).strip() for v in raw if str(v).strip()]
    else:
        text = str(raw)
        tokens = [t.strip() for t in re.split(r"[\n,]+", text) if t.strip()]

    seen = {(primary[0].isoformat(), primary[1].isoformat())}
    for tok in tokens:
        synthetic = {"date_range": tok}
        e, l = _parse_dates_seen_from_payload(synthetic)
        key = (e.isoformat(), l.isoformat())
        if key in seen:
            continue
        seen.add(key)
        rows.append((e, l))
    return rows

    # Year range like "1850-1860"
    m = _YEAR_RANGE_RE.match(s)
    if m:
        y1 = max(1, min(int(m.group(1)), 9999))
        y2 = max(1, min(int(m.group(2)), 9999))
        e = date(y1, 1, 1)
        l = date(y2, 12, 31)
        return (e, l) if e <= l else (l, e)

    # ISO single date
    if _ISO_DATE_RE.match(s):
        d = _parse_token(s, is_latest=False) or date(1900, 1, 1)
        return d, d

    # ISO range like "1850-01-02 - 1851-03-04" (spaces around dash)
    parts = re.split(r"\s+[-–—]\s+", s)
    if len(parts) >= 2:
        e = _parse_token(parts[0], is_latest=False) or date(1900, 1, 1)
        l = _parse_token(parts[1], is_latest=True) or e
        return (e, l) if e <= l else (l, e)

    # Legacy fallback: attempt to interpret the first 4 digits as a year
    try:
        y = int(s.strip()[:4])
        y = max(1, min(y, 9999))
        return date(y, 1, 1), date(y, 12, 31)
    except Exception:
        return date(1900, 1, 1), date(1900, 12, 31)

from common.models import (
    PostalFacility,
    PostalFacilityIdentity,
    AdministrativeUnit,
    AdministrativeUnitIdentity,
    AdministrativeUnitResponsibility,
    JurisdictionalAffiliation,
    PostmarkShape,
    LetteringStyle,
    FramingStyle,
    Color,
    DateFormat,
    Postmark,
    PostmarkColor,
    PostmarkDatesSeen,
    PostmarkSize,
    PostmarkValuation,
    PostmarkPublication,
    PostmarkPublicationReference,
    PostmarkImage,
    Postcover,
    PostcoverPostmark,
    PostcoverImage,
    AdminCsvUpload,
    UserLocationAssignment,
    Contribution,
    FAQEntry,
)

from .serializers import (
    PostalFacilitySerializer,
    PostalFacilityListSerializer,
    PostalFacilityIdentitySerializer,
    AdministrativeUnitSerializer,
    AdministrativeUnitListSerializer,
    AdministrativeUnitIdentitySerializer,
    AdministrativeUnitResponsibilitySerializer,
    JurisdictionalAffiliationSerializer,
    PostmarkShapeSerializer,
    LetteringStyleSerializer,
    FramingStyleSerializer,
    ColorSerializer,
    DateFormatSerializer,
    PostmarkSerializer,
    PostmarkColorSerializer,
    PostmarkDatesSeenSerializer,
    PostmarkSizeSerializer,
    PostmarkValuationSerializer,
    PostmarkPublicationSerializer,
    PostmarkPublicationReferenceSerializer,
    PostmarkImageSerializer,
    PostcoverSerializer,
    PostcoverListSerializer,
    PostcoverPostmarkSerializer,
    PostcoverImageSerializer,
    AdminCsvUploadListSerializer,
    AdminCsvUploadSerializer,
    LoginRequestSerializer,
    ContributionListSerializer,
    ContributionDetailSerializer,
    ContributionApproveRejectSerializer,
    FAQEntrySerializer,
)
from common.filters import PostmarkListFilter
from common.csv_import import IMPORTERS


_password_reset_token_generator = PasswordResetTokenGenerator()


def _get_user_role(user):
    """
    Derive a simple role string for the frontend from Django auth state.

    Primary signal is the "State Editors" group, but we also treat users
    with explicit location assignments as state editors so that the admin
    Role & Locations UI remains the single source of truth even if group
    membership is temporarily out of sync.
    """
    # State Editors group → editor role
    if user.groups.filter(name__iexact="State Editors").exists():
        return "state_editor"

    # Fallback: any explicit UserLocationAssignment implies state editor responsibilities
    if UserLocationAssignment.objects.filter(user=user).exists():
        return "state_editor"

    # Default: contributor
    return "contributor"


def _truthy_request_flag(value):
    """True for JSON/boolean true or string 'true'/'1'/'yes'/'on' (case-insensitive)."""
    if value is True:
        return True
    if value is False or value is None:
        return False
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return False


def _build_user_payload(user):
    """Build the user dict for login/me responses (id, username, email, is_staff, is_superuser, role, assigned_locations)."""
    role = _get_user_role(user)
    payload = {
        "id": user.pk,
        "username": user.username,
        "email": getattr(user, "email", "") or "",
        "is_staff": getattr(user, "is_staff", False),
        "is_superuser": getattr(user, "is_superuser", False),
        "role": role,
    }
    if role == "state_editor":
        units = _get_user_assigned_units(user)
        assigned_locations = []
        for unit in units:
            ident = unit.get_current_identity()
            name = (ident.unit_name or unit.reference_code or "").strip() or unit.reference_code
            assigned_locations.append({
                "name": name,
                "reference_code": unit.reference_code or "",
            })
        payload["assigned_locations"] = assigned_locations
    return payload


class SessionAuthenticationNoCSRF(SessionAuthentication):
    """Session auth without CSRF check; for SPA endpoints that use csrf_exempt."""

    def enforce_csrf(self, request):
        pass  # Skip so SPA can POST without CSRF token


# ========== AUTH (SESSION LOGIN FOR SPA & PASSWORD RESET) ==========


@method_decorator(csrf_exempt, name="dispatch")
class LoginView(APIView):
    """Session login for frontend when Supabase is not used. Accepts username or email + password."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username") or request.data.get("email") or ""
        password = request.data.get("password") or ""
        username = username.strip()
        if not username or not password:
            return Response(
                {"detail": "Username and password required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = authenticate(request, username=username, password=password)
        if user is None and "@" in username:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                u = User.objects.get(email__iexact=username)
                user = authenticate(request, username=u.username, password=password)
            except (User.DoesNotExist, User.MultipleObjectsReturned):
                pass
        if user is None:
            return Response(
                {"detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not user.is_active:
            return Response(
                {"detail": "Account is disabled."},
                status=status.HTTP_403_FORBIDDEN,
            )
        login(request, user)
        return Response({"user": _build_user_payload(user)})


class CurrentUserView(APIView):
    """Return current user when authenticated via session (for SPA auth state)."""
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        return Response({"user": _build_user_payload(request.user)})


class AssignedStatesView(APIView):
    """Return state options assigned to the current user.

    - For State Editors: only their assigned states.
    - For Contributors/others: all current states.
    """
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]

    def get(self, request):
        user = request.user
        role = _get_user_role(user)

        if role == "state_editor":
            units = _get_user_assigned_units(user)
            identities = AdministrativeUnitIdentity.objects.filter(
                administrative_unit__in=units,
                effective_to_date__isnull=True,
            )
        else:
            # Contributors can submit to any state; return all current identities
            identities = AdministrativeUnitIdentity.objects.filter(
                effective_to_date__isnull=True,
            )
        seen = set()
        items = []
        for ident in identities:
            name = (ident.unit_name or "").strip()
            if not name or name in seen:
                continue
            seen.add(name)
            items.append({
                "value": name,
                "label": name,
                "administrativeUnitId": ident.administrative_unit_id,
                "abbreviation": (ident.unit_abbreviation or "").strip(),
            })
        items.sort(key=lambda x: x["label"].lower())
        return Response(items)


class FAQEntryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only API for FAQ entries used by the public SPA homepage.
    Only active entries are returned, ordered for display.
    """
    queryset = FAQEntry.objects.filter(is_active=True).order_by("display_order", "faq_entry_id")
    serializer_class = FAQEntrySerializer
    permission_classes = [AllowAny]

    def list(self, request, *args, **kwargs):
        """Return FAQ list; if table is missing (migration not applied), return empty list."""
        try:
            return super().list(request, *args, **kwargs)
        except ProgrammingError:
            # FAQEntries table may not exist yet; return empty paginated response
            return Response({
                "count": 0,
                "next": None,
                "previous": None,
                "results": [],
            })


class HelpDocsView(APIView):
    """
    Read markdown docs from the repository-level help-docs directory for the Help page.
    Returns raw markdown so the SPA can render it as HTML.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        docs_dir = Path(settings.REPO_ROOT) / "help-docs"
        items = []
        if not docs_dir.exists():
            return Response({"results": items})

        for md_file in sorted(
            docs_dir.rglob("*.md"),
            key=lambda p: str(p.relative_to(docs_dir)).lower(),
        ):
            try:
                markdown = md_file.read_text(encoding="utf-8")
            except OSError:
                continue

            slug = slugify(md_file.stem) or md_file.stem.lower()
            title_match = re.search(r"^#\s+(.+)$", markdown, flags=re.MULTILINE)
            title = title_match.group(1).strip() if title_match else md_file.stem.replace("_", " ")

            items.append({
                "slug": slug,
                "title": title,
                "source_file": str(md_file.relative_to(docs_dir)),
                "markdown": markdown,
            })

        return Response({"results": items})


@method_decorator(csrf_exempt, name="dispatch")
class LogoutView(APIView):
    """Session logout for SPA."""
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_200_OK)


def _get_admin_emails():
    """Return list of admin emails to notify when a user requests login access."""
    User = get_user_model()
    # 1. Explicit setting (LOGIN_REQUEST_ADMIN_EMAIL or LOGIN_REQUEST_ADMIN_EMAILS)
    explicit = getattr(settings, "LOGIN_REQUEST_ADMIN_EMAIL", None) or getattr(
        settings, "LOGIN_REQUEST_ADMIN_EMAILS", None
    )
    if explicit:
        if isinstance(explicit, str):
            emails = [e.strip() for e in explicit.split(",") if (e or "").strip()]
        else:
            emails = [e.strip() for e in explicit if (e or "").strip()]
        if emails:
            return emails
    # 2. Django ADMINS
    admins = getattr(settings, "ADMINS", [])
    if admins:
        return [email for _, email in admins if (email or "").strip()]
    # 3. Staff users with email
    return list(
        User.objects.filter(is_staff=True)  # noqa: S301
        .exclude(email="")
        .values_list("email", flat=True)
        .distinct()
    )


# def _send_login_request_notification_to_admin(user):
#     """Send email to admin when a user requests login access."""
#     admin_emails = _get_admin_emails()
#     if not admin_emails:
#         return
#     frontend_base = getattr(settings, "FRONTEND_BASE_URL", None) or f"https://{settings.DJANGO_APP_HOSTNAME}"
#     if not frontend_base.startswith(("http://", "https://")):
#         frontend_base = f"https://{frontend_base.lstrip('/')}"
#     admin_url = f"{frontend_base.rstrip('/')}/admin/auth/user/{user.pk}/change/"
#     subject = "WorldCovers: New login access request"
#     from_email = getattr(settings, "DEFAULT_FROM_EMAIL", None) or f"no-reply@{settings.DJANGO_APP_HOSTNAME}"
#     html_message = f"""
#         <p>A new user has requested login access to WorldCovers.</p>
#         <p><strong>Name:</strong> {user.first_name} {user.last_name}</p>
#         <p><strong>Email:</strong> {user.email}</p>
#         <p>Please review and activate the user in the admin:</p>
#         <p><a href="{admin_url}" style="display:inline-block;padding:10px 16px;margin-top:8px;background-color:#7b4b4b;color:#ffffff;text-decoration:none;border-radius:4px;">Open Django Admin</a></p>
#         <p>Best regards,<br>WorldCovers</p>
# """
#     send_mail(
#         subject,
#         f"A new user ({user.email}) has requested login access. Review at {admin_url}",
#         from_email,
#         admin_emails,
#         fail_silently=True,
#         html_message=html_message,
#     )


@method_decorator(csrf_exempt, name="dispatch")
class LoginRequestView(APIView):
    """
    Public API for users to request login access.
    Creates User directly (is_active=False). Admin sets username/password and activates in Users.
    Sends an email to the admin when a request is submitted.
    """
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        User = get_user_model()
        email = data['email'].strip().lower()
        user = User(
            username=email,
            email=email,
            first_name=data['first_name'].strip(),
            last_name=data['last_name'].strip(),
            is_active=False,
        )
        user.set_unusable_password()
        user.save()
        # _send_login_request_notification_to_admin(user)
        return Response(
            {"detail": "Request submitted. An admin will provide your username and password."},
            status=status.HTTP_201_CREATED,
        )


@method_decorator(csrf_exempt, name="dispatch")
class ForgotPasswordApiView(APIView):
    """
    Public API to start a password reset.
    POST JSON: { "email": "<user email>" }
    Sends an email with a link to the SPA reset page.
    """
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        if not email:
            return Response(
                {"detail": "Email is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        User = get_user_model()
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            # Explicitly tell the caller that this email does not have an account
            # so the frontend can show a clear validation error.
            return Response(
                {"detail": "No account found for that email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = _password_reset_token_generator.make_token(user)

        frontend_base = getattr(settings, "FRONTEND_BASE_URL", None) or f"https://{settings.DJANGO_APP_HOSTNAME}"
        # Ensure we always have an explicit scheme for the frontend URL
        if not frontend_base.startswith(("http://", "https://")):
            frontend_base = f"https://{frontend_base.lstrip('/')}"
        reset_link = f"{frontend_base.rstrip('/')}/reset-password?uid={uid}&token={token}"

        subject = "Reset password for your WordCover account"
        message_lines = [
            "We received a request to reset your WordCover account password",
            "",
            "Please click the link to create a new password:",
            reset_link,
            "",
            "If you did not request a password reset, you can safely ignore this email.",
        ]
        message = "\n".join(message_lines)

        html_message = f"""
                <p>We received a request to reset your WordCover account password.</p>
                <p>Please click the below link to create a new password.</p>
                <p>
                <a href="{reset_link}" style="display:inline-block;padding:10px 16px;margin-top:8px;background-color:#7b4b4b;color:#ffffff;text-decoration:none;border-radius:4px;">
                    Reset your password
                </a>
                </p>
                <p>If you did not request a password reset, you can safely ignore this email.</p>
                """

        send_mail(
            subject,
            message,
            getattr(settings, "DEFAULT_FROM_EMAIL", None) or f"no-reply@{settings.DJANGO_APP_HOSTNAME}",
            [email],
            fail_silently=False,
            html_message=html_message,
        )

        return Response(
            {"detail": "A password reset link has been sent to your email address."},
            status=status.HTTP_200_OK,
        )


@method_decorator(csrf_exempt, name="dispatch")
class ResetPasswordApiView(APIView):
    """
    Public API to complete a password reset.
    POST JSON: { "uid": "<uidb64>", "token": "<token>", "password": "<new password>" }.
    """
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        uidb64 = (request.data.get("uid") or "").strip()
        token = (request.data.get("token") or "").strip()
        password = (request.data.get("password") or "").strip()

        if not uidb64 or not token or not password:
            return Response(
                {"detail": "uid, token, and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            User = get_user_model()
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response(
                {"detail": "Invalid reset link."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not _password_reset_token_generator.check_token(user, token):
            return Response(
                {"detail": "This reset link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(password) < 4:
            return Response(
                {"detail": "Password must be at least 4 characters long."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(password)
        user.save()

        return Response(
            {"detail": "Your password has been reset. You can now sign in with your new password."},
            status=status.HTTP_200_OK,
        )


def _validate_password_strength(password):
    """Return error message if password is weak, else None."""
    if len(password) < 8:
        return "Password must be at least 8 characters long."
    if not re.search(r"[A-Z]", password):
        return "Password must include at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return "Password must include at least one lowercase letter."
    if not re.search(r"[0-9]", password):
        return "Password must include at least one number."
    if not re.search(r'[!@#$%^&*(),.?":{}|<>_\-+=\\[\];\'/`~]', password):
        return "Password must include at least one special character."
    return None


@method_decorator(csrf_exempt, name="dispatch")
class ChangePasswordApiView(APIView):
    """
    API for authenticated users to change their password.
    POST JSON: { "current_password": "...", "new_password": "..." }.
    Uses SessionAuthenticationNoCSRF so SPA can POST without CSRF token.
    """
    authentication_classes = [SessionAuthenticationNoCSRF]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Support both camelCase (from parser) and snake_case keys
        current_password = (
            request.data.get("current_password") or request.data.get("currentPassword") or ""
        ).strip()
        new_password = (
            request.data.get("new_password") or request.data.get("newPassword") or ""
        ).strip()

        if not current_password:
            return Response(
                {"detail": "Current password is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not new_password:
            return Response(
                {"detail": "New password is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        # Reload user from DB to ensure we have latest password hash
        User = get_user_model()
        try:
            user = User.objects.get(pk=user.pk)
        except User.DoesNotExist:
            return Response(
                {"detail": "User not found. Please sign in again."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not user.has_usable_password():
            return Response(
                {"detail": "Your account does not have a password set yet. Please use 'Forgot password' to set one, or contact an administrator."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not user.check_password(current_password):
            return Response(
                {"detail": "Current password is incorrect. If you recently switched accounts, try signing out and signing in again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        err = _validate_password_strength(new_password)
        if err:
            return Response({"detail": err}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()

        return Response(
            {"detail": "Your password has been changed successfully."},
            status=status.HTTP_200_OK,
        )


def _get_contribution_user():
    """User for creating Postmark and related TimestampedModel from a contribution (no request user)."""
    User = get_user_model()
    return User.objects.filter(is_superuser=True).first() or User.objects.first()


def _get_payload_value(payload, *keys, default=None):
    """Get value from payload supporting both snake_case and camelCase keys. Tries each key in order."""
    if not payload or not isinstance(payload, dict):
        return default
    for k in keys:
        v = payload.get(k)
        if v is not None and v != "":
            return v
    return default


def _coerce_int_list(raw):
    """Convert a scalar/list payload value into a de-duplicated int list."""
    if raw is None or raw == "":
        return []
    values = raw if isinstance(raw, (list, tuple)) else [raw]
    out = []
    for v in values:
        try:
            n = int(v)
        except (TypeError, ValueError):
            continue
        if n not in out:
            out.append(n)
    return out


def _parse_optional_bool(raw):
    """Parse common truthy/falsy payload forms to bool; return None when unspecified/invalid."""
    if raw is None or raw == "":
        return None
    if isinstance(raw, bool):
        return raw
    s = str(raw).strip().lower()
    if s in {"true", "1", "yes", "y"}:
        return True
    if s in {"false", "0", "no", "n"}:
        return False
    return None


def _resolve_framing_style_from_payload(payload, user, fallback_id=None):
    """
    Resolve framing style from payload:
    - single framing_style_id/framingStyleId -> existing style
    - framing_style_ids/framingStyleIds (list) -> combined style (create if needed)
    """
    if not user:
        user = _get_contribution_user()
    framing_ids_raw = _get_payload_value(payload, "framing_style_ids", "framingStyleIds")
    framing_ids = _coerce_int_list(framing_ids_raw)

    if framing_ids:
        styles = list(FramingStyle.objects.filter(pk__in=framing_ids))
        if not styles:
            return FramingStyle.objects.filter(pk=fallback_id).first() if fallback_id is not None else None
        order = {sid: idx for idx, sid in enumerate(framing_ids)}
        styles.sort(key=lambda s: order.get(s.pk, 10**9))
        if len(styles) == 1:
            return styles[0]
        combo_name = " + ".join(s.framing_style_name.strip() for s in styles if s.framing_style_name.strip())[:100]
        if not combo_name:
            return styles[0]
        combo = FramingStyle.objects.filter(framing_style_name__iexact=combo_name).first()
        if combo:
            return combo
        combo_desc = f"Auto-generated combined framing style from IDs: {', '.join(str(s.pk) for s in styles)}"
        combo, _ = FramingStyle.objects.get_or_create(
            framing_style_name=combo_name,
            defaults={
                "framing_description": combo_desc[:1000],
                "created_by": user,
                "modified_by": user,
            },
        )
        return combo

    single_id = _get_payload_value(payload, "framing_style_id", "framingStyleId")
    if single_id is None and fallback_id is not None:
        single_id = fallback_id
    try:
        return FramingStyle.objects.filter(pk=int(single_id)).first() if single_id is not None else None
    except (TypeError, ValueError):
        return None


def _decimal_mm_from_payload(payload, snake_key, camel_key):
    """
    Parse a positive millimetre dimension from contribution/catalog payload.
    PostmarkSize uses DecimalField(max_digits=8, decimal_places=2).
    """
    from decimal import Decimal, InvalidOperation

    raw = _get_payload_value(payload, snake_key, camel_key)
    if raw is None or raw == "":
        return None
    if isinstance(raw, (list, tuple)):
        raw = raw[0] if raw else None
    if raw is None or raw == "":
        return None
    try:
        d = Decimal(str(raw).strip())
    except (InvalidOperation, ValueError, TypeError):
        return None
    if d <= 0:
        return None
    if d > Decimal("999999.99"):
        return None
    return d.quantize(Decimal("0.01"))


def _apply_postmark_size_from_contribution_payload(postmark, user, payload):
    """
    Replace all PostmarkSize rows for this postmark from contribution payload.
    Prefers width_mm + height_mm (stored as PostmarkSize.width / .height).
    Falls back to legacy single-field ``dimensions`` -> size_notes with 0,0.
    """
    from decimal import Decimal

    w = _decimal_mm_from_payload(payload, "width_mm", "widthMm")
    if w is None:
        w = _decimal_mm_from_payload(payload, "width", "Width")
    h = _decimal_mm_from_payload(payload, "height_mm", "heightMm")
    if h is None:
        h = _decimal_mm_from_payload(payload, "height", "Height")
    legacy = (_get_payload_value(payload, "dimensions", "Dimensions") or "").strip()

    PostmarkSize.objects.filter(postmark=postmark).delete()

    if w is not None and h is not None:
        PostmarkSize.objects.create(
            postmark=postmark,
            width=w,
            height=h,
            size_notes="",
            created_by=user,
            modified_by=user,
        )
    elif legacy:
        PostmarkSize.objects.create(
            postmark=postmark,
            width=Decimal("0"),
            height=Decimal("0"),
            size_notes=legacy[:255],
            created_by=user,
            modified_by=user,
        )


def _save_contribution_image(uploaded_file):
    """
    Save uploaded image to media/postmarks/contributions/ and return metadata for PostmarkImage.
    Returns dict with storage_filename, original_filename, file_checksum, mime_type,
    image_width, image_height, file_size_bytes, or None if invalid/failed.
    """
    if not uploaded_file or not getattr(uploaded_file, "read", None):
        return None
    allowed_types = {"image/png", "image/jpeg", "image/jpg", "image/tiff"}
    content_type = getattr(uploaded_file, "content_type", "") or ""
    if content_type not in allowed_types:
        return None
    max_size_bytes = 10 * 1024 * 1024  # 10 MB
    uploaded_file.seek(0)
    content = uploaded_file.read()
    if len(content) > max_size_bytes:
        return None
    if not content:
        return None
    uploaded_file.seek(0)
    try:
        from PIL import Image as PILImage
    except ImportError:
        return None
    # Checksum
    file_checksum = hashlib.sha256(content).hexdigest()
    # Unique storage path: contributions/<uuid>.<ext>
    ext = "jpg"
    if "png" in content_type:
        ext = "png"
    elif "tiff" in content_type:
        ext = "tiff"
    storage_name = f"contributions/{uuid.uuid4().hex}.{ext}"
    media_dir = os.path.join(settings.MEDIA_ROOT, "postmarks")
    sub_dir = os.path.join(media_dir, "contributions")
    os.makedirs(sub_dir, exist_ok=True)
    file_path = os.path.join(media_dir, storage_name)
    with open(file_path, "wb") as f:
        f.write(content)
    # Dimensions
    try:
        img = PILImage.open(io.BytesIO(content))
        width, height = img.size
    except Exception:
        width, height = 0, 0
    return {
        "storage_filename": storage_name,
        "original_filename": getattr(uploaded_file, "name", "image")[:255] or "image",
        "file_checksum": file_checksum,
        "mime_type": content_type[:50],
        "image_width": width,
        "image_height": height,
        "file_size_bytes": len(content),
    }


def _get_user_assigned_units(user):
    """Return queryset of AdministrativeUnits explicitly assigned to this user."""
    return AdministrativeUnit.objects.filter(
        user_location_assignments__user=user
    ).distinct()


def _get_allowed_state_strings(user):
    """Return (allowed_strings_set, assigned_units_queryset)."""
    units = _get_user_assigned_units(user)
    allowed = set()
    if not units.exists():
        return allowed, units
    identities = AdministrativeUnitIdentity.objects.filter(
        administrative_unit__in=units,
        effective_to_date__isnull=True,
    )
    for ident in identities:
        name = (ident.unit_name or "").strip()
        abv = (ident.unit_abbreviation or "").strip()
        if name:
            allowed.add(name.lower())
        if abv:
            allowed.add(abv.lower())
    return allowed, units


def _resolve_assigned_admin_unit(user, state_str):
    """Match a state string to one of the user's assigned AdministrativeUnits."""
    state_norm = (state_str or "").strip().lower()
    if not state_norm:
        return None
    allowed, units = _get_allowed_state_strings(user)
    if not allowed:
        return None
    identities = AdministrativeUnitIdentity.objects.filter(
        administrative_unit__in=units,
        effective_to_date__isnull=True,
    )
    for ident in identities:
        name = (ident.unit_name or "").strip().lower()
        abv = (ident.unit_abbreviation or "").strip().lower()
        if state_norm == name or state_norm == abv:
            return ident.administrative_unit
    return None


def _is_own_approved_catalog_postmark(user, postmark_id):
    """
    True if this catalog postmark is linked to an approved Contribution created by the user.
    Used so state editors can edit their own published listings without peer review.
    """
    if not getattr(user, "is_authenticated", False) or postmark_id is None:
        return False
    return Contribution.objects.filter(
        postmark_id=postmark_id,
        contributor_id=user.id,
        status=Contribution.STATUS_APPROVED,
    ).exists()


def _create_contribution_only(payload, contributor):
    """
    Create a Contribution record only (no Postmark). Acts as a moderation ticket.
    Postmark is created when a State Editor approves. Returns the Contribution or None.
    """
    if not contributor:
        return None
    try:
        submitted_data = {
            "state": (payload.get("state") or "").strip(),
            "town": (payload.get("town") or "").strip(),
            "date_range": (payload.get("date_range") or "").strip(),
            "dates_observed": (payload.get("dates_observed") or "").strip(),
            "type": (payload.get("type") or "").strip(),
            "color": (payload.get("color") or "").strip(),
            "manuscript": (payload.get("manuscript") or "").strip(),
            "is_irreg": payload.get("is_irreg"),
            "impression": (payload.get("impression") or "").strip(),
            "date_type": (payload.get("date_type") or payload.get("dateType") or "").strip(),
            "dimensions": (payload.get("dimensions") or "").strip(),
            "width_mm": (payload.get("width_mm") or payload.get("widthMm") or "").strip(),
            "height_mm": (payload.get("height_mm") or payload.get("heightMm") or "").strip(),
            "description": (payload.get("description") or "").strip(),
            "inscription_txt": (payload.get("inscription_txt") or payload.get("inscriptionText") or "").strip(),
            "references": (payload.get("references") or "").strip(),
            "submitter_name": (payload.get("submitter_name") or "").strip(),
            # Contributor -> editor note (used mainly for suggestions/corrections).
            "contributor_comment": (payload.get("contributor_comment") or "").strip(),
            "original_postmark_id": str(payload.get("original_postmark_id", "")),
        }
        if payload.get("lettering_style_id") is not None:
            submitted_data["lettering_style_id"] = payload["lettering_style_id"]
        if payload.get("framing_style_id") is not None:
            submitted_data["framing_style_id"] = payload["framing_style_id"]
        if payload.get("date_format_id") is not None:
            submitted_data["date_format_id"] = payload["date_format_id"]
        if payload.get("image_metas"):
            submitted_data["image_metas"] = payload["image_metas"]
        elif payload.get("image_meta"):
            submitted_data["image_meta"] = payload["image_meta"]
        # Proposed catalog fields (e.g. state editor peer-review submissions)
        psid = payload.get("postmark_shape_id")
        if psid is not None:
            try:
                submitted_data["postmark_shape_id"] = int(psid)
            except (TypeError, ValueError):
                pass
        if payload.get("estimated_value") is not None and payload.get("estimated_value") != "":
            submitted_data["proposed_estimated_value"] = payload.get("estimated_value")
        rn_raw = payload.get("review_notes")
        if rn_raw is not None and str(rn_raw).strip():
            submitted_data["review_notes"] = str(rn_raw).strip()
        contrib = Contribution.objects.create(
            contributor=contributor,
            postmark=None,
            status=Contribution.STATUS_PENDING,
            submitted_data=submitted_data,
        )
        return contrib
    except Exception:
        return None


def _apply_contribution_to_catalog(contrib):
    """
    Apply a Contribution's submitted_data to the catalog.
    For new entries (postmark=None): create Postmark via _create_postmark_in_catalog.
    For edits (postmark set): update Postmark via _update_postmark_in_catalog.
    Returns the Postmark or None on failure.
    """
    payload = contrib.submitted_data or {}
    state = (
        _get_payload_value(
            payload,
            "state",
            "State",
            "state_display",
            "stateDisplay",
        )
        or ""
    ).strip()
    town = (
        _get_payload_value(
            payload,
            "town",
            "Town",
            "town_display",
            "townDisplay",
            "city",
            "City",
        )
        or ""
    ).strip()
    # Older contributions may miss state/town in submitted_data. For edits tied to
    # an existing catalog postmark, fall back to the current postmark location.
    if (not state or not town) and contrib.postmark_id:
        try:
            pm = (
                Postmark.objects.select_related("state", "postal_facility_identity")
                .filter(postmark_id=contrib.postmark_id)
                .first()
            )
            if pm:
                if not town and getattr(pm, "postal_facility_identity", None):
                    town = (pm.postal_facility_identity.facility_name or "").strip()
                if not state and getattr(pm, "state", None):
                    ident = pm.state.get_current_identity() if hasattr(pm.state, "get_current_identity") else None
                    state = ((ident.unit_name if ident else "") or pm.state.reference_code or "").strip()
        except Exception:
            pass
    if not state or not town:
        logger.warning("_apply_contribution_to_catalog: contribution %s missing state or town in submitted_data", contrib.id)
        return None
    payload.setdefault("state", state)
    payload.setdefault("town", town)
    submitter_name = (_get_payload_value(payload, "submitter_name", "submitterName") or "").strip()
    if contrib.postmark_id:
        return _update_postmark_in_catalog(contrib.postmark_id, payload, submitter_name)
    postmark = _create_postmark_in_catalog(payload)
    if postmark:
        contrib.postmark = postmark
        contrib.save(update_fields=["postmark", "updated_at"])
    return postmark


def _create_postmark_in_catalog(payload, editor_data=None, created_by_user=None):
    """
    Create a Postmark (and related records) directly in the catalog tables from
    the contribute form payload. No separate contribution table; data goes into
    the same tables that catalog search uses.
    Uses created_by_user if provided (editor direct-add), else a system user for created_by/modified_by.
    When editor_data is provided (dict with postmark_shape_id, lettering_style_id, framing_style_id,
    date_format_id, estimated_value, review_notes), uses those for catalog fields and sets
    contribution_approval_status='approved', and creates PostmarkValuation. Returns the Postmark or None on failure.
    """
    user = created_by_user or _get_contribution_user()
    if not user:
        return None
    try:
        # Determine owning Site robustly. Some environments may not have Site(id=1),
        # and hardcoding it can cause an integrity error (500) on create.
        try:
            from django.contrib.sites.models import Site
            configured_site_id = getattr(settings, "SITE_ID", None)
            site_obj = None
            if configured_site_id:
                site_obj = Site.objects.filter(pk=configured_site_id).first()
            if site_obj is None:
                site_obj = Site.objects.order_by("id").first()
        except Exception:
            site_obj = None
        if site_obj is None:
            logger.error("_create_postmark_in_catalog failed: no Site rows exist (SITE_ID=%s)", getattr(settings, "SITE_ID", None))
            return None

        state_str = (_get_payload_value(payload, "state", "State") or "").strip()
        town_str = (_get_payload_value(payload, "town", "Town") or "").strip()
        date_range_str = (_get_payload_value(payload, "date_range", "dateRange") or "").strip()
        type_str = (_get_payload_value(payload, "type", "Type") or "").strip()
        color_str = (_get_payload_value(payload, "color", "Color") or "").strip()
        manuscript_str = (_get_payload_value(payload, "manuscript", "Manuscript") or "").strip()
        is_irreg_val = _parse_optional_bool(_get_payload_value(payload, "is_irreg", "isIrreg", "isIrregular"))
        impression_str = (_get_payload_value(payload, "impression", "Impression") or "").strip()
        date_type_str = (_get_payload_value(payload, "date_type", "dateType", "DateType") or "").strip()
        description_str = (_get_payload_value(payload, "description", "Description") or "").strip()
        inscription_txt_str = (_get_payload_value(payload, "inscription_txt", "inscriptionText", "inscription_text", "inscriptionText") or "").strip()
        references_str = (_get_payload_value(payload, "references", "References") or "").strip()
        original_postmark_id = _get_payload_value(payload, "original_postmark_id", "originalPostmarkId")

        # State: get or create AdministrativeUnit + Identity
        state_slug = slugify(state_str)[:40] or "unknown"
        admin_unit = payload.get("admin_unit")
        if not admin_unit:
            ref_code = f"CONTRIB-{state_slug}"
            admin_unit, _ = AdministrativeUnit.objects.get_or_create(
                reference_code=ref_code,
                defaults={"created_by": user, "modified_by": user},
            )
        effective_from = date(1900, 1, 1)
        if admin_unit and state_str and not AdministrativeUnitIdentity.objects.filter(
            administrative_unit=admin_unit,
            unit_name=state_str[:255],
            effective_from_date=effective_from,
        ).exists():
            AdministrativeUnitIdentity.objects.create(
                administrative_unit=admin_unit,
                unit_name=state_str[:255],
                unit_abbreviation=(state_slug.upper()[:10] if state_slug != "unknown" else "CONTRIB"),
                unit_type="STATE",
                hierarchy_level=2,
                change_reason="INITIAL",
                effective_from_date=effective_from,
                effective_to_date=None,
                created_by=user,
                modified_by=user,
            )
        # Facility: get or create PostalFacility + Identity for town
        town_slug = slugify(town_str)[:30] or "unknown"
        facility_ref = f"CONTRIB-{town_slug}-{state_slug}"[:50]
        facility, _ = PostalFacility.objects.get_or_create(
            reference_code=facility_ref,
            defaults={"created_by": user, "modified_by": user},
        )
        identity, _ = PostalFacilityIdentity.objects.get_or_create(
            postal_facility=facility,
            effective_from_date=effective_from,
            defaults={
                "facility_name": town_str[:255],
                "facility_type": "POST_OFFICE",
                "is_operational": True,
                "created_by": user,
                "modified_by": user,
            },
        )
        # Link facility to state (jurisdiction)
        if not JurisdictionalAffiliation.objects.filter(
            postal_facility_identity=identity,
            administrative_unit=admin_unit,
            effective_from_date=effective_from,
        ).exists():
            JurisdictionalAffiliation.objects.create(
                postal_facility_identity=identity,
                administrative_unit=admin_unit,
                effective_from_date=effective_from,
                effective_to_date=None,
                affiliation_source="Contribution",
                created_by=user,
                modified_by=user,
            )
        # Shape: editor approve payload, else contribution submitted_data postmark_shape_id, else type name
        shape = None
        if editor_data and editor_data.get("postmark_shape_id") is not None:
            shape = PostmarkShape.objects.filter(pk=editor_data.get("postmark_shape_id")).first()
        if shape is None:
            shape_pk = _get_payload_value(payload, "postmark_shape_id", "postmarkShapeId")
            if shape_pk is not None and str(shape_pk).strip() != "":
                try:
                    shape = PostmarkShape.objects.filter(pk=int(shape_pk)).first()
                except (TypeError, ValueError):
                    shape = None
        if shape is None:
            shape = PostmarkShape.objects.filter(shape_name=type_str).first()
        if shape is None:
            shape = PostmarkShape.objects.first()
        # Lettering, framing, date format: from payload (contributor-provided), else editor_data, else defaults
        lettering_id = _get_payload_value(payload, "lettering_style_id", "letteringStyleId")
        framing_id = _get_payload_value(payload, "framing_style_id", "framingStyleId")
        date_fmt_id = _get_payload_value(payload, "date_format_id", "dateFormatId")
        if lettering_id is None and editor_data:
            lettering_id = editor_data.get("lettering_style_id")
        if framing_id is None and editor_data:
            framing_id = editor_data.get("framing_style_id")
        if date_fmt_id is None and editor_data:
            date_fmt_id = editor_data.get("date_format_id")
        lettering = LetteringStyle.objects.filter(pk=lettering_id).first() if lettering_id is not None else None
        framing = _resolve_framing_style_from_payload(payload, user, fallback_id=framing_id)
        date_fmt = DateFormat.objects.filter(pk=date_fmt_id).first() if date_fmt_id is not None else None
        if lettering is None:
            lettering = LetteringStyle.objects.first()
        if framing is None:
            framing = FramingStyle.objects.first()
        if date_fmt is None:
            date_fmt = DateFormat.objects.first()
        if not shape or not lettering or not framing or not date_fmt:
            return None
        # Unique key
        postmark_key = f"CONTRIB-{uuid.uuid4().hex[:12]}"
        is_manuscript = manuscript_str.lower() == "yes"
        # Build other_characteristics from contributor fields
        other_parts = []
        if description_str:
            other_parts.append(f"Description: {description_str}")
        if references_str:
            other_parts.append(f"Citation references: {references_str}")
        if original_postmark_id:
            other_parts.append(f"Correction to catalog ID: {original_postmark_id}")
        submitter_str = (_get_payload_value(payload, "submitter_name", "submitterName") or "").strip()
        if submitter_str:
            other_parts.append(f"Submitted by: {submitter_str}")
        if editor_data and (editor_data.get("review_notes") or "").strip():
            other_parts.append(f"Comment: {(editor_data.get('review_notes') or '').strip()}")
        other_characteristics = "\n".join(other_parts) if other_parts else ""

        approval_status = "approved" if editor_data else "pending"
        postmark = Postmark.objects.create(
            site=site_obj,
            postal_facility_identity=identity,
            state=admin_unit,
            postmark_shape=shape,
            lettering_style=lettering,
            framing_style=framing,
            date_format=date_fmt,
            postmark_key=postmark_key,
            rate_location="NONE",
            rate_value="",
            is_manuscript=is_manuscript,
            is_irreg=is_irreg_val,
            impression=impression_str[:10] if impression_str else None,
            date_type=date_type_str[:20] if date_type_str else None,
            source_catalog="User contribution",
            contribution_approval_status=approval_status,
            other_characteristics=other_characteristics[:10000] if other_characteristics else "",
            inscription_txt=inscription_txt_str,
            created_by=user,
            modified_by=user,
        )
        # Dimensions: width_mm + height_mm on PostmarkSize, or legacy ``dimensions`` -> size_notes
        _apply_postmark_size_from_contribution_payload(postmark, user, payload)
        # Color
        color_name = color_str or "Black"
        color, _ = Color.objects.get_or_create(
            color_name=color_name[:50],
            defaults={"created_by": user, "modified_by": user},
        )
        PostmarkColor.objects.create(
            postmark=postmark,
            color=color,
            created_by=user,
            modified_by=user,
        )
        # Dates seen: primary range plus optional extra observed dates.
        for earliest, latest in _parse_dates_seen_rows_from_payload(payload):
            PostmarkDatesSeen.objects.create(
                postmark=postmark,
                earliest_date_seen=earliest,
                latest_date_seen=latest,
                created_by=user,
                modified_by=user,
            )
        # Optional: attach uploaded image(s) (support image_metas array or single image_meta)
        image_metas = payload.get("image_metas") or payload.get("imageMetas") or []
        if isinstance(image_metas, list) and len(image_metas) > 0:
            for idx, image_meta in enumerate(image_metas):
                if not isinstance(image_meta, dict):
                    continue
                storage_fn = image_meta.get("storage_filename") or image_meta.get("storageFilename")
                if storage_fn:
                    PostmarkImage.objects.create(
                        postmark=postmark,
                        original_filename=(image_meta.get("original_filename") or image_meta.get("originalFilename") or "image")[:255],
                        storage_filename=storage_fn,
                        file_checksum=(image_meta.get("file_checksum") or image_meta.get("fileChecksum") or "")[:64],
                        mime_type=(image_meta.get("mime_type") or image_meta.get("mimeType") or "image/jpeg")[:50],
                        image_width=image_meta.get("image_width") or image_meta.get("imageWidth") or 0,
                        image_height=image_meta.get("image_height") or image_meta.get("imageHeight") or 0,
                        file_size_bytes=image_meta.get("file_size_bytes") or image_meta.get("fileSizeBytes") or 0,
                        image_view="FULL",
                        display_order=idx,
                        uploaded_by=user,
                        created_by=user,
                        modified_by=user,
                    )
        else:
            image_meta = payload.get("image_meta") or payload.get("imageMeta")
            if image_meta and isinstance(image_meta, dict):
                storage_fn = image_meta.get("storage_filename") or image_meta.get("storageFilename")
                if storage_fn:
                    PostmarkImage.objects.create(
                        postmark=postmark,
                        original_filename=(image_meta.get("original_filename") or image_meta.get("originalFilename") or "image")[:255],
                        storage_filename=storage_fn,
                        file_checksum=(image_meta.get("file_checksum") or image_meta.get("fileChecksum") or "")[:64],
                        mime_type=(image_meta.get("mime_type") or image_meta.get("mimeType") or "image/jpeg")[:50],
                        image_width=image_meta.get("image_width") or image_meta.get("imageWidth") or 0,
                        image_height=image_meta.get("image_height") or image_meta.get("imageHeight") or 0,
                        file_size_bytes=image_meta.get("file_size_bytes") or image_meta.get("fileSizeBytes") or 0,
                        image_view="FULL",
                        display_order=0,
                        uploaded_by=user,
                        created_by=user,
                        modified_by=user,
                    )
        # Editor direct-add: create valuation with estimated_value (TimestampedModel requires created_by, modified_by)
        if editor_data and created_by_user is not None and editor_data.get("estimated_value") is not None:
            try:
                from decimal import Decimal
                val = editor_data["estimated_value"]
                if not isinstance(val, Decimal):
                    val = Decimal(str(val))
                PostmarkValuation.objects.create(
                    postmark=postmark,
                    valued_by_user=created_by_user,
                    estimated_value=val,
                    valuation_date=timezone.now().date(),
                    created_by=created_by_user,
                    modified_by=created_by_user,
                )
            except Exception:
                pass
        return postmark
    except Exception as e:
        logger.exception("_create_postmark_in_catalog failed: %s", e)
        return None


def _update_postmark_in_catalog(postmark_id, payload, submitter_name, *, keep_public_approved=False):
    """
    Update an existing user-contribution Postmark in place.
    Verifies permissions and updates in place. Returns the updated Postmark or None.

    When keep_public_approved is True, the listing stays contribution_approval_status='approved'
    and last_public_update_at is refreshed so /search shows the updated data immediately
    (state editor editing their own approved submission).
    Otherwise the listing is set back to pending re-approval (existing behavior).
    """
    try:
        postmark = Postmark.objects.filter(postmark_id=postmark_id).first()
        if not postmark:
            return None

        user = _get_contribution_user()
        if not user:
            return None

        state_str = (_get_payload_value(payload, "state", "State") or "").strip()
        town_str = (_get_payload_value(payload, "town", "Town") or "").strip()
        date_range_str = (_get_payload_value(payload, "date_range", "dateRange") or "").strip()
        type_str = (_get_payload_value(payload, "type", "Type") or "").strip()
        color_str = (_get_payload_value(payload, "color", "Color") or "").strip()
        manuscript_str = (_get_payload_value(payload, "manuscript", "Manuscript") or "").strip()
        is_irreg_val = _parse_optional_bool(_get_payload_value(payload, "is_irreg", "isIrreg", "isIrregular"))
        impression_str = (_get_payload_value(payload, "impression", "Impression") or "").strip()
        date_type_str = (_get_payload_value(payload, "date_type", "dateType", "DateType") or "").strip()
        description_str = (_get_payload_value(payload, "description", "Description") or "").strip()
        inscription_txt_str = (_get_payload_value(payload, "inscription_txt", "inscriptionText", "inscription_text", "inscriptionText") or "").strip()
        references_str = (_get_payload_value(payload, "references", "References") or "").strip()

        # State / facility / identity (same as create)
        state_slug = slugify(state_str)[:40] or "unknown"
        ref_code = f"CONTRIB-{state_slug}"
        admin_unit, _ = AdministrativeUnit.objects.get_or_create(
            reference_code=ref_code,
            defaults={"created_by": user, "modified_by": user},
        )
        effective_from = date(1900, 1, 1)
        if not AdministrativeUnitIdentity.objects.filter(
            administrative_unit=admin_unit,
            unit_name=state_str[:255],
            effective_from_date=effective_from,
        ).exists():
            AdministrativeUnitIdentity.objects.create(
                administrative_unit=admin_unit,
                unit_name=state_str[:255],
                unit_abbreviation=(state_slug.upper()[:10] if state_slug != "unknown" else "CONTRIB"),
                unit_type="STATE",
                hierarchy_level=2,
                change_reason="INITIAL",
                effective_from_date=effective_from,
                effective_to_date=None,
                created_by=user,
                modified_by=user,
            )
        town_slug = slugify(town_str)[:30] or "unknown"
        facility_ref = f"CONTRIB-{town_slug}-{state_slug}"[:50]
        facility, _ = PostalFacility.objects.get_or_create(
            reference_code=facility_ref,
            defaults={"created_by": user, "modified_by": user},
        )
        identity, _ = PostalFacilityIdentity.objects.get_or_create(
            postal_facility=facility,
            effective_from_date=effective_from,
            defaults={
                "facility_name": town_str[:255],
                "facility_type": "POST_OFFICE",
                "is_operational": True,
                "created_by": user,
                "modified_by": user,
            },
        )
        if not JurisdictionalAffiliation.objects.filter(
            postal_facility_identity=identity,
            administrative_unit=admin_unit,
            effective_from_date=effective_from,
        ).exists():
            JurisdictionalAffiliation.objects.create(
                postal_facility_identity=identity,
                administrative_unit=admin_unit,
                effective_from_date=effective_from,
                effective_to_date=None,
                affiliation_source="Contribution",
                created_by=user,
                modified_by=user,
            )
        shape = PostmarkShape.objects.filter(shape_name=type_str).first() or PostmarkShape.objects.first()
        if not shape:
            return None
        framing = _resolve_framing_style_from_payload(payload, user, fallback_id=postmark.framing_style_id)
        if framing is None:
            framing = FramingStyle.objects.first()
        if framing is None:
            return None
        is_manuscript = manuscript_str.lower() == "yes"
        other_parts = []
        if description_str:
            other_parts.append(f"Description: {description_str}")
        if references_str:
            other_parts.append(f"Citation references: {references_str}")
        if submitter_name.strip():
            other_parts.append(f"Submitted by: {submitter_name.strip()}")
        other_characteristics = "\n".join(other_parts) if other_parts else ""

        # Update Postmark core fields
        postmark.postal_facility_identity = identity
        postmark.state = admin_unit
        postmark.postmark_shape = shape
        postmark.framing_style = framing
        postmark.is_manuscript = is_manuscript
        postmark.is_irreg = is_irreg_val
        postmark.impression = impression_str[:10] if impression_str else None
        postmark.date_type = date_type_str[:20] if date_type_str else None
        postmark.other_characteristics = other_characteristics[:10000] if other_characteristics else ""
        postmark.inscription_txt = inscription_txt_str

        if keep_public_approved:
            postmark.contribution_approval_status = "approved"
            postmark.last_public_update_at = timezone.now()
        else:
            # If this listing has already been approved at least once, capture that fact
            # by ensuring last_public_update_at is populated before we move it back to
            # a pending approval state. This lets catalog/search keep showing the
            # previously-approved listing while new edits await review.
            if (
                postmark.source_catalog == "User contribution"
                and postmark.contribution_approval_status == "approved"
                and not postmark.last_public_update_at
            ):
                postmark.last_public_update_at = timezone.now()
            postmark.contribution_approval_status = "pending"

        postmark.modified_by = user
        postmark.save(
            update_fields=[
                "postal_facility_identity",
                "state",
                "postmark_shape",
                "framing_style",
                "is_manuscript",
                "is_irreg",
                "impression",
                "date_type",
                "other_characteristics",
                "inscription_txt",
                "contribution_approval_status",
                "last_public_update_at",
                "modified_by",
            ]
        )

        # Replace dimensions (width_mm/height_mm or legacy dimensions string)
        _apply_postmark_size_from_contribution_payload(postmark, user, payload)

        # Replace color
        PostmarkColor.objects.filter(postmark=postmark).delete()
        color_name = color_str or "Black"
        color, _ = Color.objects.get_or_create(
            color_name=color_name[:50],
            defaults={"created_by": user, "modified_by": user},
        )
        PostmarkColor.objects.create(postmark=postmark, color=color, created_by=user, modified_by=user)

        # Replace dates seen (primary range plus optional extra observed dates)
        PostmarkDatesSeen.objects.filter(postmark=postmark).delete()
        for earliest, latest in _parse_dates_seen_rows_from_payload(payload):
            PostmarkDatesSeen.objects.create(
                postmark=postmark,
                earliest_date_seen=earliest,
                latest_date_seen=latest,
                created_by=user,
                modified_by=user,
            )

        # Append new images if provided (do NOT delete existing catalog images).
        # Supports image_metas array or single image_meta.
        image_metas = payload.get("image_metas") or payload.get("imageMetas") or []
        single_image_meta = payload.get("image_meta") or payload.get("imageMeta")
        if not (isinstance(image_metas, list) and len(image_metas) > 0) and isinstance(single_image_meta, dict):
            image_metas = [single_image_meta]

        if isinstance(image_metas, list) and len(image_metas) > 0:
            existing_storage = set(
                PostmarkImage.objects.filter(postmark=postmark).values_list("storage_filename", flat=True)
            )
            next_order = (
                (PostmarkImage.objects.filter(postmark=postmark).aggregate(Max("display_order")).get("display_order__max") or -1)
                + 1
            )
            for image_meta in image_metas:
                if not isinstance(image_meta, dict):
                    continue
                storage_fn = (image_meta.get("storage_filename") or image_meta.get("storageFilename") or "").strip()
                if not storage_fn or storage_fn in existing_storage:
                    continue
                try:
                    PostmarkImage.objects.create(
                        postmark=postmark,
                        original_filename=(image_meta.get("original_filename") or image_meta.get("originalFilename") or "image")[:255],
                        storage_filename=storage_fn,
                        file_checksum=(image_meta.get("file_checksum") or image_meta.get("fileChecksum") or "")[:64],
                        mime_type=(image_meta.get("mime_type") or image_meta.get("mimeType") or "image/jpeg")[:50],
                        image_width=image_meta.get("image_width") or image_meta.get("imageWidth") or 0,
                        image_height=image_meta.get("image_height") or image_meta.get("imageHeight") or 0,
                        file_size_bytes=image_meta.get("file_size_bytes") or image_meta.get("fileSizeBytes") or 0,
                        image_view="FULL",
                        display_order=next_order,
                        uploaded_by=user,
                        created_by=user,
                        modified_by=user,
                    )
                except Exception:
                    # storage_filename is globally unique; skip if already used elsewhere
                    continue
                existing_storage.add(storage_fn)
                next_order += 1
        return postmark
    except Exception as e:
        logger.exception("_update_postmark_in_catalog failed (postmark_id=%s): %s", postmark_id, e)
        return None


def _sync_approved_contribution_submitted_data(postmark_id, user, payload):
    """
    After a direct catalog update, align Contribution.submitted_data so dashboard list fields match.
    """
    contrib = Contribution.objects.filter(
        postmark_id=postmark_id,
        contributor_id=user.id,
        status=Contribution.STATUS_APPROVED,
    ).first()
    if not contrib:
        return
    sd = dict(contrib.submitted_data or {})
    sd["state"] = (payload.get("state") or "").strip()
    sd["town"] = (payload.get("town") or "").strip()
    sd["date_range"] = (payload.get("date_range") or "").strip()
    sd["dates_observed"] = (payload.get("dates_observed") or "").strip()
    sd["type"] = (payload.get("type") or "").strip()
    sd["color"] = (payload.get("color") or "").strip()
    sd["manuscript"] = (payload.get("manuscript") or "").strip()
    sd["is_irreg"] = payload.get("is_irreg")
    sd["impression"] = (payload.get("impression") or "").strip()
    sd["date_type"] = (payload.get("date_type") or payload.get("dateType") or "").strip()
    sd["dimensions"] = (payload.get("dimensions") or "").strip()
    sd["width_mm"] = (payload.get("width_mm") or "").strip()
    sd["height_mm"] = (payload.get("height_mm") or "").strip()
    sd["description"] = (payload.get("description") or "").strip()
    sd["inscription_txt"] = (payload.get("inscription_txt") or payload.get("inscriptionText") or "").strip()
    sd["references"] = (payload.get("references") or "").strip()
    sd["submitter_name"] = (payload.get("submitter_name") or "").strip()
    cc = (payload.get("contributor_comment") or "").strip()
    if cc:
        sd["contributor_comment"] = cc
    for fk in ("lettering_style_id", "framing_style_id", "date_format_id"):
        v = payload.get(fk)
        if v is not None:
            try:
                sd[fk] = int(v)
            except (TypeError, ValueError):
                pass
    framing_ids = payload.get("framing_style_ids")
    if isinstance(framing_ids, list) and framing_ids:
        sd["framing_style_ids"] = [int(v) for v in framing_ids if str(v).strip().isdigit()]
    if payload.get("image_metas"):
        sd["image_metas"] = payload["image_metas"]
    elif payload.get("image_meta"):
        sd["image_meta"] = payload["image_meta"]
    contrib.submitted_data = sd
    contrib.save(update_fields=["submitted_data", "updated_at"])


@method_decorator(csrf_exempt, name="dispatch")
class ContributionView(APIView):
    """
    API for contributors to submit catalog entries.
    GET: List the current user's contributions.
    POST: Create a Contribution (moderation ticket) instead of writing directly to the catalog.
    On approval by a State Editor, submitted_data is applied to the Postmark.
    """
    authentication_classes = [SessionAuthenticationNoCSRF]
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        """
        List contributions for dashboards.

        Default (Contributor Dashboard):
        - Lists only the current user's contributions.
        - Optional query param:
          * kind=submission   -> only new submissions (no linked postmark, original_postmark_id empty)
          * kind=suggestion   -> only suggestions/corrections (linked postmark or original_postmark_id set)
          * kind omitted/other -> all of the user's contributions (existing behavior).

        Editor Dashboard (state editors / superusers):
        - When mode=editor, returns a moderation queue limited to the editor's
          assigned states (or all contributions for superusers).
        - Optional query param:
          * status=pending/approved/rejected -> filter by contribution status.
        """
        user = request.user
        if not user or not user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

        mode = (request.query_params.get("mode") or "").strip().lower()

        def _paginate_if_requested(queryset):
            """
            Opt-in pagination (keeps backward compatibility).
            If 'page' or 'page_size' is provided, return an object:
              { count, page, page_size, results }
            Otherwise return None (caller should return legacy list response).
            """
            page_raw = request.query_params.get("page")
            page_size_raw = request.query_params.get("page_size") or request.query_params.get("pageSize")
            if page_raw is None and page_size_raw is None:
                return None
            try:
                page = int(page_raw) if page_raw is not None and str(page_raw).strip() != "" else 1
            except (TypeError, ValueError):
                page = 1
            try:
                page_size = int(page_size_raw) if page_size_raw is not None and str(page_size_raw).strip() != "" else 20
            except (TypeError, ValueError):
                page_size = 20
            page = max(1, page)
            page_size = max(1, min(100, page_size))
            total = queryset.count()
            start = (page - 1) * page_size
            end = start + page_size
            page_qs = queryset[start:end]
            serializer = ContributionListSerializer(page_qs, many=True)
            return {
                "count": total,
                "page": page,
                "page_size": page_size,
                "results": serializer.data,
            }

        # Editor moderation queue: state editors / superusers requesting mode=editor
        if mode == "editor" and (getattr(user, "is_superuser", False) or _get_user_role(user) == "state_editor"):
            qs = Contribution.objects.select_related(
                "contributor", "reviewer", "postmark"
            ).order_by("-created_at")

            # Limit to editor's assigned states unless superuser
            if not getattr(user, "is_superuser", False):
                assigned = _get_user_assigned_units(user)
                state_names = []
                for u in assigned:
                    ident = u.get_current_identity()
                    if ident and ident.unit_name:
                        state_names.append(ident.unit_name)
                if state_names:
                    qs = qs.filter(submitted_data__state__in=state_names)
                else:
                    qs = qs.none()

            status_param = (request.query_params.get("status") or "").strip().lower()
            if status_param in {
                Contribution.STATUS_PENDING,
                Contribution.STATUS_APPROVED,
                Contribution.STATUS_REJECTED,
                Contribution.STATUS_NEEDS_REVISION,
            }:
                qs = qs.filter(status=status_param)

            # Optional state-wise filtering for editor dashboard
            state_param = (request.query_params.get("state") or "").strip()
            if state_param and state_param.lower() != "all":
                qs = qs.filter(submitted_data__state__iexact=state_param)

            paginated = _paginate_if_requested(qs)
            if paginated is not None:
                return Response(paginated)

            serializer = ContributionListSerializer(qs, many=True)
            return Response(serializer.data)

        # Default: contributor-centric listing (Contributor Dashboard)
        kind = (request.query_params.get("kind") or "").strip().lower()

        qs = Contribution.objects.filter(contributor=user).select_related(
            "contributor", "reviewer", "postmark"
        ).order_by("-created_at")

        # Split into "submissions" vs "suggestions" without changing stored data:
        # - New submissions created from the Contribute form have:
        #     postmark is NULL
        #     submitted_data["original_postmark_id"] == ""
        # - Suggestions/corrections to existing catalog entries have either:
        #     a linked postmark (postmark_id not NULL), or
        #     submitted_data["original_postmark_id"] set to the target postmark id.
        if kind == "submission":
            qs = qs.filter(postmark__isnull=True, submitted_data__original_postmark_id="")
        elif kind == "suggestion":
            qs = qs.filter(
                Q(postmark__isnull=False) | ~Q(submitted_data__original_postmark_id="")
            )

        paginated = _paginate_if_requested(qs)
        if paginated is not None:
            return Response(paginated)

        serializer = ContributionListSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        data = request.data or {}
        edit_postmark_id_raw = data.get("editPostmarkId") or data.get("edit_postmark_id")
        edit_contribution_id_raw = data.get("editContributionId") or data.get("edit_contribution_id")
        try:
            edit_postmark_id = int(edit_postmark_id_raw) if edit_postmark_id_raw is not None else None
        except (TypeError, ValueError):
            edit_postmark_id = None
        try:
            edit_contribution_id = int(edit_contribution_id_raw) if edit_contribution_id_raw is not None else None
        except (TypeError, ValueError):
            edit_contribution_id = None

        submit_for_review = _truthy_request_flag(
            data.get("submitForReview") or data.get("submit_for_review")
        )

        state = (data.get("state") or "").strip()
        town = (data.get("town") or "").strip()
        first_seen = (data.get("firstSeen") or "").strip()
        last_seen = (data.get("lastSeen") or "").strip()
        type_val = (data.get("type") or "").strip()
        color = (data.get("color") or "").strip()
        manuscript = (data.get("manuscript") or "").strip()
        if not state or not town or not manuscript:
            return Response(
                {"detail": "Missing required fields: state, town, manuscript."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = request.user
        assigned_admin_unit = None
        if not user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

        # New submissions:
        # - Contributors can submit to any state (no location restriction).
        # - State Editors must be explicitly assigned to the chosen state.
        if edit_postmark_id is None and edit_contribution_id is None:
            role = _get_user_role(user)
            if role == "state_editor" and not getattr(user, "is_superuser", False):
                assigned_admin_unit = _resolve_assigned_admin_unit(user, state)
                if not assigned_admin_unit:
                    return Response(
                        {"detail": "You are not assigned to submit listings for this state."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
        # Build a human-readable date_range string for submitted_data.
        # If first/last are ISO dates (YYYY-MM-DD), use a delimiter with spaces to avoid ambiguity.
        if first_seen and last_seen:
            if _YEAR_RE.match(first_seen) and _YEAR_RE.match(last_seen):
                date_range = f"{first_seen}-{last_seen}"
            else:
                date_range = f"{first_seen} - {last_seen}"
        else:
            date_range = first_seen or ""
        submitter_name = (data.get("submitterName") or "").strip()
        if user.is_authenticated:
            submitter_name = user.username or getattr(user, "email", "") or submitter_name
        def _payload_int(key, alt_key=None):
            raw = data.get(key) or (data.get(alt_key) if alt_key else None)
            if raw is None or raw == "":
                return None
            if isinstance(raw, (list, tuple)):
                raw = raw[0] if raw else None
            try:
                return int(raw)
            except (TypeError, ValueError):
                return None
        def _payload_int_list(*keys):
            raw_values = []
            for k in keys:
                if not k:
                    continue
                if hasattr(data, "getlist"):
                    raw_values.extend(data.getlist(k))
                v = data.get(k)
                if isinstance(v, (list, tuple)):
                    raw_values.extend(v)
                elif v not in (None, ""):
                    raw_values.append(v)
            return _coerce_int_list(raw_values)
        wm_in = (data.get("width_mm") or data.get("widthMm") or "").strip()
        hm_in = (data.get("height_mm") or data.get("heightMm") or "").strip()
        payload = {
            "state": state,
            "town": town,
            "date_range": date_range,
            # Preserve raw inputs so the catalog can store full dates when provided.
            "first_seen": first_seen,
            "last_seen": last_seen,
            "dates_observed": data.get("dates_observed") or data.get("datesObserved") or "",
            "type": type_val,
            "color": color,
            "manuscript": manuscript,
            "is_irreg": _parse_optional_bool(data.get("is_irreg") or data.get("isIrreg") or data.get("isIrregular")),
            "impression": (data.get("impression") or "").strip(),
            "date_type": (data.get("date_type") or data.get("dateType") or "").strip(),
            "dimensions": (data.get("dimensions") or "").strip(),
            "width_mm": wm_in,
            "height_mm": hm_in,
            "description": (data.get("description") or "").strip(),
            "inscription_txt": (data.get("inscription_txt") or data.get("inscriptionText") or data.get("inscription_text") or "").strip(),
            "references": (data.get("references") or "").strip(),
            "submitter_name": submitter_name,
            # Contributor -> editor note (optional)
            "contributor_comment": (
                data.get("contributorComment")
                or data.get("contributor_comment")
                or data.get("commentForEditor")
                or data.get("comment_for_editor")
                or ""
            ).strip(),
        }
        lettering_payload = _payload_int("lettering_style_id", "letteringStyleId")
        framing_payload = _payload_int("framing_style_id", "framingStyleId")
        framing_payload_ids = _payload_int_list(
            "framing_style_ids",
            "framing_style_ids[]",
            "framingStyleIds",
            "framingStyleIds[]",
        )
        date_fmt_payload = _payload_int("date_format_id", "dateFormatId")
        if lettering_payload is not None:
            payload["lettering_style_id"] = lettering_payload
        if framing_payload is not None:
            payload["framing_style_id"] = framing_payload
        if framing_payload_ids:
            payload["framing_style_ids"] = framing_payload_ids
        if date_fmt_payload is not None:
            payload["date_format_id"] = date_fmt_payload
        if assigned_admin_unit is not None:
            payload["admin_unit"] = assigned_admin_unit
        image_files = request.FILES.getlist("image") or []
        if image_files:
            image_metas = []
            for image_file in image_files:
                image_meta = _save_contribution_image(image_file)
                if image_meta:
                    image_metas.append(image_meta)
            if image_metas:
                payload["image_metas"] = image_metas
                if len(image_metas) == 1:
                    payload["image_meta"] = image_metas[0]
                else:
                    payload.pop("image_meta", None)
        elif edit_postmark_id is None and edit_contribution_id is None:
            return Response(
                {"detail": "Missing required field: image."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # State editors (non-superuser): new listings always go to peer review; preserve proposed catalog fields on the ticket.
        if edit_postmark_id is None and edit_contribution_id is None:
            merge_role = _get_user_role(user)
            if merge_role == "state_editor" and not getattr(user, "is_superuser", False):
                shape_merge = _payload_int("postmark_shape_id", "postmarkShapeId")
                if shape_merge is not None:
                    payload["postmark_shape_id"] = shape_merge
                ev_raw = data.get("estimated_value")
                if ev_raw is None:
                    ev_raw = data.get("estimatedValue")
                if ev_raw is not None and ev_raw != "":
                    payload["estimated_value"] = ev_raw
                rn_merge = data.get("review_notes") or data.get("reviewNotes") or data.get("comment") or ""
                rn_merge = str(rn_merge).strip() if rn_merge is not None else ""
                if rn_merge:
                    payload["review_notes"] = rn_merge

        if edit_contribution_id is not None and edit_postmark_id is None:
            contrib = Contribution.objects.filter(
                id=edit_contribution_id,
                contributor=user,
            ).first()
            if not contrib:
                return Response(
                    {"detail": "Contribution not found or you cannot edit it."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if contrib.status not in (Contribution.STATUS_REJECTED, Contribution.STATUS_NEEDS_REVISION):
                return Response(
                    {"detail": "Only rejected or needs_revision contributions can be edited and resubmitted."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            submitted_data = {k: v for k, v in payload.items() if k != "admin_unit"}
            # Preserve existing image_metas / image_meta when contributor does not upload new images
            if "image_metas" not in submitted_data and "image_meta" not in submitted_data:
                existing = contrib.submitted_data or {}
                if existing.get("image_metas"):
                    submitted_data["image_metas"] = existing["image_metas"]
                elif existing.get("image_meta"):
                    submitted_data["image_meta"] = existing["image_meta"]
            try:
                contrib.submitted_data = submitted_data
                contrib.status = Contribution.STATUS_PENDING
                # Use a full save() here for maximum compatibility across DB schemas/ORM configs.
                # update_fields can be brittle if columns/fields diverge across environments.
                contrib.save()
            except Exception as e:
                logger.exception(
                    "Failed to resubmit contribution (id=%s, user_id=%s): %s",
                    edit_contribution_id,
                    getattr(user, "pk", None),
                    e,
                )
                return Response(
                    {"detail": "Could not resubmit this contribution. Please try again."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return Response(
                {"detail": "Submission updated successfully.", "contributionId": contrib.id},
                status=status.HTTP_200_OK,
            )

        # New submission by superuser with catalog fields: add directly to catalog (no approval queue).
        # State editors always use the contribution queue so another assigned editor can approve.
        if edit_postmark_id is None and edit_contribution_id is None:
            if getattr(user, "is_superuser", False):
                def _get_int(data, *keys):
                    raw = None
                    for k in keys:
                        raw = data.get(k)
                        if raw is not None and raw != "":
                            break
                    if raw is None or raw == "":
                        return None
                    if isinstance(raw, (list, tuple)):
                        raw = raw[0] if raw else None
                    try:
                        return int(raw)
                    except (TypeError, ValueError):
                        return None
                def _get_decimal(data, *keys):
                    raw = None
                    for k in keys:
                        raw = data.get(k)
                        if raw is not None and raw != "":
                            break
                    if raw is None or raw == "":
                        return None
                    if isinstance(raw, (list, tuple)):
                        raw = raw[0] if raw else None
                    try:
                        from decimal import Decimal
                        return Decimal(str(raw))
                    except (TypeError, ValueError):
                        return None
                def _get_str(data, *keys):
                    raw = None
                    for k in keys:
                        raw = data.get(k)
                        if raw is not None:
                            break
                    if raw is None:
                        return ""
                    if isinstance(raw, (list, tuple)):
                        raw = (raw[0] or "") if raw else ""
                    return str(raw).strip()
                shape_id = _get_int(data, "postmark_shape_id", "postmarkShapeId")
                estimated_val = _get_decimal(data, "estimated_value", "estimatedValue")
                review_notes_val = _get_str(data, "review_notes", "reviewNotes", "comment")
                lettering_id = payload.get("lettering_style_id")
                framing_id = payload.get("framing_style_id")
                framing_obj = _resolve_framing_style_from_payload(payload, user, fallback_id=framing_id)
                if framing_obj is not None:
                    framing_id = framing_obj.pk
                    payload["framing_style_id"] = framing_id
                date_fmt_id = payload.get("date_format_id")
                if lettering_id is not None and framing_id is not None and date_fmt_id is not None and estimated_val is not None and review_notes_val:
                    if shape_id is not None and not PostmarkShape.objects.filter(pk=shape_id).exists():
                        return Response({"detail": "Invalid postmark_shape_id (Shape)."}, status=status.HTTP_400_BAD_REQUEST)
                    if not LetteringStyle.objects.filter(pk=lettering_id).exists():
                        return Response({"detail": "Invalid lettering_style_id (Lettering style)."}, status=status.HTTP_400_BAD_REQUEST)
                    if not FramingStyle.objects.filter(pk=framing_id).exists():
                        return Response({"detail": "Invalid framing_style_id (Framing style)."}, status=status.HTTP_400_BAD_REQUEST)
                    if not DateFormat.objects.filter(pk=date_fmt_id).exists():
                        return Response({"detail": "Invalid date_format_id (Date format)."}, status=status.HTTP_400_BAD_REQUEST)
                    editor_data = {
                        "review_notes": review_notes_val,
                        "estimated_value": estimated_val,
                    }
                    if shape_id is not None:
                        editor_data["postmark_shape_id"] = int(shape_id)
                    postmark = _create_postmark_in_catalog(payload, editor_data=editor_data, created_by_user=user)
                    if not postmark:
                        return Response(
                            {"detail": "Could not add catalog entry. Please check the data and try again."},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        )
                    # Create an approved Contribution so the editor's submission appears in My Submissions
                    submitted_data = {
                        "state": (payload.get("state") or "").strip(),
                        "town": (payload.get("town") or "").strip(),
                        "date_range": (payload.get("date_range") or "").strip(),
                        "type": (payload.get("type") or "").strip(),
                        "color": (payload.get("color") or "").strip(),
                        "manuscript": (payload.get("manuscript") or "").strip(),
                        "is_irreg": payload.get("is_irreg"),
                        "impression": (payload.get("impression") or "").strip(),
                        "date_type": (payload.get("date_type") or payload.get("dateType") or "").strip(),
                        "dimensions": (payload.get("dimensions") or "").strip(),
                        "width_mm": (payload.get("width_mm") or "").strip(),
                        "height_mm": (payload.get("height_mm") or "").strip(),
                        "description": (payload.get("description") or "").strip(),
                        "inscription_txt": (payload.get("inscription_txt") or payload.get("inscriptionText") or "").strip(),
                        "references": (payload.get("references") or "").strip(),
                        "submitter_name": (payload.get("submitter_name") or "").strip(),
                        "original_postmark_id": "",
                    }
                    if payload.get("lettering_style_id") is not None:
                        submitted_data["lettering_style_id"] = payload["lettering_style_id"]
                    if payload.get("framing_style_id") is not None:
                        submitted_data["framing_style_id"] = payload["framing_style_id"]
                    if payload.get("date_format_id") is not None:
                        submitted_data["date_format_id"] = payload["date_format_id"]
                    if payload.get("image_metas"):
                        submitted_data["image_metas"] = payload["image_metas"]
                    elif payload.get("image_meta"):
                        submitted_data["image_meta"] = payload["image_meta"]
                    Contribution.objects.create(
                        contributor=user,
                        postmark=postmark,
                        status=Contribution.STATUS_APPROVED,
                        submitted_data=submitted_data,
                        reviewer=user,
                        review_notes=review_notes_val or "",
                    )
                    return Response(
                        {"detail": "Catalog entry added. It is now visible in Search.", "postmarkId": postmark.postmark_id},
                        status=status.HTTP_201_CREATED,
                    )

        if edit_postmark_id is not None:
            # Suggested edits to an existing catalog entry (S6).
            # - Contributors: always create/update a Contribution for expert review.
            # - submitForReview: State Editors / superusers use the same review queue
            #   (e.g. "Suggest" from record detail) instead of applying directly.
            # - State editors editing someone else's entry: peer review (same as contributors).
            # - State editors editing their own approved listing: apply directly; stays approved for /search.
            # - Superusers (when not forcing submitForReview): apply directly to the catalog.
            role = _get_user_role(user)
            is_contributor_only = role == "contributor" and not getattr(user, "is_superuser", False)
            own_approved_catalog = _is_own_approved_catalog_postmark(user, edit_postmark_id)
            state_editor_needs_peer = (
                role == "state_editor"
                and not getattr(user, "is_superuser", False)
                and not own_approved_catalog
            )
            if is_contributor_only or submit_for_review or state_editor_needs_peer:
                try:
                    submitted_data = {
                        "state": payload.get("state", ""),
                        "town": payload.get("town", ""),
                        "date_range": payload.get("date_range", ""),
                        "type": payload.get("type", ""),
                        "color": payload.get("color", ""),
                        "manuscript": payload.get("manuscript", ""),
                        "is_irreg": payload.get("is_irreg"),
                        "impression": payload.get("impression", ""),
                        "date_type": payload.get("date_type", ""),
                        "dimensions": payload.get("dimensions", ""),
                        "width_mm": payload.get("width_mm", ""),
                        "height_mm": payload.get("height_mm", ""),
                        "description": payload.get("description", ""),
                        "inscription_txt": payload.get("inscription_txt", ""),
                        "references": payload.get("references", ""),
                        "submitter_name": submitter_name,
                        "contributor_comment": payload.get("contributor_comment", ""),
                        "original_postmark_id": str(edit_postmark_id),
                    }
                    if payload.get("lettering_style_id") is not None:
                        submitted_data["lettering_style_id"] = payload["lettering_style_id"]
                    if payload.get("framing_style_id") is not None:
                        submitted_data["framing_style_id"] = payload["framing_style_id"]
                    if payload.get("date_format_id") is not None:
                        submitted_data["date_format_id"] = payload["date_format_id"]
                    if payload.get("image_metas"):
                        submitted_data["image_metas"] = payload["image_metas"]
                    elif payload.get("image_meta"):
                        submitted_data["image_meta"] = payload["image_meta"]

                    # Because Contribution.postmark is OneToOne, there can only be
                    # one contribution row per catalog postmark. If one already
                    # exists for this postmark, update it instead of creating a
                    # new row to avoid IntegrityError on the unique constraint.
                    contrib, created = Contribution.objects.update_or_create(
                        postmark_id=edit_postmark_id,
                        defaults={
                            "contributor": user,
                            "status": Contribution.STATUS_PENDING,
                            "submitted_data": submitted_data,
                        },
                    )

                    detail_msg = (
                        "Correction submitted for review. A State Editor will review and apply it."
                        if created
                        else "Correction updated. A State Editor will review and apply it."
                    )

                    return Response(
                        {
                            "detail": detail_msg,
                            "contributionId": contrib.id,
                        },
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
                    )
                except Exception:
                    return Response(
                        {"detail": "Could not save your correction. Please try again."},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )

            # State Editors (own approved listing) and superusers: update catalog directly.
            if (
                role == "state_editor"
                and not getattr(user, "is_superuser", False)
                and own_approved_catalog
            ):
                if not _resolve_assigned_admin_unit(user, state):
                    return Response(
                        {
                            "detail": "You are not assigned to publish catalog edits for this state.",
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

            keep_public_approved = (
                own_approved_catalog
                and role == "state_editor"
                and not getattr(user, "is_superuser", False)
            )
            postmark = _update_postmark_in_catalog(
                edit_postmark_id,
                payload,
                submitter_name,
                keep_public_approved=keep_public_approved,
            )
            if not postmark:
                return Response(
                    {"detail": "Could not apply catalog edit. Ensure the target listing exists and try again."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            if keep_public_approved:
                _sync_approved_contribution_submitted_data(edit_postmark_id, user, payload)
            return Response(
                {"detail": "Catalog entry updated successfully.", "postmarkId": postmark.postmark_id},
                status=status.HTTP_200_OK,
            )

        contrib = _create_contribution_only(payload, contributor=user)
        if not contrib:
            return Response(
                {"detail": "Could not save your submission. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response(
            {
                "detail": "Submission sent. Your entry will appear in the catalog after review.",
                "contributionId": contrib.id,
            },
            status=status.HTTP_201_CREATED,
        )


# ========== CONTRIBUTION MODERATION VIEWSET ==========


def _can_review_contribution(user, contrib):
    """True if user can approve/reject this contribution (State Editor)."""
    if getattr(user, "is_superuser", False):
        return True
    assigned = _get_user_assigned_units(user)
    if not assigned.exists():
        return False
    # For suggestions on existing catalog entries, permission should be based on the
    # linked postmark region as well (submitted_data can be edited before approval).
    postmark = getattr(contrib, "postmark", None)
    if postmark:
        if postmark.state_id and assigned.filter(pk=postmark.state_id).exists():
            return True
        if postmark.postal_facility_identity_id and assigned.filter(
            governed_facilities__postal_facility_identity_id=postmark.postal_facility_identity_id,
            governed_facilities__effective_to_date__isnull=True,
        ).exists():
            return True

    # Fallback for new submissions: evaluate state from submitted payload.
    sd = contrib.submitted_data or {}
    state_str = (sd.get("state") or "").strip()
    return _resolve_assigned_admin_unit(user, state_str) is not None


class IsStateEditorOrContributor(BasePermission):
    """Contributors can view their own; State Editors can list/review all in their region.
    Contributors may POST to resubmit their own rejected/needs_revision contributions."""
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            if obj.contributor_id == request.user.id:
                return True
            return _can_review_contribution(request.user, obj)
        if request.method in ("POST", "PATCH"):
            # Contributor can resubmit their own denied/needs_revision contribution
            if getattr(view, "action", None) == "resubmit" and obj.contributor_id == request.user.id:
                return True
            # approve / reject / request_revision / editor_edit: editors only
            return _can_review_contribution(request.user, obj)
        return False


class ContributionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Moderation queue for contributions.
    - Contributors: list/retrieve their own contributions.
    - State Editors: list/retrieve all in their region, approve, reject.
    """
    permission_classes = [IsAuthenticated, IsStateEditorOrContributor]
    serializer_class = ContributionDetailSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status"]
    search_fields = ["submitted_data"]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        if getattr(user, "is_superuser", False):
            return Contribution.objects.all().select_related("contributor", "reviewer", "postmark")
        role = _get_user_role(user)
        base_qs = Contribution.objects.select_related("contributor", "reviewer", "postmark")
        if role == "state_editor":
            assigned = _get_user_assigned_units(user)
            state_names = []
            for u in assigned:
                ident = u.get_current_identity()
                if ident and ident.unit_name:
                    state_names.append(ident.unit_name)
            if state_names:
                return base_qs.filter(
                    Q(contributor=user) | Q(submitted_data__state__in=state_names)
                ).distinct()
        # Contributors: only their own contributions
        return base_qs.filter(contributor=user).distinct()

    def get_serializer_class(self):
        if self.action == "list":
            return ContributionListSerializer
        return ContributionDetailSerializer

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        """Approve a contribution; apply submitted_data to catalog. Editor must supply value and comment. Lettering style, framing style, and date format come from the contribution's submitted_data (required on the contribution form)."""
        contrib = self.get_object()
        if contrib.status != Contribution.STATUS_PENDING:
            return Response(
                {"detail": f"Contribution is not pending (status: {contrib.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # State editors cannot approve their own submissions; another editor assigned to the state must review.
        if (
            not getattr(request.user, "is_superuser", False)
            and contrib.contributor_id == request.user.id
            and _get_user_role(request.user) == "state_editor"
        ):
            return Response(
                {
                    "detail": "You cannot approve your own submission. Another state editor assigned to this state must review it.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ContributionApproveRejectSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        review_notes = data.get("review_notes", "")

        # lettering/framing/date_format come from payload or from contribution's submitted_data
        shape_id = data.get("postmark_shape_id")
        lettering_id = data.get("lettering_style_id")
        framing_id = data.get("framing_style_id")
        date_fmt_id = data.get("date_format_id")
        estimated_value = data.get("estimated_value")
        sd = contrib.submitted_data or {}
        if lettering_id is None:
            lettering_id = sd.get("lettering_style_id") or sd.get("letteringStyleId")
        if framing_id is None:
            framing_id = sd.get("framing_style_id") or sd.get("framingStyleId")
        if date_fmt_id is None:
            date_fmt_id = sd.get("date_format_id") or sd.get("dateFormatId")

        def _as_int_or_none(raw):
            if raw is None or raw == "":
                return None
            try:
                return int(raw)
            except (TypeError, ValueError):
                return None

        def _as_str_or_none(raw):
            if raw is None:
                return None
            s = str(raw).strip()
            return s or None

        # Backward compatibility:
        # Some older contributions stored labels (e.g. "Sans-serif", "DL - Double Line", "MD")
        # instead of numeric FK IDs in submitted_data. Resolve by name/abbreviation when needed.
        lettering_id = _as_int_or_none(lettering_id)
        if lettering_id is None:
            lettering_name = (
                _as_str_or_none(sd.get("lettering_style_name"))
                or _as_str_or_none(sd.get("letteringStyleName"))
                or _as_str_or_none(sd.get("lettering_style"))
                or _as_str_or_none(sd.get("letteringStyle"))
                or _as_str_or_none(sd.get("LetteringStyle"))
            )
            if lettering_name:
                matched = LetteringStyle.objects.filter(lettering_style_name__iexact=lettering_name).values_list("pk", flat=True).first()
                if matched is not None:
                    lettering_id = int(matched)

        framing_id = _as_int_or_none(framing_id)
        if framing_id is None:
            framing_name = (
                _as_str_or_none(sd.get("framing_style_name"))
                or _as_str_or_none(sd.get("framingStyleName"))
                or _as_str_or_none(sd.get("framing_style"))
                or _as_str_or_none(sd.get("framingStyle"))
                or _as_str_or_none(sd.get("FramingStyle"))
            )
            if framing_name:
                matched = FramingStyle.objects.filter(framing_style_name__iexact=framing_name).values_list("pk", flat=True).first()
                if matched is not None:
                    framing_id = int(matched)

        date_fmt_id = _as_int_or_none(date_fmt_id)
        if date_fmt_id is None:
            date_fmt_name = (
                _as_str_or_none(sd.get("date_format_name"))
                or _as_str_or_none(sd.get("dateFormatName"))
                or _as_str_or_none(sd.get("date_format"))
                or _as_str_or_none(sd.get("dateFormat"))
                or _as_str_or_none(sd.get("DateFormat"))
            )
            if date_fmt_name:
                matched = DateFormat.objects.filter(date_format__iexact=date_fmt_name).values_list("pk", flat=True).first()
                if matched is not None:
                    date_fmt_id = int(matched)

        missing_from_contribution = []
        if lettering_id is None:
            missing_from_contribution.append("lettering_style_id (Lettering style)")
        if framing_id is None:
            missing_from_contribution.append("framing_style_id (Framing style)")
        if date_fmt_id is None:
            missing_from_contribution.append("date_format_id (Date format)")
        if missing_from_contribution:
            return Response(
                {"detail": "Contribution is missing required submitted data: " + ", ".join(missing_from_contribution) + ". These are required on the contribution form."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if shape_id is not None and not PostmarkShape.objects.filter(pk=shape_id).exists():
            return Response({"detail": "Invalid postmark_shape_id."}, status=status.HTTP_400_BAD_REQUEST)
        if not LetteringStyle.objects.filter(pk=lettering_id).exists():
            return Response({"detail": "Invalid lettering_style_id."}, status=status.HTTP_400_BAD_REQUEST)
        if not FramingStyle.objects.filter(pk=framing_id).exists():
            return Response({"detail": "Invalid framing_style_id."}, status=status.HTTP_400_BAD_REQUEST)
        if not DateFormat.objects.filter(pk=date_fmt_id).exists():
            return Response({"detail": "Invalid date_format_id."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            postmark = _apply_contribution_to_catalog(contrib)
        except Exception as e:
            logger.exception("approve: _apply_contribution_to_catalog failed for contribution id=%s: %s", contrib.id, e)
            return Response(
                {"detail": "Could not apply contribution to catalog. See server logs for details."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if not postmark:
            logger.warning("approve: _apply_contribution_to_catalog returned None for contribution id=%s", contrib.id)
            return Response(
                {"detail": "Could not apply contribution to catalog. Check submitted_data (state, town required). See server logs for details."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            # Set editor-provided catalog fields (shape already set from contribution form as postmark type)
            postmark.lettering_style_id = lettering_id
            postmark.framing_style_id = framing_id
            postmark.date_format_id = date_fmt_id
            postmark.contribution_approval_status = "approved"
            update_fields = ["lettering_style_id", "framing_style_id", "date_format_id", "contribution_approval_status"]
            if shape_id is not None:
                postmark.postmark_shape_id = shape_id
                update_fields.append("postmark_shape_id")
            postmark.save(update_fields=update_fields)

            # Create valuation only when editor provides a value.
            if estimated_value is not None:
                PostmarkValuation.objects.create(
                    postmark=postmark,
                    valued_by_user=request.user,
                    estimated_value=estimated_value,
                    valuation_date=timezone.now().date(),
                    created_by=request.user,
                    modified_by=request.user,
                )

            contrib.status = Contribution.STATUS_APPROVED
            contrib.reviewer = request.user
            contrib.review_notes = review_notes
            contrib.save(update_fields=["status", "reviewer", "review_notes", "postmark", "updated_at"])
        except Exception as e:
            logger.exception("approve: failed after creating postmark for contribution id=%s: %s", contrib.id, e)
            return Response(
                {"detail": "Approval failed while updating catalog. See server logs for details."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {"detail": "Contribution approved.", "postmarkId": postmark.postmark_id},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        """Reject a contribution; catalog remains unchanged."""
        contrib = self.get_object()
        if contrib.status != Contribution.STATUS_PENDING:
            return Response(
                {"detail": f"Contribution is not pending (status: {contrib.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = ContributionApproveRejectSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        review_notes = serializer.validated_data.get("review_notes", "")
        contrib.status = Contribution.STATUS_REJECTED
        contrib.reviewer = request.user
        contrib.review_notes = review_notes
        contrib.save(update_fields=["status", "reviewer", "review_notes", "updated_at"])
        return Response(
            {"detail": "Contribution rejected."},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="request-revision")
    def request_revision(self, request, pk=None):
        """Set contribution to needs_revision; reviewer must add comment for the contributor."""
        contrib = self.get_object()
        if contrib.status != Contribution.STATUS_PENDING:
            return Response(
                {"detail": f"Contribution is not pending (status: {contrib.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = ContributionApproveRejectSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        review_notes = serializer.validated_data.get("review_notes", "")
        contrib.status = Contribution.STATUS_NEEDS_REVISION
        contrib.reviewer = request.user
        contrib.review_notes = review_notes
        contrib.save(update_fields=["status", "reviewer", "review_notes", "updated_at"])
        return Response(
            {"detail": "Revision requested; contributor can see your feedback and resubmit."},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["patch"], url_path="editor-edit")
    def editor_edit(self, request, pk=None):
        """
        State editors: directly edit the contribution's submitted_data (postmark fields).
        Merges request body over existing submitted_data; approval will then apply these values to the catalog.
        """
        contrib = self.get_object()
        if not _can_review_contribution(request.user, contrib):
            return Response(
                {"detail": "Only state editors can edit contribution data."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if contrib.status != Contribution.STATUS_PENDING:
            return Response(
                {"detail": "Only pending contributions can be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = request.data or {}

        def _get(*keys, default=None):
            for k in keys:
                v = data.get(k)
                if v is not None and v != "":
                    return v
            return default

        existing = contrib.submitted_data or {}
        overlay = dict(existing)

        state = _get("state", "State")
        if state is not None:
            overlay["state"] = str(state).strip()
        town = _get("town", "Town")
        if town is not None:
            overlay["town"] = str(town).strip()
        first_seen = _get("firstSeen", "first_seen")
        last_seen = _get("lastSeen", "last_seen")
        if first_seen is not None or last_seen is not None:
            fs = (str(first_seen or "").strip() or existing.get("date_range", "").split("-")[0].strip()).strip()
            ls = str(last_seen or "").strip() if last_seen is not None else (existing.get("date_range", "") or "").split("-")[-1].strip()
            overlay["date_range"] = f"{fs}-{ls}" if ls else fs
        type_val = _get("type", "Type")
        if type_val is not None:
            overlay["type"] = str(type_val).strip()
        color = _get("color", "Color")
        if color is not None:
            overlay["color"] = str(color).strip()
        dimensions = _get("dimensions", "Dimensions")
        if dimensions is not None:
            overlay["dimensions"] = str(dimensions).strip()
        width_mm = _get("width_mm", "widthMm")
        if width_mm is not None:
            overlay["width_mm"] = str(width_mm).strip()
        height_mm = _get("height_mm", "heightMm")
        if height_mm is not None:
            overlay["height_mm"] = str(height_mm).strip()
        manuscript = _get("manuscript", "Manuscript")
        if manuscript is not None:
            overlay["manuscript"] = str(manuscript).strip()
        description = _get("description", "Description")
        if description is not None:
            overlay["description"] = str(description).strip()
        references = _get("references", "References")
        if references is not None:
            overlay["references"] = str(references).strip()
        is_irreg = _get("is_irreg", "isIrreg", "isIrregular")
        parsed_is_irreg = _parse_optional_bool(is_irreg)
        if parsed_is_irreg is not None:
            overlay["is_irreg"] = parsed_is_irreg
        date_type = _get("date_type", "dateType")
        if date_type is not None:
            overlay["date_type"] = str(date_type).strip()
        for key, payload_key in [
            ("lettering_style_id", "letteringStyleId"),
            ("framing_style_id", "framingStyleId"),
            ("date_format_id", "dateFormatId"),
        ]:
            raw = _get(key, payload_key)
            if raw is not None:
                try:
                    overlay[key] = int(raw)
                except (TypeError, ValueError):
                    pass

        contrib.submitted_data = overlay
        contrib.save(update_fields=["submitted_data", "updated_at"])
        serializer = ContributionDetailSerializer(contrib)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="resubmit")
    def resubmit(self, request, pk=None):
        """Allow the contributor to resubmit a previously rejected or needs_revision contribution.
        Sets status back to pending so it re-enters the review queue. Reviewer and review_notes
        are kept for audit/history."""
        contrib = self.get_object()
        if contrib.contributor_id != request.user.id:
            return Response(
                {"detail": "Only the contributor may resubmit this contribution."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if contrib.status not in (Contribution.STATUS_REJECTED, Contribution.STATUS_NEEDS_REVISION):
            return Response(
                {"detail": f"Only rejected or needs_revision contributions can be resubmitted (current: {contrib.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        contrib.status = Contribution.STATUS_PENDING
        contrib.save(update_fields=["status", "updated_at"])
        return Response(
            {"detail": "Contribution resubmitted; it is now pending review again."},
            status=status.HTTP_200_OK,
        )


# ========== CUSTOM PERMISSIONS ==========

class IsResponsibleForRegion(BasePermission):
    """
    Permission check: User must be in a group responsible for the postmark's region.
    Exception: submitters may delete (and update) their own user-contribution postmarks.
    """
    def has_object_permission(self, request, view, obj):
        # Read permissions are allowed for all authenticated users
        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            return True
        
        # For postmarks, check if user is in responsible group
        if isinstance(obj, Postmark):
            # Allow submitter to delete or update their own user contribution
            if obj.source_catalog == "User contribution" and obj.other_characteristics:
                submitter_needles = [
                    f"Submitted by: {request.user.username}",
                    f"Submitted by: {getattr(request.user, 'email', '') or ''}",
                ]
                if any(
                    needle in (obj.other_characteristics or "")
                    for needle in submitter_needles
                    if needle.strip() != "Submitted by:"
                ):
                    return True
            responsible_groups = obj.get_responsible_groups()
            user_groups = request.user.groups.all()
            return any(group in responsible_groups for group in user_groups)
        
        # For other objects, allow if authenticated
        return request.user and request.user.is_authenticated


@method_decorator(csrf_exempt, name="dispatch")
class DeleteMySubmissionView(APIView):
    """
    Allow authenticated users to delete their own user-contribution catalog entries.

    This endpoint is CSRF-exempt so the SPA can call it with session authentication.
    Server-side checks ensure that only the original submitter can delete, and only
    for Postmarks created from user contributions.
    """

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            postmark_id = int(pk)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid catalog ID."}, status=status.HTTP_400_BAD_REQUEST)

        postmark = Postmark.objects.filter(postmark_id=postmark_id).first()
        if not postmark:
            return Response({"detail": "Catalog entry not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user

        # 1. Superusers can always delete
        if getattr(user, "is_superuser", False):
            postmark.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # 2. Users assigned to this postmark's state (or its facility's jurisdiction) can delete
        assigned_units = _get_user_assigned_units(user)
        if assigned_units.exists():
            if postmark.state_id and assigned_units.filter(pk=postmark.state_id).exists():
                postmark.delete()
                return Response(status=status.HTTP_204_NO_CONTENT)
            # Also allow when postmark is in assigned region via facility jurisdiction (e.g. state_id is null)
            if postmark.postal_facility_identity_id:
                if assigned_units.filter(
                    governed_facilities__postal_facility_identity_id=postmark.postal_facility_identity_id,
                    governed_facilities__effective_to_date__isnull=True,
                ).exists():
                    postmark.delete()
                    return Response(status=status.HTTP_204_NO_CONTENT)

        # 3. Original submitter of a user-contribution listing can delete their own
        if postmark.source_catalog != "User contribution":
            return Response(
                {"detail": "You do not have permission to delete this catalog entry."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Allow if this user created the postmark (when their submission was approved)
        if postmark.created_by_id and postmark.created_by_id == user.pk:
            postmark.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # Fallback: match by "Submitted by: {username}" or "Submitted by: {email}" in other_characteristics
        other = (postmark.other_characteristics or "") or ""
        username = (getattr(user, "username", "") or "").strip()
        email = (getattr(user, "email", "") or "").strip()

        submitter_needles = []
        if username:
            submitter_needles.append(f"Submitted by: {username}")
        if email:
            submitter_needles.append(f"Submitted by: {email}")

        if not submitter_needles or not any(needle in other for needle in submitter_needles):
            return Response(
                {"detail": "You can only delete catalog entries that you originally submitted."},
                status=status.HTTP_403_FORBIDDEN,
            )

        postmark.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ========== GEOGRAPHIC HIERARCHY VIEWSETS ==========

class PostalFacilityViewSet(viewsets.ModelViewSet):
    """
    ViewSet for postal facilities (stable containers)
    """
    queryset = PostalFacility.objects.all().select_related(
        'created_by',
        'modified_by',
    ).prefetch_related(
        'identities',
        # For deriving state_name efficiently in the list serializer
        'identities__jurisdictions__administrative_unit__identities',
    )
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['reference_code']
    search_fields = ['reference_code']
    ordering_fields = ['reference_code', 'created_date']
    ordering = ['reference_code']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return PostalFacilityListSerializer
        return PostalFacilitySerializer
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)
    
    @action(detail=True, methods=['get'])
    def identities_timeline(self, request, pk=None):
        """Get all historical identities for this facility"""
        facility = self.get_object()
        identities = facility.identities.all().order_by('effective_from_date')
        serializer = PostalFacilityIdentitySerializer(identities, many=True, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def identity_at_date(self, request, pk=None):
        """Get identity at a specific date"""
        facility = self.get_object()
        date_str = request.query_params.get('date')
        
        if not date_str:
            return Response(
                {'error': 'date parameter required (YYYY-MM-DD)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            target_date = date.fromisoformat(date_str)
            identity = facility.get_identity_at_date(target_date)
            if identity:
                serializer = PostalFacilityIdentitySerializer(identity, context={'request': request})
                return Response(serializer.data)
            return Response(
                {'error': f'No identity found for {date_str}'},
                status=status.HTTP_404_NOT_FOUND
            )
        except ValueError:
            return Response(
                {'error': 'Invalid date format, use YYYY-MM-DD'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'], url_path='town-options')
    def town_options(self, request):
        """
        Return distinct (town, state) for dropdowns, from both PostalFacility
        records and from Postmarks that have facility + state. Ensures the town
        list is populated even when no facilities were created by the seed migration.
        """
        seen = set()
        options = []

        # 1) From PostalFacility: current identity name + state from jurisdiction
        for facility in PostalFacility.objects.all().prefetch_related(
            'identities__jurisdictions__administrative_unit__identities',
        ):
            identity = facility.get_current_identity()
            if not identity:
                continue
            town = (identity.facility_name or "").strip()
            state_name = None
            aff = (
                identity.jurisdictions.filter(effective_to_date__isnull=True)
                .select_related("administrative_unit")
                .first()
            )
            if aff and aff.administrative_unit:
                curr = aff.administrative_unit.get_current_identity()
                state_name = (curr.unit_name if curr else None) or aff.administrative_unit.reference_code
            if not town or not state_name:
                continue
            key = (town.lower(), state_name.lower())
            if key not in seen:
                seen.add(key)
                options.append({"town": town, "state": state_name})

        # 2) From Postmarks: facility_name + state's current identity name
        postmark_rows = (
            Postmark.objects.filter(
                postal_facility_identity__isnull=False,
                state__isnull=False,
            )
            .values_list("postal_facility_identity__facility_name", "state_id")
            .distinct()
        )
        state_ids = list({r[1] for r in postmark_rows})
        if state_ids:
            state_id_to_name = {}
            for ident in (
                AdministrativeUnitIdentity.objects.filter(
                    administrative_unit_id__in=state_ids,
                    effective_to_date__isnull=True,
                )
                .order_by("administrative_unit_id", "-effective_from_date")
                .values_list("administrative_unit_id", "unit_name")
            ):
                if ident[0] not in state_id_to_name:
                    state_id_to_name[ident[0]] = ident[1] or ""
            for facility_name, state_id in postmark_rows:
                town = (facility_name or "").strip()
                state_name = (state_id_to_name.get(state_id) or "").strip()
                if not town or not state_name:
                    continue
                key = (town.lower(), state_name.lower())
                if key not in seen:
                    seen.add(key)
                    options.append({"town": town, "state": state_name})

        options.sort(key=lambda x: (x["state"].lower(), x["town"].lower()))
        return Response(options)


class PostalFacilityIdentityViewSet(viewsets.ModelViewSet):
    """ViewSet for postal facility identities"""
    queryset = PostalFacilityIdentity.objects.all().select_related(
        'postal_facility', 'created_by', 'modified_by'
    )
    serializer_class = PostalFacilityIdentitySerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['postal_facility', 'facility_type', 'is_operational']
    search_fields = ['facility_name']
    ordering_fields = ['effective_from_date', 'facility_name']
    ordering = ['-effective_from_date']


class AdministrativeUnitViewSet(viewsets.ModelViewSet):
    """
    ViewSet for administrative units (stable containers).
    Uses larger max page_size so filter dropdowns can request all states in one call.
    For authenticated users with location assignments: returns only assigned locations.
    For users without assignments (or staff/superuser): returns all.
    """
    pagination_class = LargePageSizePagination
    queryset = AdministrativeUnit.objects.all().select_related(
        'created_by', 'modified_by'
    ).prefetch_related('identities', 'responsibilities__group')
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['reference_code']
    search_fields = ['reference_code']
    ordering_fields = ['reference_code', 'created_date']
    ordering = ['reference_code']

    def get_queryset(self):
        qs = super().get_queryset()
        # Only filter when assigned_only=true (Contribute, Dashboard); Search uses all states
        if self.request.query_params.get('assigned_only', '').lower() != 'true':
            return qs
        user = self.request.user
        # assigned_only requires auth; unauthenticated gets empty (avoids inconsistent "all" when session missing)
        if not user or not user.is_authenticated:
            return qs.none()
        role = _get_user_role(user)
        if role == "state_editor":
            # For State Editors, restrict to their explicit assignments.
            assigned_ids = list(
                UserLocationAssignment.objects.filter(user=user).values_list(
                    'administrative_unit_id', flat=True
                )
            )
            if assigned_ids:
                return qs.filter(pk__in=assigned_ids)
            return qs.none()
        # Contributors (and others) can see all states when assigned_only=true
        return qs

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        # assigned_only responses are user-specific; prevent caching
        if request.query_params.get('assigned_only', '').lower() == 'true':
            response['Cache-Control'] = 'no-store, private, max-age=0'
        return response

    def get_serializer_class(self):
        if self.action == 'list':
            return AdministrativeUnitListSerializer
        return AdministrativeUnitSerializer
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)
    
    @action(detail=True, methods=['get'])
    def identities_timeline(self, request, pk=None):
        """Get all historical identities for this unit"""
        unit = self.get_object()
        identities = unit.identities.all().order_by('effective_from_date')
        serializer = AdministrativeUnitIdentitySerializer(identities, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def children(self, request, pk=None):
        """Get all child administrative units (current)"""
        parent = self.get_object()
        # Get identities where this unit is the parent
        child_identities = AdministrativeUnitIdentity.objects.filter(
            parent_administrative_unit=parent,
            effective_to_date__isnull=True
        )
        # Get the administrative units
        child_units = [identity.administrative_unit for identity in child_identities]
        serializer = AdministrativeUnitListSerializer(child_units, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def facilities(self, request, pk=None):
        """Get all facilities currently in this administrative unit"""
        unit = self.get_object()
        current_affiliations = JurisdictionalAffiliation.objects.filter(
            administrative_unit=unit,
            effective_to_date__isnull=True
        ).select_related('postal_facility_identity__postal_facility')
        
        facilities = [aff.postal_facility_identity.postal_facility for aff in current_affiliations]
        serializer = PostalFacilityListSerializer(facilities, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def responsible_groups(self, request, pk=None):
        """Get groups responsible for this unit"""
        unit = self.get_object()
        responsibilities = unit.responsibilities.filter(is_active=True)
        serializer = AdministrativeUnitResponsibilitySerializer(responsibilities, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def my_responsibilities(self, request):
        """Get administrative units the current user's groups are responsible for"""
        user_groups = request.user.groups.all()
        responsibilities = AdministrativeUnitResponsibility.objects.filter(
            group__in=user_groups,
            is_active=True
        ).select_related('administrative_unit')
        
        units = [resp.administrative_unit for resp in responsibilities]
        serializer = AdministrativeUnitListSerializer(units, many=True)
        return Response(serializer.data)


class AdministrativeUnitIdentityViewSet(viewsets.ModelViewSet):
    """ViewSet for administrative unit identities"""
    queryset = AdministrativeUnitIdentity.objects.all().select_related(
        'administrative_unit', 'parent_administrative_unit', 'created_by'
    )
    serializer_class = AdministrativeUnitIdentitySerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['administrative_unit', 'unit_type', 'change_reason']
    ordering = ['-effective_from_date']


class AdministrativeUnitResponsibilityViewSet(viewsets.ModelViewSet):
    """ViewSet for managing group responsibilities"""
    queryset = AdministrativeUnitResponsibility.objects.all().select_related(
        'administrative_unit', 'group', 'created_by', 'modified_by'
    )
    serializer_class = AdministrativeUnitResponsibilitySerializer
    permission_classes = [IsAuthenticated]  # Only authenticated users can manage
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['administrative_unit', 'group', 'is_active']
    ordering = ['administrative_unit']
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class JurisdictionalAffiliationViewSet(viewsets.ModelViewSet):
    """ViewSet for jurisdictional affiliations"""
    queryset = JurisdictionalAffiliation.objects.all().select_related(
        'postal_facility_identity', 'administrative_unit', 'created_by', 'modified_by'
    )
    serializer_class = JurisdictionalAffiliationSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['postal_facility_identity', 'administrative_unit']
    ordering = ['-effective_from_date']


# ========== PHYSICAL CHARACTERISTICS VIEWSETS ==========

class PostmarkShapeViewSet(viewsets.ModelViewSet):
    """ViewSet for postmark shapes"""
    queryset = PostmarkShape.objects.all()
    serializer_class = PostmarkShapeSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['shape_name', 'shape_description']
    ordering = ['shape_name']


class LetteringStyleViewSet(viewsets.ModelViewSet):
    """ViewSet for lettering styles"""
    queryset = LetteringStyle.objects.all()
    serializer_class = LetteringStyleSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['lettering_style_name', 'lettering_description']
    ordering = ['lettering_style_name']


class FramingStyleViewSet(viewsets.ModelViewSet):
    """ViewSet for framing styles"""
    queryset = FramingStyle.objects.all()
    serializer_class = FramingStyleSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['framing_style_name', 'framing_description']
    ordering = ['framing_style_name']


class ColorViewSet(viewsets.ModelViewSet):
    """ViewSet for colors"""
    queryset = Color.objects.all()
    serializer_class = ColorSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['color_name']
    ordering = ['color_name']


class DateFormatViewSet(viewsets.ModelViewSet):
    """ViewSet for date formats"""
    queryset = DateFormat.objects.all()
    serializer_class = DateFormatSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['format_name', 'format_description']
    ordering = ['format_name']


# ========== POSTMARK VIEWSETS ==========

def _postmark_list_queryset():
    """Queryset for postmark list + detail: matches data needed by PostmarkSerializer (same shape as retrieve).
    List uses the same serializer as GET /postmarks/{id}/ so clients see identical fields per row.
    """
    current_identities = AdministrativeUnitIdentity.objects.filter(effective_to_date__isnull=True)
    current_jurisdictions = JurisdictionalAffiliation.objects.filter(
        Q(effective_to_date__isnull=True) | Q(effective_to_date__gte=timezone.now().date())
    ).select_related('administrative_unit').prefetch_related(
        Prefetch('administrative_unit__identities', queryset=current_identities),
        Prefetch(
            'administrative_unit__responsibilities',
            queryset=AdministrativeUnitResponsibility.objects.filter(is_active=True).select_related('group'),
        )
    )
    return Postmark.objects.all().select_related(
        'site',
        'postal_facility_identity__postal_facility',
        'postal_facility_identity__created_by',
        'postal_facility_identity__modified_by',
        'state',
        'postmark_shape',
        'lettering_style',
        'framing_style',
        'date_format',
        'post_office',
        'post_office__region',
        'shape',
        'lettering',
        'color',
        'created_by',
        'modified_by',
    ).prefetch_related(
        Prefetch(
            'postmark_colors',
            queryset=PostmarkColor.objects.select_related('color'),
        ),
        'dates_seen',
        Prefetch(
            'valuations',
            queryset=PostmarkValuation.objects.select_related('valued_by_user'),
        ),
        Prefetch(
            'images',
            queryset=PostmarkImage.objects.select_related('uploaded_by'),
        ),
        Prefetch('sizes', queryset=PostmarkSize.objects.order_by('-created_date')),
        Prefetch('postal_facility_identity__jurisdictions', queryset=current_jurisdictions),
        Prefetch('state__identities', queryset=current_identities),
    )


class PostmarkViewSet(viewsets.ModelViewSet):
    """
    ViewSet for postmarks with group-based permission checking.
    List is paginated: 10 per page (honors ?page_size= up to 100).
    Supports ?include_count=false to skip the COUNT query for faster first load.
    Catalog list (used by /search): shows all listings.
    """
    pagination_class = PostmarkListPagination
    queryset = Postmark.objects.all()  # Base queryset; get_queryset() returns optimized version
    permission_classes = [IsAuthenticatedOrReadOnly, IsResponsibleForRegion]

    def get_queryset(self):
        """
        Base queryset for postmarks.

        - For list-like actions (catalog/search endpoints), only show:
          * Legacy/seeded listings, plus
          * User-contributed listings that are approved or have a previous
            approved version (last_public_update_at is set).
        - For detail actions (retrieve/update/partial_update/destroy and any
          custom detail routes), allow accessing the full catalog including
          pending user-contributed entries. This is required so that:
          * Contributor Dashboard can open "View details" for a newly
            submitted catalog entry that is still pending approval.
          * The Edit Catalog Entry form can load the record being edited.
        """
        base_qs = _postmark_list_queryset()

        # Detail actions and my_assigned (state editor catalog) see full catalog including pending.
        if getattr(self, "action", None) in {
            "retrieve",
            "update",
            "partial_update",
            "destroy",
            "my_assigned",
            "delete_mine",
        }:
            return base_qs

        # List-style actions (including the default `list`) should only expose
        # approved or previously approved user-contributed entries so that
        # pending submissions do not appear in public catalog search.
        return base_qs.filter(
            Q(source_catalog__isnull=True)
            | ~Q(source_catalog="User contribution")
            | Q(
                source_catalog="User contribution",
                contribution_approval_status="approved",
            )
            | Q(
                source_catalog="User contribution",
                last_public_update_at__isnull=False,
            )
        )
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = PostmarkListFilter
    # Search only by name (postmark_key); town, state, type, color have their own filters
    search_fields = ['postmark_key']
    ordering_fields = ['postmark_key', 'created_date', 'rate_value']
    ordering = ['-created_date']  # Newest first for catalog search list
    
    def get_serializer_class(self):
        # List and detail use the same serializer so paginated list rows match GET /postmarks/{id}/.
        return PostmarkSerializer

    @action(detail=True, methods=['delete'], url_path='delete-mine', permission_classes=[IsAuthenticated])
    def delete_mine(self, request, pk=None):
        """
        Allow authenticated users to delete their own user-contribution entries,
        or state editors to delete any entry in their assigned states.
        Same logic as DeleteMySubmissionView; exposed as ViewSet action so the URL is routed correctly.
        """
        postmark = self.get_object()
        user = request.user
        # 1. Superusers can always delete
        if getattr(user, "is_superuser", False):
            postmark.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        # 2. State editors: delete if in assigned state or facility jurisdiction
        assigned_units = _get_user_assigned_units(user)
        if assigned_units.exists():
            if postmark.state_id and assigned_units.filter(pk=postmark.state_id).exists():
                postmark.delete()
                return Response(status=status.HTTP_204_NO_CONTENT)
            if postmark.postal_facility_identity_id and assigned_units.filter(
                governed_facilities__postal_facility_identity_id=postmark.postal_facility_identity_id,
                governed_facilities__effective_to_date__isnull=True,
            ).exists():
                postmark.delete()
                return Response(status=status.HTTP_204_NO_CONTENT)
        # 3. Original submitter of a user-contribution listing
        if postmark.source_catalog != "User contribution":
            return Response(
                {"detail": "You do not have permission to delete this catalog entry."},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Allow if this user created the postmark (when their submission was approved)
        if postmark.created_by_id and postmark.created_by_id == user.pk:
            postmark.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        other = (postmark.other_characteristics or "") or ""
        username = (getattr(user, "username", "") or "").strip()
        email = (getattr(user, "email", "") or "").strip()
        submitter_needles = [f"Submitted by: {x}" for x in (username, email) if x]
        if not submitter_needles or not any(needle in other for needle in submitter_needles):
            return Response(
                {"detail": "You can only delete catalog entries that you originally submitted."},
                status=status.HTTP_403_FORBIDDEN,
            )
        postmark.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'], url_path='my-assigned', permission_classes=[IsAuthenticated])
    def my_assigned(self, request):
        """
        Get catalog listings for all states assigned to the current user.
        State editors can view, edit, and delete any catalog entry in their assigned states.
        """
        user = request.user
        assigned_units = _get_user_assigned_units(user)
        if not assigned_units.exists():
            empty_qs = self.get_queryset().none()
            page = self.paginate_queryset(empty_qs)
            if page is not None:
                serializer = self.get_serializer(page, many=True)
                return self.get_paginated_response(serializer.data)
            serializer = self.get_serializer(empty_qs, many=True)
            return Response(serializer.data)
        qs = self.get_queryset().filter(
            Q(state__in=assigned_units)
            | Q(
                postal_facility_identity__jurisdictions__administrative_unit__in=assigned_units
            )
        ).distinct().order_by('-created_date')
        qs = self.filter_queryset(qs)
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def my_region(self, request):
        """Get postmarks from regions the user's groups are responsible for"""
        user_groups = request.user.groups.all()
        responsibilities = AdministrativeUnitResponsibility.objects.filter(
            group__in=user_groups,
            is_active=True
        )
        responsible_units = [resp.administrative_unit for resp in responsibilities]
        affiliations = JurisdictionalAffiliation.objects.filter(
            administrative_unit__in=responsible_units,
            effective_to_date__isnull=True
        ).select_related('postal_facility_identity')
        facility_identities = [aff.postal_facility_identity for aff in affiliations]
        postmarks = self.get_queryset().filter(
            postal_facility_identity__in=facility_identities
        )
        page = self.paginate_queryset(postmarks)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(postmarks, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='my-submissions', permission_classes=[IsAuthenticated])
    def my_submissions(self, request):
        """
        Get catalog entries that were submitted via the Contributor Dashboard.
        Filters Postmarks where source_catalog='User contribution' and
        other_characteristics contains 'Submitted by: <username/email>'.
        """
        user = request.user
        username = (getattr(user, "username", "") or "").strip()
        email = (getattr(user, "email", "") or "").strip()
        needles = []
        if username:
            needles.append(f"Submitted by: {username}")
        if email and email != username:
            needles.append(f"Submitted by: {email}")
        if not needles:
            return Response(
                {"detail": "User has no username/email to match submissions."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        needle_q = Q()
        for needle in needles:
            needle_q |= Q(other_characteristics__icontains=needle)
        qs = self.get_queryset().filter(
            source_catalog="User contribution",
        ).filter(needle_q).order_by('-created_date')
        if not getattr(user, "is_superuser", False):
            assigned_units = _get_user_assigned_units(user)
            if assigned_units.exists():
                qs = qs.filter(state__in=assigned_units)
            else:
                qs = qs.none()
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def add_color(self, request, pk=None):
        """Add a color to a postmark"""
        postmark = self.get_object()
        color_id = request.data.get('color_id')
        if not color_id:
            return Response({'error': 'color_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            color = Color.objects.get(pk=color_id)
            PostmarkColor.objects.create(
                postmark=postmark,
                color=color,
                created_by=request.user
            )
            return Response({'status': 'color added'})
        except Color.DoesNotExist:
            return Response({'error': 'Color not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def add_date_range(self, request, pk=None):
        """Add a date range to a postmark"""
        postmark = self.get_object()
        serializer = PostmarkDatesSeenSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(postmark=postmark, created_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def by_facility(self, request):
        """Get postmarks grouped by facility"""
        facility_id = request.query_params.get('facility_id')
        if not facility_id:
            return Response({'error': 'facility_id parameter is required'},
                          status=status.HTTP_400_BAD_REQUEST)
        identities = PostalFacilityIdentity.objects.filter(postal_facility_id=facility_id)
        postmarks = self.get_queryset().filter(postal_facility_identity__in=identities)
        serializer = self.get_serializer(postmarks, many=True)
        return Response(serializer.data)


class PostmarkDateRangeView(APIView):
    """
    Returns the overall earliest and latest years seen for any cataloged postmark.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        agg = PostmarkDatesSeen.objects.aggregate(
            earliest_year=Min("earliest_date_seen__year"),
            latest_year=Max("latest_date_seen__year"),
        )
        earliest = int(agg["earliest_year"]) if agg["earliest_year"] is not None else None
        latest = int(agg["latest_year"]) if agg["latest_year"] is not None else None
        return Response({"earliest_year": earliest, "latest_year": latest})


class PostmarkImageViewSet(viewsets.ModelViewSet):
    """ViewSet for postmark images"""
    queryset = PostmarkImage.objects.all().select_related('postmark', 'created_by', 'modified_by')
    serializer_class = PostmarkImageSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['postmark', 'image_view']
    ordering_fields = ['display_order', 'created_date']
    ordering = ['display_order']
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve an image (requires regional permission)"""
        image = self.get_object()
        
        # Check if user is in responsible group
        responsible_groups = image.postmark.get_responsible_groups()
        user_groups = request.user.groups.all()
        
        if not any(group in responsible_groups for group in user_groups):
            return Response(
                {'error': 'You are not responsible for this region'},
                status=status.HTTP_403_FORBIDDEN
            )

        image.save()
        return Response({'status': 'image approved'})
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject an image (requires regional permission)"""
        image = self.get_object()
        
        # Check if user is in responsible group
        responsible_groups = image.postmark.get_responsible_groups()
        user_groups = request.user.groups.all()
        
        if not any(group in responsible_groups for group in user_groups):
            return Response(
                {'error': 'You are not responsible for this region'},
                status=status.HTTP_403_FORBIDDEN
            )

        image.save()
        return Response({'status': 'image rejected'})


class PostmarkValuationViewSet(viewsets.ModelViewSet):
    """ViewSet for postmark valuations"""
    queryset = PostmarkValuation.objects.all().select_related(
        'postmark', 'valued_by_user', 'created_by', 'modified_by'
    )
    serializer_class = PostmarkValuationSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['postmark', 'valued_by_user']
    ordering_fields = ['valuation_date', 'estimated_value']
    ordering = ['-valuation_date']


# ========== PUBLICATION VIEWSETS ==========

class PostmarkPublicationViewSet(viewsets.ModelViewSet):
    """ViewSet for publications"""
    queryset = PostmarkPublication.objects.all().select_related('created_by', 'modified_by')
    serializer_class = PostmarkPublicationSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['publication_type', 'author', 'publisher']
    search_fields = ['publication_title', 'author', 'publisher', 'isbn']
    ordering_fields = ['publication_date', 'publication_title']
    ordering = ['-publication_date']


class PostmarkPublicationReferenceViewSet(viewsets.ModelViewSet):
    """ViewSet for publication references"""
    queryset = PostmarkPublicationReference.objects.all().select_related(
        'postmark', 'postmark_publication', 'created_by'
    )
    serializer_class = PostmarkPublicationReferenceSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['postmark', 'postmark_publication']
    search_fields = ['published_id', 'reference_location']


# ========== POSTCOVER VIEWSETS ==========

class PostcoverViewSet(viewsets.ModelViewSet):
    """ViewSet for postcovers"""
    queryset = Postcover.objects.all().select_related(
        'owner_user', 'created_by', 'modified_by'
    ).prefetch_related(
        'postcover_postmarks__postmark',
        'images'
    )
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['owner_user']
    search_fields = ['postcover_key', 'description']
    ordering_fields = ['postcover_key', 'created_date']
    ordering = ['postcover_key']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return PostcoverListSerializer
        return PostcoverSerializer
    
    def perform_create(self, serializer):
        serializer.save(
            owner_user=self.request.user,
            created_by=self.request.user,
            modified_by=self.request.user
        )
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def my_collection(self, request):
        """Get current user's postcovers"""
        postcovers = self.get_queryset().filter(owner_user=request.user)
        serializer = self.get_serializer(postcovers, many=True)
        return Response(serializer.data)


class PostcoverImageViewSet(viewsets.ModelViewSet):
    """ViewSet for postcover images"""
    queryset = PostcoverImage.objects.all().select_related(
        'postcover', 'uploaded_by_user', 'created_by', 'modified_by'
    )
    serializer_class = PostcoverImageSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['postcover', 'image_view']
    ordering_fields = ['display_order', 'created_date']
    ordering = ['display_order']


# ========== ADMIN CSV UPLOADS (STAFF ONLY) ==========


def _parse_csv_file(file) -> dict:
    """Parse CSV file (handles quoted newlines). Returns { headers: [...], rows: [[...], ...] }."""
    content = file.read()
    if isinstance(content, bytes):
        content = content.decode('utf-8', errors='replace')
    reader = csv.reader(io.StringIO(content), quoting=csv.QUOTE_MINIMAL)
    rows = list(reader)
    if not rows:
        return {'headers': [], 'rows': []}
    return {'headers': rows[0], 'rows': rows[1:]}


class AdminCsvUploadViewSet(viewsets.ModelViewSet):
    """
    Staff-only: upload CSV files and view parsed data.
    POST multipart/form-data with key "file" (the CSV file).
    CSRF not enforced so SPA can POST without token (protected by IsAdminUser).
    """
    authentication_classes = [SessionAuthenticationNoCSRF]
    permission_classes = [IsAuthenticated, IsAdminUser]
    queryset = AdminCsvUpload.objects.all().select_related('uploaded_by').order_by('-uploaded_at')
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ['get', 'post', 'head', 'options', 'delete']

    @classmethod
    def as_view(cls, *args, **kwargs):
        """Wrap so the view function Django's CSRF middleware sees is exempt (SPA cross-origin)."""
        view = super().as_view(*args, **kwargs)
        return csrf_exempt(view)

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == 'list':
            # Don't load the large Data JSON so MySQL and responses stay fast
            qs = qs.only('id', 'name', 'file_name', 'uploaded_at', 'uploaded_by_id', 'row_count')
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return AdminCsvUploadListSerializer
        return AdminCsvUploadSerializer

    def create(self, request, *args, **kwargs):
        csv_file = request.FILES.get('file')
        if not csv_file:
            return Response(
                {'detail': 'No file provided. Send multipart/form-data with key "file".'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        name = request.data.get('name') or csv_file.name or 'Unnamed upload'
        try:
            data = _parse_csv_file(csv_file)
        except Exception as e:
            return Response(
                {'detail': f'Failed to parse CSV: {e!s}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obj = AdminCsvUpload.objects.create(
            name=name,
            file_name=csv_file.name or 'upload.csv',
            uploaded_by=request.user if request.user.is_authenticated else None,
            data=data,
        )
        serializer = AdminCsvUploadSerializer(obj)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='import-to-catalog')
    def import_to_catalog(self, request, pk=None):
        """
        Import this CSV upload into catalog tables.
        POST body: { "import_type": "states" | "lettering" | "framing" | "date_format" | "colors" }
        """
        obj = self.get_object()
        import_type = (request.data.get('import_type') or '').strip().lower()
        if not import_type:
            return Response(
                {'detail': 'Missing import_type. Use one of: states, lettering, framing, date_format, colors.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if import_type not in IMPORTERS:
            return Response(
                {'detail': f'Unknown import_type: {import_type}. Use one of: {", ".join(IMPORTERS)}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = request.user
        if not user.is_authenticated:
            return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

        data = obj.data or {}
        try:
            result = IMPORTERS[import_type](data, user)
        except Exception as e:
            return Response(
                {'detail': f'Import failed: {e!s}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(result, status=status.HTTP_200_OK)

###################################################################################################
