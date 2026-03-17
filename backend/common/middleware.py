"""
Middleware to force CSRF exemption for specific API paths used by the SPA
(login, logout, admin CSV uploads) so they work without a CSRF token.
Runs before CsrfViewMiddleware; marking the view as csrf_exempt here ensures
the check is skipped even if the view was resolved from an include().
"""


def process_view(request, view_func, view_args, view_kwargs):
    path = request.path
    exempt_paths = (
        "/api/login", "/api/login/", "/api/logout", "/api/logout/",
        "/api/login-requests", "/api/login-requests/",
    )
    contrib_action = path.startswith("/api/contributions/") and (
        path.rstrip("/").endswith("/approve")
        or path.rstrip("/").endswith("/reject")
        or path.rstrip("/").endswith("/request-revision")
    )
    if path in exempt_paths or path.startswith("/api/admin-csv-uploads/") or contrib_action:
        setattr(view_func, "csrf_exempt", True)
    return None


class CsrfExemptApiPathsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_view(self, request, view_func, view_args, view_kwargs):
        return process_view(request, view_func, view_args, view_kwargs)
