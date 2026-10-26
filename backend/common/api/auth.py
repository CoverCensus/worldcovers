"""Session-based auth views shared by the SPA: /api/login, /api/logout, and the SPA session check."""
from __future__ import annotations

import logging

from django.conf import settings
from django.contrib.auth import login, logout, get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from allauth.account.adapter import get_adapter
from allauth.core import ratelimit
from django.utils.html import escape
from django.contrib.auth.hashers import UNUSABLE_PASSWORD_PREFIX
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import send_mail
from django.urls import reverse
from django.utils.decorators import method_decorator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import csrf_protect, csrf_exempt, ensure_csrf_cookie

from rest_framework import serializers, status
from rest_framework.exceptions import ParseError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api.v2.permissions import IsSuperuser

from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer


from common.account_access import email_allows_login, has_legacy_access, resolve_login_identifier
from common.account_backend import check_account_password
from common.passwords import validate_password_strength as _validate_password_strength


logger = logging.getLogger(__name__)

_password_reset_token_generator = PasswordResetTokenGenerator()


def _account_fields(data: object, *names: str) -> dict[str, str]:
    if not isinstance(data, dict):
        raise ParseError("A JSON object is required.")
    values = {}
    for name in names:
        value = data.get(name, "")
        if not isinstance(value, str) or len(value) > 4096:
            raise ParseError(f"{name} must be text of at most 4096 characters.")
        values[name] = value
    return values


def _rate_limit(request, action: str, *, key=None):
    if ratelimit.consume(request, action=action, key=key):
        return None
    request._request.auth_outcome = "rate_limited"
    return Response({"detail": "Too many attempts. Please wait before trying again."}, status=429)


def _get_user_role(user):
    if getattr(user, "is_superuser", False):
        return "administrator"
    if user.groups.filter(name__iexact="Editors").exists():
        return "editor"
    return "contributor"


def _get_user_assigned_collections(user):
    """Collections this editor is assigned to, with region loaded for the SPA."""
    from common.models import Collection
    return (
        Collection.objects.filter(editor_assignments__user=user)
        .select_related("region")
        .distinct()
        .order_by("name")
    )


def _support_email():
    """Address to send a blocked user to. LOGIN_REQUEST_ADMIN_EMAIL is optional."""
    return getattr(settings, "LOGIN_REQUEST_ADMIN_EMAIL", "") or "info@worldcovers.org"


_resolve_login_identifier = resolve_login_identifier


def _account_state_response(account, password_setup_flow=False):
    """403 explaining why this account cannot sign in, or None if nothing blocks it.

    Pass password_setup_flow=True from forgot-password / reset-password. Those
    flows must NOT block an active account that simply has no password yet --
    setting one is exactly what they are for, and the message below tells the
    user to go there. Blocking it would send them in a circle.

    Shared by login, forgot-password and reset-password so that a user who
    disbelieves one endpoint and tries another reads the SAME sentence rather
    than two different stories. That repetition is the point: issue #150 was
    reported as a password failure precisely because every endpoint described
    the problem differently.

    NOTE: Do NOT gate these messages on a correct password ("only tell them if
    they'd otherwise have logged in"). It is the natural review suggestion and
    it is a null fix here: legacy requests used set_unusable_password(), so
    check_password() returns False for every possible input and 100% of pending
    users would still get "Invalid credentials." That ships the bug unchanged
    while looking like a fix.

    Legacy account-state messages disclose blocked accounts so applicants
    with unusable passwords can get help. New signup uses allauth's
    duplicate-account privacy handling.
    """
    if not account.is_active:
        # last_login, NOT has_usable_password(), is the discriminator. A user
        # who already walked the issue #150 loop completed a password reset, so
        # they are inactive WITH a usable password -- keying on the password
        # would hand that exact person the "deactivated" copy, which is a
        # second wrong answer to the same member. login() is the only writer of
        # last_login, and they have never reached it.
        if account.last_login is None and has_legacy_access(account):
            return Response(
                {
                    "detail": (
                        "This account is waiting for approval, so it cannot sign in yet. "
                        "This is not a password problem - resetting your password will not "
                        f"change it. Email {_support_email()} if you would like it looked at."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(
            {
                "detail": (
                    "This account has been deactivated and cannot sign in. "
                    f"Email {_support_email()} to have access restored."
                )
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    if not account.has_usable_password() and not password_setup_flow:
        # Activated by hand without a password being set -- the admin checkbox
        # flips is_active and nothing else, while signals.py mails the user
        # "you can now sign in". Forgot Password genuinely works for them
        # (they are active, so the block below does not apply), but prod mail
        # is currently dead, hence both halves of the instruction.
        return Response(
            {
                "detail": (
                    "This account does not have a password set yet. Use 'Forgot password' "
                    f"to set one. If no email arrives, contact {_support_email()}."
                )
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def _build_user_payload(user):
    role = _get_user_role(user)
    payload = {
        "id": user.pk,
        "username": user.username,
        "email": getattr(user, "email", "") or "",
        "is_staff": getattr(user, "is_staff", False),
        "is_superuser": getattr(user, "is_superuser", False),
        "role": role,
    }
    if role == "editor":
        collections = _get_user_assigned_collections(user)
        payload["assigned_collections"] = [
            {
                "id": c.pk,
                "name": c.name,
                "region": {
                    "id": c.region_id,
                    "name": c.region.name if c.region_id else "",
                    "abbrev": c.region.abbrev if c.region_id else "",
                },
            }
            for c in collections
        ]
    return payload


@extend_schema(
    request=inline_serializer(
        name="LoginRequest",
        fields={
            "username": serializers.CharField(required=False, help_text="Username or email"),
            "email": serializers.CharField(required=False),
            "password": serializers.CharField(),
        },
    ),
    responses={
        200: inline_serializer(
            name="LoginResponse",
            fields={
                "user": serializers.JSONField(help_text="See CurrentUserResponse.user shape"),
            },
        ),
        400: OpenApiResponse(description="Username and password required"),
        401: OpenApiResponse(description="Invalid credentials, or no such account"),
        403: OpenApiResponse(
            description=(
                "The account exists but cannot sign in: awaiting approval, "
                "deactivated, or activated without a password being set."
            )
        ),
    },
)
@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    """Session login for the SPA. Accepts username or email + password."""
    permission_classes = [AllowAny]

    def post(self, request):
        values = _account_fields(request.data, "username", "email", "password")
        identifier = (values["username"] or values["email"]).strip()
        password = values["password"]
        if not identifier or not password:
            return Response({"detail": "Username and password required."}, status=400)
        limited = _rate_limit(request, "login")
        if limited is not None:
            return limited
        if request.user.is_authenticated:
            return Response({"detail": "You are already signed in. Sign out to switch accounts."}, status=409)
        try:
            user = get_adapter().authenticate(request._request, username=identifier, password=password)
        except DjangoValidationError:
            return Response({"detail": "Too many attempts. Please wait before trying again."}, status=429)
        if user is None:
            account = _resolve_login_identifier(identifier)
            if account is not None:
                blocked = _account_state_response(account)
                if blocked is not None:
                    return blocked
            return Response({"detail": "Invalid credentials."}, status=401)
        if not user.is_active:
            return _account_state_response(user)
        if not email_allows_login(user):
            return Response(
                {"detail": "Verify your email before signing in. Use the sign-in form to resend the link.",
                 "code": "email_verification_required"}, status=403,
            )
        login(request, user)
        return Response({"user": _build_user_payload(user)})


@extend_schema(
    request=None,
    responses={200: OpenApiResponse(description="Logged out")},
)
@method_decorator(csrf_exempt, name="dispatch")
class LogoutView(APIView):
    """Session logout, including an already expired session."""
    permission_classes = [AllowAny]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_200_OK)


@extend_schema(
    responses={
        200: inline_serializer(
            name="CurrentUserResponse",
            fields={
                "user": inline_serializer(
                    name="CurrentUserPayload",
                    fields={
                        "id": serializers.IntegerField(),
                        "username": serializers.CharField(),
                        "email": serializers.EmailField(),
                        "first_name": serializers.CharField(allow_blank=True),
                        "last_name": serializers.CharField(allow_blank=True),
                        "role": serializers.CharField(),
                    },
                ),
            },
        ),
        401: OpenApiResponse(description="Not authenticated"),
    }
)
@method_decorator(ensure_csrf_cookie, name="dispatch")
class CurrentUserView(APIView):
    """
    Return current user payload when authenticated via session.

    `@ensure_csrf_cookie` makes this endpoint double as the SPA's CSRF
    cookie primer: the very first GET /me/ on a fresh session forces
    Django to set the `csrftoken` cookie even when the visitor is
    anonymous (response is 401 but the Set-Cookie header is still
    emitted). The SPA's axios client is configured with
    xsrfCookieName="csrftoken"/xsrfHeaderName="X-CSRFToken", so once the
    cookie exists every subsequent unsafe write (POST/PATCH/DELETE)
    automatically carries the token Django expects. Without this,
    SessionAuthentication 403s with "CSRF Failed: CSRF token missing".
    """
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            request._request.auth_outcome = "guest"
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        payload = {"user": _build_user_payload(request.user)}
        identifier = request.query_params.get("login_identifier")
        if identifier is not None:
            if len(identifier) > 4096:
                raise ParseError("Login identifier is too long.")
            account = resolve_login_identifier(identifier)
            payload["matches_login_identifier"] = account is not None and account.pk == request.user.pk
        return Response(payload)


@method_decorator(csrf_exempt, name="dispatch")
class LoginRequestView(APIView):
    """Retired manual-request endpoint for older clients."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        return Response(
            {"detail": "Please refresh the page and use Create account to sign up."},
            status=status.HTTP_410_GONE,
        )


class SiteInfoView(APIView):
    """
    GET /site/ -- which site this is (Trello T84).

    The SPA bundle is identical on woco.dev and hellowoco.app, so it cannot
    tell a visitor "this is the test site" without asking. The answer comes from
    settings (DJANGO_APP_HOSTNAME, WOCO_SITE_ROLE, WOCO_PRODUCTION_URL), all of
    which are already visible in the address bar or public, so this is open to
    anyone.
    """
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "hostname": settings.DJANGO_APP_HOSTNAME,
                "role": settings.WOCO_SITE_ROLE,
                "production_url": settings.WOCO_PRODUCTION_URL,
            }
        )


PENDING_LOGIN_REQUESTS_LIMIT = 200


class PendingLoginRequestsView(APIView):
    """
    GET /login-requests/pending/ -- login requests nobody has acted on (Trello T84).

    A login request is what LoginRequestView creates: an inactive User with no
    usable password that has never signed in (issue #150). Approval is the
    Administrator ticking Active in Django admin. Nothing notified anyone of a
    new row, which is how eight requests on woco.dev went unnoticed. This lists
    them for the Dashboard. A deactivated member (inactive with a last_login) or
    an admin-created account that was never activated (usable password) is not
    a request and is left out.

    The public form has no throttle, so the list is capped at the newest
    PENDING_LOGIN_REQUESTS_LIMIT rows and the true total travels as "count";
    a flood cannot turn the Administrator's Dashboard into a multi-megabyte load.

    Superuser only: the rows carry names and email addresses. Relaxing this
    permission would hand that PII to a wider audience; do not.

    `admin_url` is a path, not an absolute URL: the SPA and Django admin are
    served from the same origin on both sites (nginx proxies /admin/ and /api/
    to the same backend), so a path is correct and does not depend on proxy
    headers. Revisit if the admin ever moves to another host.
    """
    permission_classes = [IsSuperuser]

    def get(self, request):
        User = get_user_model()
        pending = User.objects.filter(
            is_active=False,
            last_login__isnull=True,
            password__startswith=UNUSABLE_PASSWORD_PREFIX,
        ).order_by("-date_joined", "-pk")
        total = pending.count()
        rows = [
            {
                "id": user.pk,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": user.email,
                "requested_at": user.date_joined,
                "admin_url": reverse("admin:auth_user_change", args=[user.pk]),
            }
            for user in pending[:PENDING_LOGIN_REQUESTS_LIMIT]
        ]
        return Response({"count": total, "results": rows})


@method_decorator(csrf_protect, name="dispatch")
class ForgotPasswordApiView(APIView):
    """
    Public API to start a password reset.
    POST JSON: { "email": "<user email>" }
    Sends an email with a link to the SPA reset page.
    """
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        email = _account_fields(request.data, "email")["email"].strip().lower()
        if not email:
            return Response(
                {"detail": "Email is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        limited = _rate_limit(request, "reset_password", key=email)
        if limited is not None:
            return limited

        User = get_user_model()
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response(
                {"detail": "No account found for that email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        except User.MultipleObjectsReturned:
            return Response({"detail": "We cannot safely choose an account for this address. "
                             f"Please contact {_support_email()} for help."}, status=409)

        # Before minting anything. A reset cannot fix a blocked account, so
        # issuing a working link here is what closed the issue #150 loop: the
        # user reset their password, still could not sign in, and reasonably
        # concluded the password was the problem. Same sentence as /login/ --
        # sharing the helper is what stops the two endpoints drifting apart.
        blocked = _account_state_response(user, password_setup_flow=True)
        if blocked is not None:
            return blocked

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = _password_reset_token_generator.make_token(user)

        frontend_base = getattr(settings, "FRONTEND_BASE_URL", None) or f"https://{settings.DJANGO_APP_HOSTNAME}"
        if not frontend_base.startswith(("http://", "https://")):
            frontend_base = f"https://{frontend_base.lstrip('/')}"
        reset_link = f"{frontend_base.rstrip('/')}/reset-password?uid={uid}&token={token}"

        site_name = settings.SITE_NAME
        site_name_html = escape(site_name)
        subject = f"Reset password for your {site_name} account"
        message_lines = [
            f"We received a request to reset your {site_name} account password",
            "",
            "Please click the link to create a new password:",
            reset_link,
            "",
            "If you did not request a password reset, you can safely ignore this email.",
        ]
        message = "\n".join(message_lines)

        html_message = f"""
                <p>We received a request to reset your {site_name_html} account password.</p>
                <p>Please click the below link to create a new password.</p>
                <p>
                <a href="{reset_link}" style="display:inline-block;padding:10px 16px;margin-top:8px;background-color:#7b4b4b;color:#ffffff;text-decoration:none;border-radius:4px;">
                    Reset your password
                </a>
                </p>
                <p>If you did not request a password reset, you can safely ignore this email.</p>
                """

        try:
            send_mail(
                subject,
                message,
                getattr(settings, "DEFAULT_FROM_EMAIL", None) or f"no-reply@{settings.DJANGO_APP_HOSTNAME}",
                [email],
                fail_silently=False,
                html_message=html_message,
            )
        except Exception:
            request._request.auth_outcome = "mail_failed"
            logger.error("Password reset email could not be sent. request_id=%s",
                         getattr(request._request, "auth_request_id", "none"))
            return Response({"detail": "We could not send the reset email. Please try again later. "
                             f"If the problem continues, contact {_support_email()}."}, status=503)

        return Response(
            {"detail": "If an account exists for that email, a reset link has been sent."},
            status=status.HTTP_200_OK,
        )


@method_decorator(csrf_protect, name="dispatch")
class ResetPasswordApiView(APIView):
    """
    Public API to complete a password reset.
    POST JSON: { "uid": "<uidb64>", "token": "<token>", "password": "<new password>" }.
    """
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        values = _account_fields(request.data, "uid", "token", "password")
        uidb64, token, password = values["uid"].strip(), values["token"].strip(), values["password"]
        limited = _rate_limit(request, "reset_password_from_key")
        if limited is not None:
            return limited

        if not uidb64 or not token or not password:
            return Response(
                {"detail": "uid, token, and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        User = get_user_model()
        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
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

        # Deliberately AFTER check_token: uid is just a base64-encoded pk, so
        # checking account state before the token would turn this endpoint into
        # a standalone account-state oracle for any pk. And deliberately BEFORE
        # set_password: blocking only the forgot-password request would leave a
        # live token working for up to PASSWORD_RESET_TIMEOUT (3 days by
        # default) in the inbox of exactly the user who reported issue #150.
        blocked = _account_state_response(user, password_setup_flow=True)
        if blocked is not None:
            return blocked

        # The SAME rule change-password uses (issue #157). This endpoint used to
        # accept 4 characters, which made Forgot Password a route around the
        # strong policy: an attacker who could read one reset link, or any
        # non-SPA client, could set a weaker password than the product allows
        # anywhere else.
        #
        # * Note this was a server-only hole. ResetPassword.tsx already enforces
        # all five rules client-side, so the SPA never sent a weak password and
        # nothing user-facing changes here -- which is exactly why it survived:
        # the form's own validation hid the missing server check.
        err = _validate_password_strength(password)
        if err:
            return Response({"detail": err}, status=status.HTTP_400_BAD_REQUEST)

        # Password reset neither restores suspended access nor verifies email.
        user.set_password(password)
        user.save()

        return Response(
            {"detail": "Your password has been reset. You can now sign in with your new password."},
            status=status.HTTP_200_OK,
        )
@method_decorator(csrf_protect, name="dispatch")
class ChangePasswordApiView(APIView):
    """
    API for authenticated users to change their password.
    POST JSON: { "current_password": "...", "new_password": "..." }.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        values = _account_fields(request.data, "current_password", "currentPassword", "new_password", "newPassword")
        current_password = values["current_password"] or values["currentPassword"]
        new_password = values["new_password"] or values["newPassword"]
        limited = _rate_limit(request, "change_password")
        if limited is not None:
            return limited

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

        User = get_user_model()
        try:
            user = User.objects.get(pk=request.user.pk)
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
        if not check_account_password(user, current_password):
            return Response(
                {"detail": "Current password is incorrect. If you recently switched accounts, try signing out and signing in again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        err = _validate_password_strength(new_password)
        if err:
            return Response({"detail": err}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save(update_fields=["password"])
        logout(request)

        return Response(
            {"detail": "Your password has been changed. Please sign in again with your new password."},
            status=status.HTTP_200_OK,
        )
