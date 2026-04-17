###################################################################################################
## WoCo Commons - API Views
## MPC: 2025/11/15
###################################################################################################
import csv
import hashlib
import io
import json
import os
import re
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Optional, Tuple
from urllib.parse import urlparse

from django.conf import settings
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import send_mail
from django.db.models import Q, Count, Prefetch, Min, Max
from django.db.utils import ProgrammingError
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

_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_YEAR_RE = re.compile(r"^\d{4}$")
_YEAR_RANGE_RE = re.compile(r"^\s*(\d{4})\s*[-–—]\s*(\d{4})\s*$")
_CITATION_PAGE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9\s\-–—.,:;()/#]*$")


def _parse_dates_seen_from_payload(payload: dict) -> Tuple[date, date]:
    """
    Parse earliest/latest date seen from contribution payload.

    Supports:
    - first_seen/last_seen (or firstSeen/lastSeen) as YYYY or YYYY-MM-DD
    - date_range/dateRange as:
        - YYYY
        - YYYY-YYYY
        - YYYY-MM-DD
        - YYYY-MM-DD - YYYY-MM-DD (spaces around dash)
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

    if first_raw or last_raw:
        e = _parse_token(first_raw or last_raw, is_latest=False) or date(1900, 1, 1)
        l = _parse_token(last_raw or first_raw, is_latest=True) or date(1900, 12, 31)
        return (e, l) if e <= l else (l, e)

    s = (range_raw or "").strip()
    if not s:
        return date(1900, 1, 1), date(1900, 12, 31)

    m = _YEAR_RANGE_RE.match(s)
    if m:
        y1 = max(1, min(int(m.group(1)), 9999))
        y2 = max(1, min(int(m.group(2)), 9999))
        e = date(y1, 1, 1)
        l = date(y2, 12, 31)
        return (e, l) if e <= l else (l, e)

    if _ISO_DATE_RE.match(s):
        d = _parse_token(s, is_latest=False) or date(1900, 1, 1)
        return d, d

    parts = re.split(r"\s+[-–—]\s+", s)
    if len(parts) >= 2:
        e = _parse_token(parts[0], is_latest=False) or date(1900, 1, 1)
        l = _parse_token(parts[1], is_latest=True) or e
        return (e, l) if e <= l else (l, e)

    try:
        y = int(s.strip()[:4])
        y = max(1, min(y, 9999))
        return date(y, 1, 1), date(y, 12, 31)
    except Exception:
        return date(1900, 1, 1), date(1900, 12, 31)


def _coerce_reference_work_ids(raw_values) -> list[int]:
    """
    Normalize arbitrary reference_work_ids payloads into a unique int list.
    Accepts list/int/str, including JSON array strings and comma-separated strings.
    """
    candidates = []
    if raw_values is None:
        return []
    if isinstance(raw_values, (list, tuple)):
        candidates.extend(raw_values)
    else:
        candidates.append(raw_values)

    flattened = []
    for val in candidates:
        if val is None:
            continue
        if isinstance(val, (list, tuple)):
            flattened.extend(val)
            continue
        if isinstance(val, int):
            flattened.append(val)
            continue
        s = str(val).strip()
        if not s:
            continue
        if s.startswith("[") and s.endswith("]"):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    flattened.extend(parsed)
                    continue
            except Exception:
                pass
        if "," in s:
            flattened.extend([chunk.strip() for chunk in s.split(",") if chunk.strip() != ""])
            continue
        flattened.append(s)

    out: list[int] = []
    seen: set[int] = set()
    for val in flattened:
        try:
            n = int(val)
        except (TypeError, ValueError):
            continue
        if n <= 0 or n in seen:
            continue
        seen.add(n)
        out.append(n)
    return out


def _extract_reference_work_ids(data) -> list[int]:
    """
    Extract reference_work_ids from request.data (JSON dict or multipart QueryDict).
    Supports keys:
    - reference_work_ids (JSON array / scalar / csv string)
    - reference_work_ids[] (repeated form fields)
    """
    values = []
    if hasattr(data, "getlist"):
        values.extend(data.getlist("reference_work_ids[]"))
        values.extend(data.getlist("reference_work_ids"))
    else:
        if isinstance(data, dict):
            if "reference_work_ids[]" in data:
                values.append(data.get("reference_work_ids[]"))
            if "reference_work_ids" in data:
                values.append(data.get("reference_work_ids"))
    return _coerce_reference_work_ids(values)


def _extract_reference_work_ids_from_payload(payload: dict) -> list[int]:
    if not isinstance(payload, dict):
        return []
    values = []
    if "reference_work_ids" in payload:
        values.append(payload.get("reference_work_ids"))
    if "reference_work_ids[]" in payload:
        values.append(payload.get("reference_work_ids[]"))
    return _coerce_reference_work_ids(values)


def _extract_reference_work_details_from_payload(payload: dict) -> dict[int, dict]:
    """
    Read optional per-reference citation metadata from payload:
    reference_work_details: [{"reference_work_id": 1, "page_number": "...", "url": "..."}]
    """
    if not isinstance(payload, dict):
        return {}

    raw = payload.get("reference_work_details", payload.get("referenceWorkDetails"))
    if raw is None:
        return {}

    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return {}
        try:
            raw = json.loads(s)
        except Exception:
            return {}

    if not isinstance(raw, list):
        return {}

    details: dict[int, dict] = {}
    for row in raw:
        if not isinstance(row, dict):
            continue
        rid_raw = row.get("reference_work_id", row.get("referenceWorkId"))
        try:
            rid = int(rid_raw)
        except (TypeError, ValueError):
            continue
        if rid <= 0:
            continue
        page_number = str(row.get("page_number", row.get("pageNumber", "")) or "").strip()
        url = str(row.get("url", "") or "").strip()
        details[rid] = {
            "page_number": page_number,
            "url": url,
        }
    return details


def _build_citation_detail(detail: Optional[dict]) -> str:
    if not isinstance(detail, dict):
        return "Selected via contribution workflow"
    parts = []
    page_number = str(detail.get("page_number", "") or "").strip()
    url = str(detail.get("url", "") or "").strip()
    if page_number:
        parts.append(f"Page: {page_number}")
    if url:
        parts.append(f"URL: {url}")
    if not parts:
        return "Selected via contribution workflow"
    return " | ".join(parts)[:500]


def _validate_reference_work_payload(reference_work_ids: list[int], reference_details: dict[int, dict]) -> list[str]:
    errors = []
    if not reference_work_ids and reference_details:
        reference_work_ids = list(reference_details.keys())

    if reference_work_ids:
        existing_ids = set(
            ReferenceWork.objects.filter(reference_work_id__in=reference_work_ids).values_list(
                "reference_work_id", flat=True
            )
        )
        missing = [rid for rid in reference_work_ids if rid not in existing_ids]
        if missing:
            errors.append(
                "Unknown reference work id(s): " + ", ".join(str(x) for x in missing)
            )

    for rid, detail in (reference_details or {}).items():
        page_number = str((detail or {}).get("page_number", "") or "").strip()
        citation_url = str((detail or {}).get("url", "") or "").strip()

        if page_number:
            if len(page_number) > 120:
                errors.append(f"Reference {rid}: page number must be 120 characters or fewer.")
            elif not _CITATION_PAGE_RE.match(page_number):
                errors.append(f"Reference {rid}: page number has invalid characters.")

        if citation_url:
            if len(citation_url) > 2000:
                errors.append(f"Reference {rid}: URL must be 2000 characters or fewer.")
            else:
                parsed = urlparse(citation_url)
                if parsed.scheme not in ("http", "https") or not parsed.netloc:
                    errors.append(
                        f"Reference {rid}: URL must be a valid http:// or https:// link."
                    )

    return errors


def _sync_postmark_citations_from_payload(postmark, payload: dict, acting_user) -> None:
    """
    Replace POSTMARK citations for this postmark from payload.reference_work_ids.
    """
    if not postmark or not payload or not acting_user:
        return
    reference_ids = _extract_reference_work_ids_from_payload(payload)
    reference_details = _extract_reference_work_details_from_payload(payload)
    if not reference_ids and reference_details:
        reference_ids = list(reference_details.keys())
    subject_id = getattr(postmark, "postmark_id", None) or getattr(postmark, "pk", None)
    if not subject_id:
        return

    Citation.objects.filter(subject_type="POSTMARK", subject_id=subject_id).delete()
    if not reference_ids:
        return

    works = ReferenceWork.objects.filter(reference_work_id__in=reference_ids)
    works_by_id = {int(w.reference_work_id): w for w in works}
    for rid in reference_ids:
        work = works_by_id.get(int(rid))
        if not work:
            continue
        Citation.objects.create(
            reference_work=work,
            subject_type="POSTMARK",
            subject_id=subject_id,
            citation_detail=_build_citation_detail(reference_details.get(int(rid))),
            created_by=acting_user,
            modified_by=acting_user,
        )

from common.models import (
    Region, PostOffice, Lettering, Framing, Shape, Cover, DateObserved,
    Ratemark, Auxmark, CoverPostmark, PostmarkRatemark, MarkFraming,
    ReferenceWork, Citation,
    PostalFacility, PostalFacilityIdentity,
    AdministrativeUnit, AdministrativeUnitIdentity, AdministrativeUnitResponsibility,
    JurisdictionalAffiliation,
    PostmarkShape, LetteringStyle, FramingStyle, Color, DateFormat,
    Postmark, PostmarkV2, PostmarkColor, PostmarkDatesSeen, PostmarkSize,
    PostmarkValuation, PostmarkPublication, PostmarkPublicationReference,
    PostmarkImage, Postcover, PostcoverPostmark, PostcoverImage,
    AdminCsvUpload, UserLocationAssignment, Contribution, FAQEntry,
)

from .serializers import (
    RegionSerializer, PostOfficeSerializer, LetteringSerializer, FramingSerializer,
    ShapeSerializer, CoverSerializer, DateObservedSerializer, RatemarkSerializer,
    AuxmarkSerializer, CoverPostmarkSerializer, PostmarkRatemarkSerializer,
    MarkFramingSerializer, ReferenceWorkSerializer, CitationSerializer,
    PostalFacilitySerializer, PostalFacilityListSerializer,
    PostalFacilityIdentitySerializer, AdministrativeUnitSerializer,
    AdministrativeUnitListSerializer, AdministrativeUnitIdentitySerializer,
    AdministrativeUnitResponsibilitySerializer, JurisdictionalAffiliationSerializer,
    PostmarkShapeSerializer, LetteringStyleSerializer, FramingStyleSerializer,
    ColorSerializer, DateFormatSerializer, PostmarkSerializer, PostmarkV2Serializer,
    PostmarkListSerializer, PostmarkColorSerializer, PostmarkDatesSeenSerializer,
    PostmarkSizeSerializer, PostmarkValuationSerializer, PostmarkPublicationSerializer,
    PostmarkPublicationReferenceSerializer, PostmarkImageSerializer,
    PostcoverSerializer, PostcoverListSerializer, PostcoverPostmarkSerializer,
    PostcoverImageSerializer,
    AdminCsvUploadListSerializer, AdminCsvUploadSerializer,
    LoginRequestSerializer,
    ContributionListSerializer, ContributionDetailSerializer, ContributionApproveRejectSerializer,
    FAQEntrySerializer,
)
from common.filters import PostmarkListFilter
from common.csv_import import IMPORTERS


_password_reset_token_generator = PasswordResetTokenGenerator()


def _get_user_role(user):
    """
    Derive a simple role string for the frontend from Django auth state.

    Role is driven by group membership so that the admin "Role" dropdown
    (which adds/removes the State Editors group) is the single source
    of truth for UI behavior.

    - Users in the "State Editors" group are state editors.
    - Everyone else (including superusers without that group) is a contributor.
    """
    if user.groups.filter(name__iexact="State Editors").exists():
        return "state_editor"
    return "contributor"


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
        return Response({
            "user": {
                "id": user.pk,
                "username": user.username,
                "email": getattr(user, "email", "") or "",
                "is_staff": getattr(user, "is_staff", False),
                "role": _get_user_role(user),
            },
        })


class CurrentUserView(APIView):
    """Return current user when authenticated via session (for SPA auth state)."""
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        user = request.user
        return Response({
            "user": {
                "id": user.pk,
                "username": user.username,
                "email": getattr(user, "email", "") or "",
                "is_staff": getattr(user, "is_staff", False),
                "role": _get_user_role(user),
            },
        })


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


def _extract_image_metas_from_payload(payload):
    """
    Normalize contribution image metadata into a flat list.
    Supports explicit grouped keys and legacy image_meta/image_metas payloads.
    """
    category_map = {
        "postmark_image_metas": "postmark",
        "ratemark_image_metas": "ratemark",
        "auxmark_image_metas": "auxmark",
    }
    normalized = []

    def _append_many(raw_items, default_category):
        if not isinstance(raw_items, list):
            return
        for raw in raw_items:
            if not isinstance(raw, dict):
                continue
            storage = raw.get("storage_filename")
            if not storage:
                continue
            category = str(raw.get("mark_category") or raw.get("image_category") or default_category or "postmark").strip().lower()
            normalized.append(
                {
                    "storage_filename": storage,
                    "original_filename": (raw.get("original_filename") or "image")[:255],
                    "file_checksum": (raw.get("file_checksum") or "")[:64],
                    "mime_type": (raw.get("mime_type") or "image/jpeg")[:50],
                    "image_width": raw.get("image_width", 0),
                    "image_height": raw.get("image_height", 0),
                    "file_size_bytes": raw.get("file_size_bytes", 0),
                    "mark_category": category,
                    "image_description": (raw.get("image_description") or "").strip(),
                }
            )

    has_grouped = False
    for key, category in category_map.items():
        raw_items = payload.get(key)
        if isinstance(raw_items, list) and raw_items:
            has_grouped = True
        _append_many(raw_items, category)

    if has_grouped:
        return normalized

    _append_many(payload.get("image_metas"), "postmark")
    raw_single = payload.get("image_meta")
    if isinstance(raw_single, dict):
        _append_many([raw_single], "postmark")
    return normalized


def _create_postmark_images_from_payload(postmark, user, payload, replace_existing=False):
    image_metas = _extract_image_metas_from_payload(payload)
    if not image_metas:
        return False
    if replace_existing:
        PostmarkImage.objects.filter(postmark=postmark).delete()

    category_prefix = {
        "postmark": "Postmark",
        "ratemark": "Ratemark",
        "auxmark": "Auxmark",
    }

    for idx, meta in enumerate(image_metas):
        category = str(meta.get("mark_category") or "postmark").strip().lower()
        prefix = category_prefix.get(category, "Postmark")
        custom_description = (meta.get("image_description") or "").strip()
        image_description = custom_description or f"{prefix} image"
        PostmarkImage.objects.create(
            postmark=postmark,
            original_filename=meta.get("original_filename", "image")[:255],
            storage_filename=meta["storage_filename"],
            file_checksum=meta.get("file_checksum", "")[:64],
            mime_type=meta.get("mime_type", "image/jpeg")[:50],
            image_width=meta.get("image_width", 0),
            image_height=meta.get("image_height", 0),
            file_size_bytes=meta.get("file_size_bytes", 0),
            image_view="FULL",
            image_description=image_description,
            display_order=idx,
            uploaded_by=user,
            created_by=user,
            modified_by=user,
        )
    return True


def _extract_mark_entries(payload, key):
    """
    Normalize ratemarks/auxmarks payloads from JSON body or multipart string field.
    """
    raw = payload.get(key)
    if raw is None:
        return []
    if isinstance(raw, list):
        return [row for row in raw if isinstance(row, dict)]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [row for row in parsed if isinstance(row, dict)]
        except json.JSONDecodeError:
            return []
    return []


def _as_decimal(value):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        return None


def _resolve_shape_for_mark(type_str):
    name = str(type_str or "").strip()
    if not name:
        return None
    return Shape.objects.filter(name__iexact=name).first()


def _resolve_color_for_mark(color_str):
    name = str(color_str or "").strip()
    if not name:
        return Color.objects.filter(color_name__iexact="Black").first() or Color.objects.first()
    color = Color.objects.filter(color_name__iexact=name).first()
    if color:
        return color
    return Color.objects.filter(color_name__iexact="Black").first() or Color.objects.first()


def _sync_ratemarks_auxmarks_from_payload(postmark, user, payload):
    """
    Create ratemarks + auxmarks from contribution payload and link them to the postmark.
    """
    ratemark_entries = _extract_mark_entries(payload, "ratemarks")
    auxmark_entries = _extract_mark_entries(payload, "auxmarks")
    if not ratemark_entries and not auxmark_entries:
        return

    default_lettering = Lettering.objects.first()
    created_ratemarks = []
    for row in ratemark_entries:
        manuscript = str(row.get("manuscript") or "").strip().lower() == "yes"
        ratemark = Ratemark.objects.create(
            inscription_txt=str(row.get("inscription_txt") or "").strip(),
            is_manuscript=manuscript,
            shape=_resolve_shape_for_mark(row.get("type")),
            lettering=None if manuscript else default_lettering,
            color=_resolve_color_for_mark(row.get("color")),
            impression=str(row.get("impression") or "").strip() or None,
            is_irreg=bool(row.get("is_irreg")) if row.get("is_irreg") is not None else None,
            width=_as_decimal(row.get("width_mm")),
            height=_as_decimal(row.get("height_mm")),
            rate_val=_as_decimal(row.get("rate_val")),
            created_by=user,
            modified_by=user,
        )
        PostmarkRatemark.objects.get_or_create(
            postmark=postmark,
            ratemark=ratemark,
            defaults={"placement_type": "SEPARATE", "created_by": user, "modified_by": user},
        )
        created_ratemarks.append(ratemark)

    for row in auxmark_entries:
        manuscript = str(row.get("manuscript") or "").strip().lower() == "yes"
        parent_type = str(row.get("parent_mark_type") or "POSTMARK").strip().upper()
        parent_mark_type = "POSTMARK"
        parent_mark_id = postmark.postmark_id
        if parent_type == "RATEMARK" and created_ratemarks:
            parent_mark_type = "RATEMARK"
            parent_mark_id = created_ratemarks[0].pk

        Auxmark.objects.create(
            parent_mark_type=parent_mark_type,
            parent_mark_id=parent_mark_id,
            inscription_text=str(row.get("inscription_txt") or "").strip(),
            is_manuscript=manuscript,
            shape=_resolve_shape_for_mark(row.get("type")),
            lettering=None if manuscript else default_lettering,
            color=_resolve_color_for_mark(row.get("color")),
            impression=str(row.get("impression") or "").strip() or None,
            is_irreg=bool(row.get("is_irreg")) if row.get("is_irreg") is not None else None,
            width=_as_decimal(row.get("width_mm")),
            height=_as_decimal(row.get("height_mm")),
            created_by=user,
            modified_by=user,
        )


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
            "type": (payload.get("type") or "").strip(),
            "color": (payload.get("color") or "").strip(),
            "manuscript": (payload.get("manuscript") or "").strip(),
            "dimensions": (payload.get("dimensions") or "").strip(),
            "description": (payload.get("description") or "").strip(),
            "references": (payload.get("references") or "").strip(),
            "reference_work_ids": _extract_reference_work_ids_from_payload(payload),
            "reference_work_details": _extract_reference_work_details_from_payload(payload),
            "rarity": (payload.get("rarity") or "").strip(),
            "submitter_name": (payload.get("submitter_name") or "").strip(),
            "original_postmark_id": str(payload.get("original_postmark_id", "")),
            "ratemarks": payload.get("ratemarks", []),
            "auxmarks": payload.get("auxmarks", []),
        }
        if payload.get("postmark_image_metas"):
            submitted_data["postmark_image_metas"] = payload["postmark_image_metas"]
        if payload.get("ratemark_image_metas"):
            submitted_data["ratemark_image_metas"] = payload["ratemark_image_metas"]
        if payload.get("auxmark_image_metas"):
            submitted_data["auxmark_image_metas"] = payload["auxmark_image_metas"]
        if payload.get("image_metas"):
            submitted_data["image_metas"] = payload["image_metas"]
        if payload.get("image_meta"):
            submitted_data["image_meta"] = payload["image_meta"]
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
    if not payload.get("state") or not payload.get("town"):
        return None
    submitter_name = payload.get("submitter_name", "")
    if contrib.postmark_id:
        return _update_postmark_in_catalog(contrib.postmark_id, payload, submitter_name)
    postmark = _create_postmark_in_catalog(payload)
    if postmark:
        contrib.postmark = postmark
        contrib.save(update_fields=["postmark", "updated_at"])
    return postmark


def _create_postmark_in_catalog(payload):
    """
    Create a Postmark (and related records) directly in the catalog tables from
    the contribute form payload. No separate contribution table; data goes into
    the same tables that catalog search uses.
    Uses a system user for created_by/modified_by. Returns the Postmark or None on failure.
    """
    user = _get_contribution_user()
    if not user:
        return None
    try:
        state_str = (payload.get("state") or "").strip()
        town_str = (payload.get("town") or "").strip()
        date_range_str = (payload.get("date_range") or "").strip()
        type_str = (payload.get("type") or "").strip()
        color_str = (payload.get("color") or "").strip()
        manuscript_str = (payload.get("manuscript") or "").strip()
        dimensions_str = (payload.get("dimensions") or "").strip()
        description_str = (payload.get("description") or "").strip()
        references_str = (payload.get("references") or "").strip()
        rarity_str = (payload.get("rarity") or "").strip()
        original_postmark_id = payload.get("original_postmark_id")

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
        # Shape by type name; fallback to first
        shape = PostmarkShape.objects.filter(shape_name=type_str).first()
        if not shape:
            shape = PostmarkShape.objects.first()
        if not shape:
            return None
        lettering = LetteringStyle.objects.first()
        framing = FramingStyle.objects.first()
        date_format = DateFormat.objects.first()
        if not lettering or not framing or not date_format:
            return None
        # Unique key
        postmark_key = f"CONTRIB-{uuid.uuid4().hex[:12]}"
        is_manuscript = manuscript_str.lower() == "yes"
        # Build other_characteristics from contributor fields (description, references, rarity, submitter)
        other_parts = []
        if description_str:
            other_parts.append(f"Description: {description_str}")
        if references_str:
            other_parts.append(f"Citation references: {references_str}")
        if rarity_str:
            other_parts.append(f"Rarity: {rarity_str}")
        if original_postmark_id:
            other_parts.append(f"Correction to catalog ID: {original_postmark_id}")
        submitter_str = (payload.get("submitter_name") or "").strip()
        if submitter_str:
            other_parts.append(f"Submitted by: {submitter_str}")
        other_characteristics = "\n".join(other_parts) if other_parts else ""

        postmark = Postmark.objects.create(
            site_id=1,
            postal_facility_identity=identity,
            state=admin_unit,
            postmark_shape=shape,
            lettering_style=lettering,
            framing_style=framing,
            date_format=date_format,
            postmark_key=postmark_key,
            rate_location="NONE",
            rate_value="",
            is_manuscript=is_manuscript,
            source_catalog="User contribution",
            contribution_approval_status="pending",
            other_characteristics=other_characteristics[:10000] if other_characteristics else "",
            created_by=user,
            modified_by=user,
        )
        # Dimensions: store in PostmarkSize (size_notes) when provided
        if dimensions_str:
            PostmarkSize.objects.create(
                postmark=postmark,
                width=0,
                height=0,
                size_notes=dimensions_str[:255],
                created_by=user,
                modified_by=user,
            )
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
        # Dates seen: support year-only OR full YYYY-MM-DD (via first_seen/last_seen or date_range)
        earliest, latest = _parse_dates_seen_from_payload(payload)
        PostmarkDatesSeen.objects.create(
            postmark=postmark,
            earliest_date_seen=earliest,
            latest_date_seen=latest,
            created_by=user,
            modified_by=user,
        )
        # Optional: attach uploaded postmark/ratemark/auxmark images.
        _create_postmark_images_from_payload(postmark, user, payload, replace_existing=False)
        _sync_ratemarks_auxmarks_from_payload(postmark, user, payload)
        return postmark
    except Exception:
        return None


def _update_postmark_in_catalog(postmark_id, payload, submitter_name):
    """
    Update an existing user-contribution Postmark in place.
    Verifies permissions and updates in place. Returns the updated Postmark or None.
    """
    try:
        postmark = Postmark.objects.filter(postmark_id=postmark_id).first()
        if not postmark:
            return None

        user = _get_contribution_user()
        if not user:
            return None

        state_str = (payload.get("state") or "").strip()
        town_str = (payload.get("town") or "").strip()
        date_range_str = (payload.get("date_range") or "").strip()
        type_str = (payload.get("type") or "").strip()
        color_str = (payload.get("color") or "").strip()
        manuscript_str = (payload.get("manuscript") or "").strip()
        dimensions_str = (payload.get("dimensions") or "").strip()
        description_str = (payload.get("description") or "").strip()
        references_str = (payload.get("references") or "").strip()
        rarity_str = (payload.get("rarity") or "").strip()

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
        is_manuscript = manuscript_str.lower() == "yes"
        other_parts = []
        if description_str:
            other_parts.append(f"Description: {description_str}")
        if references_str:
            other_parts.append(f"Citation references: {references_str}")
        if rarity_str:
            other_parts.append(f"Rarity: {rarity_str}")
        if submitter_name.strip():
            other_parts.append(f"Submitted by: {submitter_name.strip()}")
        other_characteristics = "\n".join(other_parts) if other_parts else ""

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

        # Update Postmark; mark as pending again so admin can re-approve
        postmark.postal_facility_identity = identity
        postmark.state = admin_unit
        postmark.postmark_shape = shape
        postmark.is_manuscript = is_manuscript
        postmark.other_characteristics = other_characteristics[:10000] if other_characteristics else ""
        postmark.contribution_approval_status = "pending"
        postmark.modified_by = user
        postmark.save(
            update_fields=[
                "postal_facility_identity",
                "state",
                "postmark_shape",
                "is_manuscript",
                "other_characteristics",
                "contribution_approval_status",
                "last_public_update_at",
                "modified_by",
            ]
        )

        # Replace dimensions
        PostmarkSize.objects.filter(postmark=postmark).delete()
        if dimensions_str:
            PostmarkSize.objects.create(
                postmark=postmark,
                width=0,
                height=0,
                size_notes=dimensions_str[:255],
                created_by=user,
                modified_by=user,
            )

        # Replace color
        PostmarkColor.objects.filter(postmark=postmark).delete()
        color_name = color_str or "Black"
        color, _ = Color.objects.get_or_create(
            color_name=color_name[:50],
            defaults={"created_by": user, "modified_by": user},
        )
        PostmarkColor.objects.create(postmark=postmark, color=color, created_by=user, modified_by=user)

        # Replace dates seen (support year-only OR full YYYY-MM-DD)
        PostmarkDatesSeen.objects.filter(postmark=postmark).delete()
        earliest, latest = _parse_dates_seen_from_payload(payload)
        PostmarkDatesSeen.objects.create(
            postmark=postmark,
            earliest_date_seen=earliest,
            latest_date_seen=latest,
            created_by=user,
            modified_by=user,
        )

        # Replace image set when new files are provided.
        _create_postmark_images_from_payload(postmark, user, payload, replace_existing=True)
        _sync_ratemarks_auxmarks_from_payload(postmark, user, payload)
        return postmark
    except Exception:
        return None


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
        """List the current user's contributions."""
        qs = Contribution.objects.filter(contributor=request.user).select_related(
            "contributor", "reviewer", "postmark"
        ).order_by("-created_at")
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
        reference_work_ids = _extract_reference_work_ids(data)
        reference_work_details = _extract_reference_work_details_from_payload(data)
        ratemarks = _extract_mark_entries(data, "ratemarks")
        auxmarks = _extract_mark_entries(data, "auxmarks")
        if reference_work_details:
            reference_work_ids = list(dict.fromkeys(reference_work_ids + list(reference_work_details.keys())))
        reference_errors = _validate_reference_work_payload(reference_work_ids, reference_work_details)
        if reference_errors:
            return Response(
                {
                    "detail": "Invalid reference details.",
                    "reference_errors": reference_errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        payload = {
            "state": state,
            "town": town,
            "date_range": date_range,
            "first_seen": first_seen,
            "last_seen": last_seen,
            "type": type_val,
            "color": color,
            "manuscript": manuscript,
            "dimensions": (data.get("dimensions") or "").strip(),
            "description": (data.get("description") or "").strip(),
            "references": (data.get("references") or "").strip(),
            "reference_work_ids": reference_work_ids,
            "reference_work_details": reference_work_details,
            "rarity": (data.get("rarity") or "").strip(),
            "submitter_name": submitter_name,
            "ratemarks": ratemarks,
            "auxmarks": auxmarks,
        }
        if assigned_admin_unit is not None:
            payload["admin_unit"] = assigned_admin_unit
        postmark_files = request.FILES.getlist("postmark_image") or request.FILES.getlist("postmark_images")
        ratemark_files = request.FILES.getlist("ratemark_image") or request.FILES.getlist("ratemark_images")
        auxmark_files = request.FILES.getlist("auxmark_image") or request.FILES.getlist("auxmark_images")
        legacy_files = request.FILES.getlist("image")
        if not postmark_files and legacy_files:
            postmark_files = legacy_files

        def _save_files(file_list, category):
            metas = []
            for uploaded in file_list:
                meta = _save_contribution_image(uploaded)
                if not meta:
                    continue
                meta["mark_category"] = category
                metas.append(meta)
            return metas

        postmark_image_metas = _save_files(postmark_files, "postmark")
        ratemark_image_metas = _save_files(ratemark_files, "ratemark")
        auxmark_image_metas = _save_files(auxmark_files, "auxmark")
        all_image_metas = [*postmark_image_metas, *ratemark_image_metas, *auxmark_image_metas]

        if postmark_image_metas:
            payload["postmark_image_metas"] = postmark_image_metas
            payload["image_meta"] = postmark_image_metas[0]
        if ratemark_image_metas:
            payload["ratemark_image_metas"] = ratemark_image_metas
        if auxmark_image_metas:
            payload["auxmark_image_metas"] = auxmark_image_metas
        if all_image_metas:
            payload["image_metas"] = all_image_metas

        if edit_postmark_id is None and edit_contribution_id is None and not postmark_image_metas:
            return Response(
                {"detail": "Missing required field: postmark_image."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
            submitted_data = {k: v for k, v in payload.items() if k != "admin_unit"}
            contrib.submitted_data = submitted_data
            contrib.status = Contribution.STATUS_PENDING
            contrib.save(update_fields=["submitted_data", "status", "updated_at"])
            return Response(
                {"detail": "Submission updated successfully.", "contributionId": contrib.id},
                status=status.HTTP_200_OK,
            )

        if edit_postmark_id is not None:
            # Suggested edits to an existing catalog entry (S6).
            # - Contributors: create a Contribution ticket for expert review.
            # - State Editors / superusers: apply directly to the catalog.
            role = _get_user_role(user)
            if role == "contributor" and not getattr(user, "is_superuser", False):
                from common.models import Contribution  # local import to avoid circulars at top

                try:
                    submitted_data = {
                        "state": payload.get("state", ""),
                        "town": payload.get("town", ""),
                        "date_range": payload.get("date_range", ""),
                        "type": payload.get("type", ""),
                        "color": payload.get("color", ""),
                        "manuscript": payload.get("manuscript", ""),
                        "dimensions": payload.get("dimensions", ""),
                        "description": payload.get("description", ""),
                        "references": payload.get("references", ""),
                        "reference_work_ids": payload.get("reference_work_ids", []),
                        "reference_work_details": payload.get("reference_work_details", {}),
                        "ratemarks": payload.get("ratemarks", []),
                        "auxmarks": payload.get("auxmarks", []),
                        "rarity": payload.get("rarity", ""),
                        "submitter_name": submitter_name,
                        "original_postmark_id": str(edit_postmark_id),
                    }
                    if payload.get("postmark_image_metas"):
                        submitted_data["postmark_image_metas"] = payload["postmark_image_metas"]
                    if payload.get("ratemark_image_metas"):
                        submitted_data["ratemark_image_metas"] = payload["ratemark_image_metas"]
                    if payload.get("auxmark_image_metas"):
                        submitted_data["auxmark_image_metas"] = payload["auxmark_image_metas"]
                    if payload.get("image_metas"):
                        submitted_data["image_metas"] = payload["image_metas"]
                    if payload.get("image_meta"):
                        submitted_data["image_meta"] = payload["image_meta"]

                    # Contribution.postmark is OneToOne, so only one row can
                    # exist per catalog postmark. Update existing suggestion
                    # instead of creating a duplicate that would violate the
                    # unique constraint.
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

            # State Editors and superusers: update catalog directly.
            postmark = _update_postmark_in_catalog(edit_postmark_id, payload, submitter_name)
            if not postmark:
                return Response(
                    {"detail": "Could not apply catalog edit. Ensure the target listing exists and try again."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            _sync_postmark_citations_from_payload(postmark, payload, request.user)
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
    sd = contrib.submitted_data or {}
    state_str = (sd.get("state") or "").strip()
    assigned = _get_user_assigned_units(user)
    if not assigned.exists():
        return False
    return _resolve_assigned_admin_unit(user, state_str) is not None


class IsStateEditorOrContributor(BasePermission):
    """Contributors can view their own; State Editors can list/review all in their region."""
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            if obj.contributor_id == request.user.id:
                return True
            return _can_review_contribution(request.user, obj)
        if request.method in ("POST",):  # approve/reject
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
        """Approve a contribution; apply submitted_data to catalog."""
        contrib = self.get_object()
        if contrib.status != Contribution.STATUS_PENDING:
            return Response(
                {"detail": f"Contribution is not pending (status: {contrib.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = ContributionApproveRejectSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        review_notes = serializer.validated_data.get("review_notes", "")
        postmark = _apply_contribution_to_catalog(contrib)
        if not postmark:
            return Response(
                {"detail": "Could not apply contribution to catalog. Check submitted_data."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        contrib.status = Contribution.STATUS_APPROVED
        contrib.reviewer = request.user
        contrib.review_notes = review_notes
        contrib.save(update_fields=["status", "reviewer", "review_notes", "postmark", "updated_at"])
        postmark.contribution_approval_status = "approved"
        postmark.save(update_fields=["contribution_approval_status"])
        _sync_postmark_citations_from_payload(postmark, contrib.submitted_data or {}, request.user)
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

        # 2. Users assigned to this postmark's state can delete any listing in that state
        assigned_units = _get_user_assigned_units(user)
        if postmark.state_id and assigned_units.filter(pk=postmark.state_id).exists():
            postmark.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # 3. Fallback: original submitter of a user-contribution listing can delete their own
        if postmark.source_catalog != "User contribution":
            return Response({"detail": "Catalog entry not found."}, status=status.HTTP_404_NOT_FOUND)

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

class RegionViewSet(viewsets.ModelViewSet):
    """ViewSet for v2 regions."""
    queryset = Region.objects.all().select_related("parent_region")
    serializer_class = RegionSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["region_tier", "parent_region"]
    search_fields = ["name", "abbrev"]
    ordering_fields = ["name", "abbrev", "established_date", "defunct_date", "created_date"]
    ordering = ["name"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class PostOfficeViewSet(viewsets.ModelViewSet):
    """ViewSet for v2 post offices."""
    queryset = PostOffice.objects.all().select_related("region")
    serializer_class = PostOfficeSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["region"]
    search_fields = ["name", "region__name", "region__abbrev"]
    ordering_fields = ["name", "created_date"]
    ordering = ["name"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class LetteringViewSet(viewsets.ModelViewSet):
    """ViewSet for v2 lettering values."""
    queryset = Lettering.objects.all()
    serializer_class = LetteringSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["name", "created_date"]
    ordering = ["name"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class FramingViewSet(viewsets.ModelViewSet):
    """ViewSet for v2 framing values."""
    queryset = Framing.objects.all()
    serializer_class = FramingSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "code"]
    ordering_fields = ["name", "code", "created_date"]
    ordering = ["name"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class ShapeViewSet(viewsets.ModelViewSet):
    """ViewSet for v2 shape values."""
    queryset = Shape.objects.all()
    serializer_class = ShapeSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "code"]
    ordering_fields = ["name", "code", "created_date"]
    ordering = ["name"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class CoverV2ViewSet(viewsets.ModelViewSet):
    """ViewSet for v2 covers."""
    queryset = Cover.objects.all().select_related("color")
    serializer_class = CoverSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["color", "type", "has_adhesive", "is_institutional"]
    ordering_fields = ["id", "code", "created_date"]
    ordering = ["id"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class DateObservedViewSet(viewsets.ModelViewSet):
    """ViewSet for v2 postmark observed dates."""
    queryset = DateObserved.objects.all().select_related("postmark")
    serializer_class = DateObservedSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["postmark", "granularity"]
    ordering_fields = ["date", "created_date"]
    ordering = ["postmark", "date"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class RatemarkViewSet(viewsets.ModelViewSet):
    """ViewSet for v2 ratemarks."""
    queryset = Ratemark.objects.all().select_related("shape", "lettering", "color")
    serializer_class = RatemarkSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["is_manuscript", "shape", "lettering", "color", "impression", "is_irreg"]
    search_fields = ["inscription_txt"]
    ordering_fields = ["id", "created_date"]
    ordering = ["id"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class AuxmarkViewSet(viewsets.ModelViewSet):
    """ViewSet for v2 auxiliary marks."""
    queryset = Auxmark.objects.all().select_related("shape", "lettering", "color")
    serializer_class = AuxmarkSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["parent_mark_type", "parent_mark_id", "is_manuscript", "shape", "lettering", "color"]
    search_fields = ["inscription_text"]
    ordering_fields = ["parent_mark_type", "parent_mark_id", "created_date"]
    ordering = ["parent_mark_type", "parent_mark_id"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class CoverPostmarkV2ViewSet(viewsets.ModelViewSet):
    """ViewSet for v2 cover-postmark links."""
    queryset = CoverPostmark.objects.all().select_related("cover", "postmark")
    serializer_class = CoverPostmarkSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["cover", "postmark", "is_backstamp"]
    ordering_fields = ["id", "created_date"]
    ordering = ["id"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class PostmarkRatemarkViewSet(viewsets.ModelViewSet):
    """ViewSet for v2 postmark-ratemark links."""
    queryset = PostmarkRatemark.objects.all().select_related("postmark", "ratemark")
    serializer_class = PostmarkRatemarkSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["postmark", "ratemark", "placement_type"]
    ordering_fields = ["id", "created_date"]
    ordering = ["id"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class MarkFramingViewSet(viewsets.ModelViewSet):
    """ViewSet for v2 mark-framing links."""
    queryset = MarkFraming.objects.all().select_related("framing")
    serializer_class = MarkFramingSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["parent_mark_type", "parent_mark_id", "framing"]
    ordering_fields = ["id", "framing_pos", "created_date"]
    ordering = ["parent_mark_type", "parent_mark_id"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class ReferenceWorkViewSet(viewsets.ModelViewSet):
    """ViewSet for v2 reference works."""
    queryset = ReferenceWork.objects.all()
    serializer_class = ReferenceWorkSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["publication_year"]
    search_fields = ["title", "authorship", "publisher", "edition", "volume", "isbn"]
    ordering_fields = ["title", "publication_year", "created_date"]
    ordering = ["title"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class CitationViewSet(viewsets.ModelViewSet):
    """ViewSet for v2 citations."""
    queryset = Citation.objects.all().select_related("reference_work")
    serializer_class = CitationSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["reference_work", "subject_type", "subject_id"]
    search_fields = ["citation_detail", "reference_work__title"]
    ordering_fields = ["reference_work", "subject_type", "subject_id", "created_date"]
    ordering = ["reference_work", "subject_type", "subject_id"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class PostmarkV2ViewSet(viewsets.ModelViewSet):
    """Canonical v2 postmark CRUD based on PostmarkV2 model."""
    queryset = PostmarkV2.objects.all().select_related(
        "postmark", "post_office", "shape", "lettering", "color", "date_format"
    )
    serializer_class = PostmarkV2Serializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        "postmark", "post_office", "shape", "lettering", "color", "is_manuscript",
        "impression", "is_irreg", "date_type", "date_fmt", "visibility",
        "contribution_approval_status",
    ]
    search_fields = ["code", "postmark_key", "inscription_txt", "catalog_txt"]
    ordering_fields = ["id", "postmark_key", "code", "created_date"]
    ordering = ["id"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class PostalFacilityViewSet(viewsets.ModelViewSet):
    """
    ViewSet for postal facilities (stable containers)
    """
    queryset = PostalFacility.objects.all().select_related(
        'created_by', 'modified_by'
    ).prefetch_related('identities')
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
    """Optimized queryset for postmark list: prefetches only data needed by PostmarkListSerializer.
    Minimal select_related/prefetch reduces JOINs and speeds up pagination count on 50k+ rows.
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
        'postal_facility_identity__postal_facility',
        'postmark_shape',
        'state',
        'v2_data__lettering',
        'v2_data__shape',
        'v2_data__post_office__region',
        'v2_data__color',
    ).prefetch_related(
        'postmark_colors__color', 'dates_seen', 'dates_observed', 'valuations', 'images',
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

        # Detail actions should be able to see the full catalog, including
        # pending user-contribution records. Permissions (IsResponsibleForRegion)
        # still apply for write operations.
        if getattr(self, "action", None) in {
            "retrieve",
            "update",
            "partial_update",
            "destroy",
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
    # Search across both legacy and V2-backed display fields used in catalog cards.
    # This keeps list-search behavior aligned with record-detail values.
    search_fields = [
        'postmark_key',
        'v2_data__postmark_key',
        'v2_data__post_office__name',
        'postal_facility_identity__facility_name',
        'inscription_txt',
        'v2_data__inscription_txt',
        'catalog_txt',
        'v2_data__catalog_txt',
        'v2_data__shape__name',
        'postmark_shape__shape_name',
        'v2_data__lettering__name',
        'lettering_style__lettering_style_name',
        'v2_data__color__color_name',
        'postmark_colors__color__color_name',
    ]
    ordering_fields = ['postmark_key', 'created_date', 'rate_value']
    ordering = ['-created_date']  # Newest first for catalog search list
    
    def get_serializer_class(self):
        if self.action == 'list':
            return PostmarkListSerializer
        return PostmarkSerializer
    
    @action(detail=False, methods=['get'], url_path='my-assigned', permission_classes=[IsAuthenticated])
    def my_assigned(self, request):
        """
        Get catalog listings for all states assigned to the current user.
        Uses UserLocationAssignment-based helpers rather than group responsibilities
        and matches listings either by their direct state pointer or by the
        jurisdiction of their postal facility.
        """
        user = request.user
        assigned_units = _get_user_assigned_units(user)
        if not assigned_units.exists():
            # Still return a paginated response structure for consistency
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
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='my-dashboard', permission_classes=[IsAuthenticated])
    def my_dashboard(self, request):
        """
        Dashboard view showing catalog entries created from the current user's
        Contributor Dashboard submissions.

        Behavior is the same for Contributors and State Editors:
        - Only Postmarks with source_catalog='User contribution'
        - And other_characteristics containing "Submitted by: <username/email>"
        - Any state, any approval status.
        """
        user = request.user
        username = (getattr(user, "username", "") or "").strip()
        email = (getattr(user, "email", "") or "").strip()
        needles = []
        if username:
            needles.append(f"Submitted by: {username}")
        if email and email != username:
            needles.append(f"Submitted by: {email}")

        needle_q = Q()
        for needle in needles:
            needle_q |= Q(other_characteristics__icontains=needle)

        base_qs = _postmark_list_queryset()

        qs = base_qs.filter(
            source_catalog="User contribution",
        )
        if needles:
            qs = qs.filter(needle_q)

        qs = qs.distinct().order_by('-created_date')

        # Apply standard filters (state, town, color, etc.) and ordering if query params are present
        qs = self.filter_queryset(qs)

        page = self.paginate_queryset(qs)
        serializer_class = PostmarkListSerializer
        if page is not None:
            serializer = serializer_class(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = serializer_class(qs, many=True)
        return Response(serializer.data)
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def my_region(self, request):
        """Get postmarks from regions the user's groups are responsible for"""
        user_groups = request.user.groups.all()
        
        # Get administrative units user's groups are responsible for
        responsibilities = AdministrativeUnitResponsibility.objects.filter(
            group__in=user_groups,
            is_active=True
        )
        responsible_units = [resp.administrative_unit for resp in responsibilities]
        
        # Get current affiliations for these units
        affiliations = JurisdictionalAffiliation.objects.filter(
            administrative_unit__in=responsible_units,
            effective_to_date__isnull=True
        ).select_related('postal_facility_identity')
        
        # Get postmarks from these facility identities
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
        
        # Get all identities for this facility
        identities = PostalFacilityIdentity.objects.filter(postal_facility_id=facility_id)
        postmarks = self.get_queryset().filter(postal_facility_identity__in=identities)
        serializer = self.get_serializer(postmarks, many=True)
        return Response(serializer.data)

    # Catalog action commented out: keep only list + pagination (PageSizePagination in settings)
    # @action(detail=False, methods=['get'], url_path='catalog')
    # def catalog(self, request): ...


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
