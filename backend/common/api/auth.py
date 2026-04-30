"""
Session-based auth views shared by the SPA. Carved out of the deleted v1 API
during the Phase 1 model rewrite so /api/login, /api/logout, and the SPA
session check stay live while v2 is being rewritten.
"""
from __future__ import annotations

from django.contrib.auth import authenticate, login, logout, get_user_model
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class SessionAuthenticationNoCSRF(SessionAuthentication):
    """Session auth without CSRF enforcement. Used by csrf_exempt SPA routes."""

    def enforce_csrf(self, request):
        return None


def _get_user_role(user):
    if user.groups.filter(name__iexact="Editors").exists():
        return "state_editor"
    return "contributor"


def _get_user_assigned_regions(user):
    """Regions covered by Collections this user is assigned to."""
    from common.models import Region
    return Region.objects.filter(collection__editor_assignments__user=user).distinct()


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
    if role == "state_editor":
        regions = _get_user_assigned_regions(user)
        payload["assigned_locations"] = [
            {"name": r.name, "reference_code": r.abbrev or ""}
            for r in regions
        ]
    return payload


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


@method_decorator(csrf_exempt, name="dispatch")
class LogoutView(APIView):
    """Session logout for the SPA."""

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_200_OK)


class CurrentUserView(APIView):
    """Return current user payload when authenticated via session."""
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        return Response({"user": _build_user_payload(request.user)})
