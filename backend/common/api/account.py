"""Expose selected allauth browser views with mail failure handling."""
import json
import logging
from functools import wraps
from smtplib import SMTPException

from django.http import HttpRequest, HttpResponseBase, JsonResponse
from django.urls import path

from allauth.headless.account.views import LoginView, SessionView, SignupView, VerifyEmailView
from allauth.headless.constants import Client
from allauth.headless.base.views import APIView

from common.api.auth import _account_state_response, _resolve_login_identifier


logger = logging.getLogger(__name__)


class AccountLoginView(LoginView):
    def post(self, request, *args, **kwargs):
        blocked = _account_state_response(self.input.login.user)
        if blocked is not None:
            return JsonResponse(blocked.data, status=blocked.status_code)
        return super().post(request, *args, **kwargs)

    def handle_invalid_input(self, input):
        identifier = input.data.get("email") or input.data.get("username")
        if isinstance(identifier, str):
            account = _resolve_login_identifier(identifier.strip())
            if account is not None:
                blocked = _account_state_response(account)
                if blocked is not None:
                    return JsonResponse(blocked.data, status=blocked.status_code)
        return super().handle_invalid_input(input)


def browser_view(view_class: type[APIView], *, signup: bool = False):
    view = view_class.as_api_view(client=Client.BROWSER)

    @wraps(view)
    def handle(request: HttpRequest) -> HttpResponseBase:
        if request.method == "POST":
            try:
                data = json.loads(request.body)
            except (ValueError, UnicodeDecodeError):
                return JsonResponse({"detail": "A JSON object is required."}, status=400)
            if not isinstance(data, dict):
                return JsonResponse({"detail": "A JSON object is required."}, status=400)
            if signup and set(data) - {"email", "password", "first_name", "last_name"}:
                return JsonResponse({"detail": "Unsupported signup fields."}, status=400)
        try:
            return view(request)
        except (SMTPException, OSError):
            logger.exception("Account email delivery failed.")
            return JsonResponse(
                {"detail": "We could not send the email. Please try signing in again later to resend it."},
                status=503,
            )

    return handle


urlpatterns = [
    path("signup", browser_view(SignupView, signup=True)),
    path("login", browser_view(AccountLoginView)),
    path("email/verify", browser_view(VerifyEmailView)),
    path("session", browser_view(SessionView)),
]
