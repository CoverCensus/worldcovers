###################################################################################################
## WoCo Project - Routing
## MPC: 2025/10/24
###################################################################################################
from django.urls import include, path, re_path
from django.views.static import serve
from django.views.generic import RedirectView

from django.conf import settings
from django.conf.urls.static import static

from django.contrib import admin

from debug_toolbar.toolbar import debug_toolbar_urls

from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from .views import ServeSPAView


###
# Backend (Django) URLs – must be matched before the SPA catch-all.
# Paths without trailing slash are redirected so they hit Django, not the SPA.
urlpatterns = [
    path("admin", RedirectView.as_view(url="/admin/", permanent=True)),
    path("admin/", admin.site.urls),
    path("accounts", RedirectView.as_view(url="/accounts/", permanent=True)),
    path("accounts/", include("allauth.urls")),

    path("api", RedirectView.as_view(url="/api/", permanent=True)),
    path("api/", include("common.urls")),
    path("api-auth/", include("rest_framework.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),

    # React SPA: static assets (Vite default output)
    path(
        "assets/<path:path>",
        serve,
        {"document_root": settings.FRONTEND_DIST / "assets"},
        name="frontend_assets",
    ),
    # React SPA: catch-all only for paths that are NOT backend URLs (so /api, /admin, etc. go to Django)
    re_path(
        r"^(?!/(?:api|admin|accounts|api-auth|media|static|assets)(?:/|$))(?P<frontend_path>.*)$",
        ServeSPAView.as_view(),
        name="spa",
    ),
]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += debug_toolbar_urls()

###################################################################################################
