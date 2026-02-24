###################################################################################################
## WoCo - SPA (React) fallback view
## Serves the frontend index.html so React Router handles all non-API paths at hellowoco.app
###################################################################################################
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from django.views import View


class FaviconView(View):
    """Serve the frontend favicon for all site pages (admin, SPA, API, etc.) so backend pages show the same icon as the frontend."""

    def get(self, request, *_args, **_kwargs):
        want_ico = request.path.rstrip("/").endswith(".ico")
        # Prefer built frontend dist, then fall back to frontend/public (source)
        for root in (Path(settings.FRONTEND_DIST), Path(settings.REPO_ROOT) / "frontend" / "public"):
            if want_ico:
                favicon_path = root / "favicon.ico"
                content_type = "image/x-icon"
                if not favicon_path.is_file():
                    favicon_path = root / "favicon.png"
                    content_type = "image/png"
            else:
                favicon_path = root / "favicon.png"
                content_type = "image/png"
            if favicon_path.is_file():
                return FileResponse(
                    favicon_path.open("rb"),
                    content_type=content_type,
                )
        raise Http404("Favicon not found. Add frontend/public/favicon.png or build frontend: cd frontend && npm run build")


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
