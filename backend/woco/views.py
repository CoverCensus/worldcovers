###################################################################################################
## WoCo - SPA (React) fallback view
## Serves the frontend index.html so React Router handles all non-API paths at hellowoco.app
###################################################################################################
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from django.views import View


_FAVICON_FILES = {
    "favicon.ico": "image/x-icon",
    "favicon.svg": "image/svg+xml",
    "favicon-96x96.png": "image/png",
    "apple-touch-icon.png": "image/png",
    "web-app-manifest-192x192.png": "image/png",
    "web-app-manifest-512x512.png": "image/png",
    "site.webmanifest": "application/manifest+json",
}


class FaviconView(View):
    """Serve the frontend favicon-set files for backend pages (admin, DRF browsable API, etc.) so they match the SPA icon."""

    def get(self, request, *_args, **_kwargs):
        name = request.path.rstrip("/").rsplit("/", 1)[-1]
        content_type = _FAVICON_FILES.get(name)
        if content_type is None:
            raise Http404("Unknown favicon asset: {0}".format(name))
        for root in (Path(settings.FRONTEND_DIST), Path(settings.REPO_ROOT) / "frontend" / "public"):
            favicon_path = root / name
            if favicon_path.is_file():
                return FileResponse(favicon_path.open("rb"), content_type=content_type)
        raise Http404(
            "Favicon asset {0} not found. Add frontend/public/{0} or build frontend: cd frontend && npm run build".format(name)
        )


class AdminFaviconView(View):
    """Serve the admin-only favicon set so the Django admin can use a distinct icon from the SPA.

    Reads from STATIC_ROOT/admin-favicon/ first (the post-collectstatic location used in
    production), and falls back to the in-repo source at backend/static/admin-favicon/ for
    dev environments where collectstatic has not been run.
    """

    def get(self, request, *_args, **_kwargs):
        name = request.path.rstrip("/").rsplit("/", 1)[-1]
        content_type = _FAVICON_FILES.get(name)
        if content_type is None:
            raise Http404("Unknown admin favicon asset: {0}".format(name))
        for root in (
            Path(settings.STATIC_ROOT) / "admin-favicon",
            Path(settings.REPO_ROOT) / "backend" / "static" / "admin-favicon",
        ):
            favicon_path = root / name
            if favicon_path.is_file():
                return FileResponse(favicon_path.open("rb"), content_type=content_type)
        raise Http404("Admin favicon asset {0} not found. Add backend/static/admin-favicon/{0}".format(name))


class ServeSPAView(View):
    """
    Serve frontend/dist for any path not handled by API/admin/accounts/media/static.
    If the path is a file under FRONTEND_DIST (e.g. favicon.png), serve it; else serve index.html.
    """

    def get(self, request, frontend_path="", *_args, **_kwargs):
        root = Path(settings.FRONTEND_DIST)
        if not root.is_dir():
            raise Http404(
                "Frontend not built. From project root run: cd frontend && npm run build"
            )
        # Safe path: no traversal, no leading slash
        safe_path = (frontend_path or "").lstrip("/").replace("..", "")
        if safe_path:
            file_path = (root / safe_path).resolve()
            if file_path.is_file() and str(file_path).startswith(str(root.resolve())):
                return FileResponse(file_path.open("rb"))
        index_path = root / "index.html"
        if not index_path.is_file():
            raise Http404(
                "Frontend not built. From project root run: cd frontend && npm run build"
            )
        return FileResponse(
            index_path.open("rb"),
            content_type="text/html",
        )
