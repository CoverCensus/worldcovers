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
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from django.conf import settings
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import send_mail
from django.db.models import Q, Count, Prefetch, Min, Max, Subquery, OuterRef, IntegerField
from django.db.models.functions import Coalesce
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

_YEAR_RE = re.compile(r"^\d{4}$")
_CITATION_PAGE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9\s\-–—.,:;()/#]*$")


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
    subject_id = postmark.pk
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
    AdministrativeUnit, AdministrativeUnitIdentity, AdministrativeUnitResponsibility,
    Color,
    Postmark, PostmarkValuation,
    PostmarkImage, Postcover, PostcoverPostmark, PostcoverImage,
    AdminCsvUpload, UserLocationAssignment, Contribution, FAQEntry,
)

from .serializers import (
    RegionSerializer, PostOfficeSerializer, LetteringSerializer, FramingSerializer,
    ShapeSerializer, CoverSerializer, DateObservedSerializer, RatemarkSerializer,
    AuxmarkSerializer, CoverPostmarkSerializer, PostmarkRatemarkSerializer,
    MarkFramingSerializer, ReferenceWorkSerializer, CitationSerializer,
    AdministrativeUnitSerializer,
    AdministrativeUnitListSerializer, AdministrativeUnitIdentitySerializer,
    AdministrativeUnitResponsibilitySerializer,
    ColorSerializer, PostmarkSerializer,
    PostmarkListSerializer, PostmarkValuationSerializer, PostmarkImageSerializer,
    PostcoverSerializer, PostcoverListSerializer, PostcoverPostmarkSerializer,
    PostcoverImageSerializer,
    AdminCsvUploadListSerializer, AdminCsvUploadSerializer,
    LoginRequestSerializer,
    ContributionListSerializer, ContributionDetailSerializer, ContributionApproveRejectSerializer,
    FAQEntrySerializer,
)
from common.filters import PostmarkListFilter
from common.csv_import import IMPORTERS
from common.contribution_apply import _extract_mark_entries, _update_postmark_in_catalog


_password_reset_token_generator = PasswordResetTokenGenerator()


def _assigned_locations_payload(user):
    """Return the list of regions assigned to a State Editor for the auth payload."""
    from common.models import Region  # local import to avoid circular concerns
    if not user or not user.is_authenticated:
        return []
    # Inline the role check to avoid forward-reference issues.
    if not user.groups.filter(name__iexact="State Editors").exists():
        return []
    return [
        {"name": r.name, "reference_code": r.abbrev}
        for r in Region.objects.filter(
            user_location_assignments__user=user
        ).distinct().order_by('name')
    ]


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
                "assigned_locations": _assigned_locations_payload(user),
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
                "assigned_locations": _assigned_locations_payload(user),
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
            regions = _get_user_assigned_regions(user)
        else:
            # Contributors can submit to any current state-tier region
            regions = Region.objects.filter(
                region_tier='STATE',
                defunct_date__isnull=True,
            )
        seen = set()
        items = []
        for region in regions:
            name = (region.name or "").strip()
            if not name or name in seen:
                continue
            seen.add(name)
            items.append({
                "value": name,
                "label": name,
                "abbreviation": (region.abbrev or "").strip(),
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
        from django.db.models.functions import ExtractYear
        agg = DateObserved.objects.aggregate(
            earliest_year=Min(ExtractYear("date")),
            latest_year=Max(ExtractYear("date")),
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


def _save_contribution_image(uploaded_file):
    """
    Save uploaded image to media/postmarks/contributions/ and return metadata for PostmarkImage.
    Returns dict with storage_filename, original_filename, file_checksum, mime_type,
    image_width, image_height, file_size_bytes, or None if invalid/failed.
    """
    from common.images import extract_image_metadata

    if not uploaded_file or not getattr(uploaded_file, "read", None):
        return None
    content_type = getattr(uploaded_file, "content_type", "") or ""
    max_size_bytes = 100 * 1024 * 1024  # 100 MB
    uploaded_file.seek(0)
    content = uploaded_file.read()
    if len(content) > max_size_bytes:
        return None
    uploaded_file.seek(0)
    metadata = extract_image_metadata(content, content_type)
    if metadata is None:
        return None
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
    return {
        "storage_filename": storage_name,
        "original_filename": getattr(uploaded_file, "name", "image")[:255] or "image",
        **metadata,
    }


def _get_user_assigned_regions(user):
    """Return queryset of Regions explicitly assigned to this user."""
    return Region.objects.filter(
        user_location_assignments__user=user
    ).distinct()


def _get_allowed_state_strings(user):
    """Return (allowed_strings_set, assigned_regions_queryset)."""
    regions = _get_user_assigned_regions(user)
    allowed = set()
    if not regions.exists():
        return allowed, regions
    for region in regions:
        name = (region.name or "").strip()
        abv = (region.abbrev or "").strip()
        if name:
            allowed.add(name.lower())
        if abv:
            allowed.add(abv.lower())
    return allowed, regions


def _resolve_assigned_region(user, state_str):
    """Match a state string to one of the user's assigned Regions."""
    state_norm = (state_str or "").strip().lower()
    if not state_norm:
        return None
    regions = _get_user_assigned_regions(user)
    for region in regions:
        name = (region.name or "").strip().lower()
        abv = (region.abbrev or "").strip().lower()
        if state_norm == name or state_norm == abv:
            return region
    return None


def _resolve_region_from_state_value(state_str):
    """Resolve a submitted state string to a Region row when possible."""
    state_norm = (state_str or "").strip()
    if not state_norm:
        return None
    return (
        Region.objects.filter(
            Q(name__iexact=state_norm) | Q(abbrev__iexact=state_norm)
        )
        .order_by("region_tier", "name")
        .first()
    )


def _resolve_assigned_region_from_submitted_data(user, submitted_data):
    """Resolve assigned Region from contribution submitted_data payload."""
    sd = submitted_data or {}
    assigned_regions = _get_user_assigned_regions(user)
    if not assigned_regions.exists():
        return None

    state_region_id = sd.get("state_region_id")
    try:
        state_region_id_int = int(state_region_id)
    except (TypeError, ValueError):
        state_region_id_int = None

    if state_region_id_int is not None:
        matched = assigned_regions.filter(pk=state_region_id_int).first()
        if matched:
            return matched

    state_str = (sd.get("state") or "").strip()
    return _resolve_assigned_region(user, state_str)


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
            "state_region_id": payload.get("state_region_id"),
            "town": (payload.get("town") or "").strip(),
            "date_range": (payload.get("date_range") or "").strip(),
            "shape": (payload.get("shape") or payload.get("type") or "").strip(),
            "color": (payload.get("color") or "").strip(),
            "manuscript": (payload.get("manuscript") or "").strip(),
            "dimensions": (payload.get("dimensions") or "").strip(),
            "inscription_txt": (payload.get("inscription_txt") or "").strip(),
            "references": (payload.get("references") or "").strip(),
            "reference_work_ids": _extract_reference_work_ids_from_payload(payload),
            "reference_work_details": _extract_reference_work_details_from_payload(payload),
            "rarity": (payload.get("rarity") or "").strip(),
            "submitter_name": (payload.get("submitter_name") or "").strip(),
            "original_postmark_id": str(payload.get("original_postmark_id", "")),
            "ratemarks": payload.get("ratemarks", []),
            "auxmarks": payload.get("auxmarks", []),
        }
        if payload.get("contributor_comment"):
            submitted_data["contributor_comment"] = (payload.get("contributor_comment") or "").strip()
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


def _get_editor_contribution_queryset(user):
    """Base queryset for editor contribution/history listing."""
    base_qs = Contribution.objects.select_related("contributor", "reviewer", "postmark")
    if getattr(user, "is_superuser", False):
        return base_qs
    assigned_regions = list(_get_user_assigned_regions(user))
    state_match_q = Q()
    for region in assigned_regions:
        state_match_q |= Q(submitted_data__state_region_id=region.pk)
        for candidate in ((region.name or "").strip(), (region.abbrev or "").strip()):
            if candidate:
                state_match_q |= Q(submitted_data__state__iexact=candidate)
    if assigned_regions and state_match_q:
        return base_qs.filter(Q(contributor=user) | state_match_q).distinct()
    return base_qs.filter(contributor=user).distinct()


def _apply_state_filter_to_contributions(qs, state_value):
    """Apply optional state filter against both state text and region id."""
    state_norm = (state_value or "").strip()
    if not state_norm or state_norm.lower() == "all":
        return qs
    state_region = _resolve_region_from_state_value(state_norm)
    state_q = Q(submitted_data__state__iexact=state_norm)
    if state_region is not None:
        state_q |= Q(submitted_data__state_region_id=state_region.pk)
        region_name = (state_region.name or "").strip()
        region_abbrev = (state_region.abbrev or "").strip()
        if region_name:
            state_q |= Q(submitted_data__state__iexact=region_name)
        if region_abbrev:
            state_q |= Q(submitted_data__state__iexact=region_abbrev)
    return qs.filter(state_q)


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
        """List contributions for current user or editor moderation/history mode."""
        mode = (request.query_params.get("mode") or "").strip().lower()
        status_filter = (request.query_params.get("status") or "").strip().lower()
        state_filter = (request.query_params.get("state") or "").strip()

        if mode == "editor":
            qs = _get_editor_contribution_queryset(request.user).order_by("-created_at")
            if status_filter in {
                Contribution.STATUS_PENDING,
                Contribution.STATUS_APPROVED,
                Contribution.STATUS_REJECTED,
                Contribution.STATUS_NEEDS_REVISION,
            }:
                qs = qs.filter(status=status_filter)
            qs = _apply_state_filter_to_contributions(qs, state_filter)

            try:
                page = max(1, int(request.query_params.get("page", 1)))
            except (TypeError, ValueError):
                page = 1
            try:
                page_size = int(request.query_params.get("page_size", 10))
            except (TypeError, ValueError):
                page_size = 10
            page_size = max(1, min(page_size, 100))
            total = qs.count()
            start = (page - 1) * page_size
            end = start + page_size
            page_items = qs[start:end]
            serializer = ContributionListSerializer(page_items, many=True)
            return Response(
                {
                    "count": total,
                    "page": page,
                    "page_size": page_size,
                    "results": serializer.data,
                }
            )

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
        shape_val = (data.get("shape") or data.get("type") or "").strip()
        color = (data.get("color") or "").strip()
        manuscript = (data.get("manuscript") or "").strip()
        if not state or not town or not manuscript:
            return Response(
                {"detail": "Missing required fields: state, town, manuscript."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        is_manuscript = manuscript.lower() == "yes"
        if not is_manuscript and not shape_val:
            return Response(
                {"detail": "Shape is required when Manuscript is No."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if is_manuscript and shape_val:
            return Response(
                {"detail": "Shape must be empty when Manuscript is Yes."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = request.user
        if not user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

        # New submissions:
        # - Contributors can submit to any state (no location restriction).
        # - State Editors must be explicitly assigned to the chosen state.
        if edit_postmark_id is None and edit_contribution_id is None:
            role = _get_user_role(user)
            if role == "state_editor" and not getattr(user, "is_superuser", False):
                if _resolve_assigned_region(user, state) is None:
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
        contributor_comment = (
            data.get("contributor_comment")
            or data.get("contributorComment")
            or data.get("comment_for_editor")
            or data.get("commentForEditor")
            or ""
        )
        contributor_comment = str(contributor_comment).strip()
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
            "state_region_id": None,
            "town": town,
            "date_range": date_range,
            "first_seen": first_seen,
            "last_seen": last_seen,
            "shape": shape_val,
            "color": color,
            "manuscript": manuscript,
            "dimensions": (data.get("dimensions") or "").strip(),
            "inscription_txt": (data.get("inscription_txt") or data.get("inscriptionText") or "").strip(),
            "references": (data.get("references") or "").strip(),
            "reference_work_ids": reference_work_ids,
            "reference_work_details": reference_work_details,
            "rarity": (data.get("rarity") or "").strip(),
            "submitter_name": submitter_name,
            "ratemarks": ratemarks,
            "auxmarks": auxmarks,
        }
        if contributor_comment:
            payload["contributor_comment"] = contributor_comment
        matched_state_region = _resolve_region_from_state_value(state)
        if matched_state_region is not None:
            payload["state_region_id"] = matched_state_region.pk
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
                try:
                    submitted_data = {
                        "state": payload.get("state", ""),
                        "state_region_id": payload.get("state_region_id"),
                        "town": payload.get("town", ""),
                        "date_range": payload.get("date_range", ""),
                        "shape": payload.get("shape") or payload.get("type", ""),
                        "color": payload.get("color", ""),
                        "manuscript": payload.get("manuscript", ""),
                        "dimensions": payload.get("dimensions", ""),
                        "inscription_txt": payload.get("inscription_txt", ""),
                        "references": payload.get("references", ""),
                        "reference_work_ids": payload.get("reference_work_ids", []),
                        "reference_work_details": payload.get("reference_work_details", {}),
                        "ratemarks": payload.get("ratemarks", []),
                        "auxmarks": payload.get("auxmarks", []),
                        "rarity": payload.get("rarity", ""),
                        "submitter_name": submitter_name,
                        "original_postmark_id": str(edit_postmark_id),
                    }
                    if payload.get("contributor_comment"):
                        submitted_data["contributor_comment"] = (payload.get("contributor_comment") or "").strip()
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
    return _resolve_assigned_region_from_submitted_data(user, contrib.submitted_data) is not None


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
            return _get_editor_contribution_queryset(user)
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
        postmark = contrib.apply_to_catalog()
        if not postmark:
            return Response(
                {"detail": "Could not apply contribution to catalog. Check submitted_data."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        contrib.status = Contribution.STATUS_APPROVED
        contrib.reviewer = request.user
        contrib.review_notes = review_notes
        contrib.save(update_fields=["status", "reviewer", "review_notes", "postmark", "updated_at"])
        _sync_postmark_citations_from_payload(postmark, contrib.submitted_data or {}, request.user)
        return Response(
            {"detail": "Contribution approved.", "postmarkId": postmark.pk},
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


def _user_is_responsible_for_postmark(user, postmark):
    """True if user is assigned to the Region of this postmark's post office."""
    if not user or not user.is_authenticated:
        return False
    if getattr(user, "is_superuser", False):
        return True
    po = getattr(postmark, "post_office", None)
    region_id = getattr(po, "region_id", None) if po else None
    if not region_id:
        return False
    return _get_user_assigned_regions(user).filter(pk=region_id).exists()


class IsResponsibleForRegion(BasePermission):
    """
    Permission check: User must be assigned to the postmark's region.
    Exception: the contribution's original submitter may edit/delete their own submission.
    """
    def has_object_permission(self, request, view, obj):
        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            return True

        if isinstance(obj, Postmark):
            # Allow original contributor to manage their own submission
            try:
                if obj.contribution and obj.contribution.contributor == request.user:
                    return True
            except Exception:
                pass
            return _user_is_responsible_for_postmark(request.user, obj)

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

        postmark = Postmark.objects.filter(pk=postmark_id).first()
        if not postmark:
            return Response({"detail": "Catalog entry not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user

        # 1. Superusers can always delete
        if getattr(user, "is_superuser", False):
            postmark.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # 2. Users assigned to this postmark's region can delete any listing in that region
        try:
            region_id = postmark.post_office.region_id if postmark.post_office else None
        except Exception:
            region_id = None
        if region_id and _get_user_assigned_regions(user).filter(pk=region_id).exists():
            postmark.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # 3. Original contributor of this Postmark can delete their own submission
        try:
            is_own_contribution = (postmark.contribution.contributor == user)
        except Exception:
            is_own_contribution = False

        if not is_own_contribution:
            return Response(
                {"detail": "You can only delete catalog entries that you originally submitted."},
                status=status.HTTP_403_FORBIDDEN,
            )

        postmark.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ========== GEOGRAPHIC HIERARCHY VIEWSETS ==========

class RegionViewSet(viewsets.ModelViewSet):
    """ViewSet for v2 regions. Supports ?assigned_only=true to restrict
    State Editors to their assigned regions (used by Contribute, Dashboard)."""
    queryset = Region.objects.all().select_related("parent_region")
    serializer_class = RegionSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["region_tier", "parent_region"]
    search_fields = ["name", "abbrev"]
    ordering_fields = ["name", "abbrev", "established_date", "defunct_date", "created_date"]
    ordering = ["name"]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('assigned_only', '').lower() != 'true':
            return qs
        user = self.request.user
        if not user or not user.is_authenticated:
            return qs.none()
        if _get_user_role(user) == "state_editor":
            return qs.filter(user_location_assignments__user=user).distinct()
        # Contributors (and others) see all regions when assigned_only=true
        return qs

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if request.query_params.get('assigned_only', '').lower() == 'true':
            response['Cache-Control'] = 'no-store, private, max-age=0'
        return response

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
    search_fields = ["inscription_txt"]
    ordering_fields = ["parent_mark_type", "parent_mark_id", "created_date"]
    ordering = ["parent_mark_type", "parent_mark_id"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class CoverPostmarkViewSet(viewsets.ModelViewSet):
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
    queryset = PostmarkRatemark.objects.all().select_related(
        "postmark", "ratemark", "ratemark__shape", "ratemark__lettering", "ratemark__color"
    ).annotate(
        auxmark_count=Coalesce(
            Subquery(
                Auxmark.objects.filter(
                    parent_mark_type='RATEMARK',
                    parent_mark_id=OuterRef('ratemark_id'),
                )
                .values('parent_mark_id')
                .annotate(c=Count('*'))
                .values('c')[:1],
                output_field=IntegerField(),
            ),
            0,
        )
    )
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


# ========== PHYSICAL CHARACTERISTICS VIEWSETS ==========

class ColorViewSet(viewsets.ModelViewSet):
    """ViewSet for colors"""
    queryset = Color.objects.all()
    serializer_class = ColorSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering = ['name']


# ========== POSTMARK VIEWSETS ==========

def _postmark_list_queryset():
    """Optimized queryset for postmark list: prefetches only data needed by PostmarkListSerializer."""
    return Postmark.objects.all().select_related(
        'post_office__region',
        'shape',
        'lettering',
        'color',
    ).prefetch_related(
        'dates_observed',
        'valuations',
        'images',
    ).annotate(
        earliest_date_observed=Min('dates_observed__date'),
        latest_date_observed=Max('dates_observed__date'),
        ratemark_count=Count('postmark_ratemarks', distinct=True),
        auxmark_count=Coalesce(
            Subquery(
                Auxmark.objects.filter(
                    parent_mark_type='POSTMARK',
                    parent_mark_id=OuterRef('postmark_id'),
                )
                .values('parent_mark_id')
                .annotate(c=Count('*'))
                .values('c')[:1],
                output_field=IntegerField(),
            ),
            0,
        ),
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

        # List-style actions: only expose postmarks that are either not linked to a
        # Contribution (catalog entries) or have an approved Contribution.
        return base_qs.filter(
            Q(contribution__isnull=True)
            | Q(contribution__status=Contribution.STATUS_APPROVED)
        )
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = PostmarkListFilter
    # Search across both legacy and V2-backed display fields used in catalog cards.
    # This keeps list-search behavior aligned with record-detail values.
    search_fields = [
        'code',
        'catalog_txt',
        'post_office__region__name',
        'post_office__name',
        'shape__name',
        'lettering__name',
        'color__name',
    ]
    ordering_fields = ['code', 'created_date', 'earliest_date_observed', 'latest_date_observed']
    ordering = ['post_office__region__name', 'post_office__name', 'earliest_date_observed', 'postmark_id']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return PostmarkListSerializer
        return PostmarkSerializer
    
    @action(detail=False, methods=['get'], url_path='my-assigned', permission_classes=[IsAuthenticated])
    def my_assigned(self, request):
        """
        Get catalog listings for all regions assigned to the current user.
        """
        user = request.user
        assigned_regions = _get_user_assigned_regions(user)
        if not assigned_regions.exists():
            # Still return a paginated response structure for consistency
            empty_qs = self.get_queryset().none()
            page = self.paginate_queryset(empty_qs)
            if page is not None:
                serializer = self.get_serializer(page, many=True)
                return self.get_paginated_response(serializer.data)
            serializer = self.get_serializer(empty_qs, many=True)
            return Response(serializer.data)
        qs = self.get_queryset().filter(
            post_office__region__in=assigned_regions
        ).distinct().order_by('-created_date')
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='my-dashboard', permission_classes=[IsAuthenticated])
    def my_dashboard(self, request):
        """Dashboard: catalog entries linked to the current user's Contributions."""
        user = request.user
        base_qs = _postmark_list_queryset()
        qs = base_qs.filter(contribution__contributor=user).distinct().order_by('-created_date')
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
    
    @action(detail=False, methods=['get'], url_path='my-submissions', permission_classes=[IsAuthenticated])
    def my_submissions(self, request):
        """Get catalog entries linked to the current user's Contributions."""
        user = request.user
        qs = self.get_queryset().filter(contribution__contributor=user).order_by('-created_date')
        if not getattr(user, "is_superuser", False):
            assigned_regions = _get_user_assigned_regions(user)
            if assigned_regions.exists():
                qs = qs.filter(post_office__region__in=assigned_regions)
            else:
                qs = qs.none()
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
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
        if not _user_is_responsible_for_postmark(request.user, image.postmark):
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
        if not _user_is_responsible_for_postmark(request.user, image.postmark):
            return Response(
                {'error': 'You are not responsible for this region'},
                status=status.HTTP_403_FORBIDDEN
            )
        image.save()
        return Response({'status': 'image rejected'})


class PostmarkValuationViewSet(viewsets.ModelViewSet):
    """ViewSet for postmark valuations"""
    queryset = PostmarkValuation.objects.all().select_related(
        'postmark', 'created_by', 'modified_by'
    )
    serializer_class = PostmarkValuationSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['postmark']
    ordering_fields = ['appraisal_date', 'amt']
    ordering = ['-appraisal_date']


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


class HelpDocsView(APIView):
    """
    Serve markdown files from docs/ for the Help page.
    Files under docs/devel/ are excluded (internal-only convention).
    Returns raw markdown so the SPA can render it as HTML.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        docs_dir = Path(settings.REPO_ROOT) / "docs"
        items = []
        if not docs_dir.exists():
            return Response({"results": items})

        devel_dir = docs_dir / "devel"
        for md_file in sorted(
            docs_dir.rglob("*.md"),
            key=lambda p: str(p.relative_to(docs_dir)).lower(),
        ):
            try:
                if md_file.is_relative_to(devel_dir):
                    continue
            except ValueError:
                pass

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

###################################################################################################
