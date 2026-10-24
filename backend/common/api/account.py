"""Expose selected allauth browser views with mail failure handling."""
import json
import logging
from functools import wraps
from smtplib import SMTPException

from django.http import HttpRequest, HttpResponseBase, JsonResponse
from django.urls import path
from django import forms

from allauth.headless.account.views import LoginView, SessionView, SignupView, VerifyEmailView
from allauth.headless.account.inputs import LoginInput, SignupInput
from allauth.headless.constants import Client
from allauth.headless.base.views import APIView

from common.api.auth import _account_state_response, _resolve_login_identifier


logger = logging.getLogger(__name__)


class AccountLoginInput(LoginInput):
    password = forms.CharField(strip=False)


class AccountSignupInput(SignupInput):
    password = forms.CharField(strip=False)


class AccountSignupView(SignupView):
    input_class = {"POST": AccountSignupInput}


class AccountLoginView(LoginView):
    input_class = AccountLoginInput

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
            if any(not isinstance(value, str) or len(value) > 4096 for value in data.values()):
                return JsonResponse({"detail": "Account fields must be text of at most 4096 characters."}, status=400)
        try:
            response = view(request)
            if response.status_code == 401:
                payload = json.loads(response.content)
                flows = payload.get("data", {}).get("flows", [])
                if any(flow.get("id") == "verify_email" and flow.get("is_pending") for flow in flows):
                    request.auth_outcome = "verification_pending"
                elif view_class is VerifyEmailView and request.method == "POST" and not payload.get("errors"):
                    request.auth_outcome = "email_verified"
                elif view_class is SessionView:
                    request.auth_outcome = "guest"
            return response
        except (SMTPException, OSError):
            request.auth_outcome = "mail_failed"
            logger.error("Account email delivery failed. request_id=%s", getattr(request, "auth_request_id", "none"))
            return JsonResponse(
                {"detail": "We could not send the email. Please try signing in again later to resend it."},
                status=503,
            )

    return handle


urlpatterns = [
    path("signup", browser_view(AccountSignupView, signup=True)),
    path("login", browser_view(AccountLoginView)),
    path("email/verify", browser_view(VerifyEmailView)),
    path("session", browser_view(SessionView)),
]
