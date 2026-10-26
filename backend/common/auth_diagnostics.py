"""Correlate account requests without storing credentials or identifiers."""
import logging
import re
from time import monotonic
from uuid import uuid4


logger = logging.getLogger(__name__)


class OmitAccessQuery(logging.Filter):
    """Keep tokens and login identifiers out of the development access log."""
    def filter(self, record):
        record.msg = re.sub(r'(\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) [^ ?"]+)\?[^ ]*',
                            r'\1', record.getMessage())
        record.args = ()
        return True


OPERATIONS = {
    "/api/v2/auth/signup": "signup",
    "/api/v2/auth/login": "login",
    "/api/v2/auth/email/verify": "verify_email",
    "/api/v2/auth/session": "session",
    "/api/v2/login/": "login",
    "/api/login/": "login",
    "/api/login": "login",
    "/api/v2/logout/": "logout",
    "/api/logout/": "logout",
    "/api/logout": "logout",
    "/api/v2/me/": "session",
    "/api/v2/forgot-password/": "forgot_password",
    "/api/v2/reset-password/": "reset_password",
    "/api/v2/change-password/": "change_password",
    "/admin/login/": "admin_login",
    "/admin/logout/": "admin_logout",
}


class AuthRequestLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        operation = OPERATIONS.get(request.path)
        if operation is None:
            return self.get_response(request)
        request.auth_request_id = uuid4().hex
        started = monotonic()
        response = self.get_response(request)
        response["X-Request-ID"] = request.auth_request_id
        response["Cache-Control"] = "no-store"
        outcome = getattr(request, "auth_outcome", None)
        if outcome is None:
            outcome = "accepted" if response.status_code < 400 else "refused"
        logger.info("account operation=%s outcome=%s status=%s duration_ms=%d request_id=%s",
                    operation, outcome, response.status_code,
                    int((monotonic() - started) * 1000), request.auth_request_id)
        return response
