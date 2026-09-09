"""Session-based auth views shared by the SPA: /api/login, /api/logout, and the SPA session check."""
from __future__ import annotations

import re

from django.conf import settings
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import send_mail
from django.utils.decorators import method_decorator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie

from rest_framework import serializers, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer


_password_reset_token_generator = PasswordResetTokenGenerator()


class SessionAuthenticationNoCSRF(SessionAuthentication):
    """Session auth without CSRF enforcement. Used by csrf_exempt SPA routes."""

    def enforce_csrf(self, request):
        return None


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


def _resolve_login_identifier(identifier):
    """The single User matching this username-or-email, else None.

    Diagnostic only -- this NEVER grants access, it only decides which error
    string the caller returns, which is why __iexact is acceptable here.
    Username first, then email, mirroring ModelBackend running first in
    settings.AUTHENTICATION_BACKENDS.

    An ambiguous identifier resolves to None rather than raising: nothing
    enforces email uniqueness on User, so .get() here would 500 the way
    ForgotPasswordApiView still does. Two matches means we cannot say which
    account the caller meant, so they get the generic answer.
    """
    User = get_user_model()
    for lookup in ("username__iexact", "email__iexact"):
        if lookup.startswith("email") and "@" not in identifier:
            continue
        matches = list(User.objects.filter(**{lookup: identifier})[:2])
        if len(matches) == 1:
            return matches[0]
        if matches:
            return None
    return None


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

    ⛔ Do NOT gate these messages on a correct password ("only tell them if
    they'd otherwise have logged in"). It is the natural review suggestion and
    it is a null fix here: LoginRequestView calls set_unusable_password(), so
    check_password() returns False for every possible input and 100% of pending
    users would still get "Invalid credentials." That ships the bug unchanged
    while looking like a fix.

    On disclosure: this reveals that an account exists and cannot sign in. The
    codebase already concedes far more from unauthenticated endpoints -- see
    LoginRequestSerializer.validate_email ("A user with this email already
    exists.") and ForgotPasswordApiView's "No account found for that email
    address." Both are complete membership oracles. This adds one bit about
    accounts that cannot be logged into at all, so it shortens no password
    search.
    """
    if not account.is_active:
        # last_login, NOT has_usable_password(), is the discriminator. A user
        # who already walked the issue #150 loop completed a password reset, so
        # they are inactive WITH a usable password -- keying on the password
        # would hand that exact person the "deactivated" copy, which is a
        # second wrong answer to the same member. login() is the only writer of
        # last_login, and they have never reached it.
        if account.last_login is None:
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
@method_decorator(csrf_exempt, name="dispatch")
class LoginView(APIView):
    """Session login for the SPA. Accepts username or email + password."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        username = (request.data.get("username") or request.data.get("email") or "").strip()
        password = request.data.get("password") or ""
        if not username or not password:
            return Response(
                {"detail": "Username and password required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = authenticate(request, username=username, password=password)
        if user is None and "@" in username:
            User = get_user_model()
            try:
                u = User.objects.get(email__iexact=username)
                user = authenticate(request, username=u.username, password=password)
            except (User.DoesNotExist, User.MultipleObjectsReturned):
                pass
        if user is None:
            # authenticate() returns None for BOTH "wrong password" and "account
            # cannot authenticate" -- ModelBackend.user_can_authenticate rejects
            # inactive users inside authenticate(), and allauth's backend stashes
            # them rather than returning them. So the real account state has to be
            # looked up here, on the failure path only, to tell those cases apart.
            # Everything above this line is deliberately untouched: the email ->
            # username fallback is the only thing making username != email accounts
            # work, and it is load-bearing for every editor on the site.
            account = _resolve_login_identifier(username)
            if account is not None:
                blocked = _account_state_response(account)
                if blocked is not None:
                    return blocked
            return Response(
                {"detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not user.is_active:
            # Unreachable with the backends in settings.AUTHENTICATION_BACKENDS
            # today -- both ModelBackend and allauth's AuthenticationBackend
            # return None for is_active=False, which is why the real handling
            # lives in the branch above. Kept as an invariant guard: never
            # login() an inactive user, whatever backend list a future settings
            # change grows. Costs one boolean on the success path.
            return _account_state_response(user) or Response(
                {"detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        login(request, user)
        return Response({"user": _build_user_payload(user)})


@extend_schema(
    request=None,
    responses={200: OpenApiResponse(description="Logged out")},
)
@method_decorator(csrf_exempt, name="dispatch")
class LogoutView(APIView):
    """Session logout for the SPA."""

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
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        return Response({"user": _build_user_payload(request.user)})


@method_decorator(csrf_exempt, name="dispatch")
class LoginRequestView(APIView):
    """
    Public API for users to request login access.
    Creates User directly (is_active=False). Admin sets username/password and activates in Users.
    """
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        from common.api.v2.serializers import LoginRequestSerializer
        serializer = LoginRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        User = get_user_model()
        email = data["email"].strip().lower()
        user = User(
            username=email,
            email=email,
            first_name=data["first_name"].strip(),
            last_name=data["last_name"].strip(),
            is_active=False,
        )
        user.set_unusable_password()
        user.save()
        # Promises nothing the system can actually deliver. The previous copy
        # ("An admin will provide your username and password") described a
        # notification that does not exist, for a step nobody owns (issue #151),
        # over mail that currently cannot send at all (issue #152) -- so users
        # waited silently instead of asking.
        return Response(
            {
                "detail": (
                    "Request received. Each request is reviewed by an editor by hand, so it "
                    "is not instant. You will not get an automatic confirmation email - if "
                    f"you have not heard back within a week, email {_support_email()}."
                )
            },
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
            return Response(
                {"detail": "No account found for that email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
            {"detail": "If an account exists for that email, a reset link has been sent."},
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

        if len(password) < 4:
            return Response(
                {"detail": "Password must be at least 4 characters long."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ⛔ is_active is deliberately NOT set here. Activation is an editorial
        # membership decision (issue #151), not proof of email ownership --
        # auto-activating on reset would let anyone who can receive mail at the
        # address bypass approval entirely.
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
    """
    authentication_classes = [SessionAuthenticationNoCSRF]
    permission_classes = [IsAuthenticated]

    def post(self, request):
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
