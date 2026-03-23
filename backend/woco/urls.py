###################################################################################################
## WoCo Project - Routing
## MPC: 2025/10/24
###################################################################################################
from django.urls import include, path, re_path
from django.views.decorators.csrf import csrf_exempt
from django.views.static import serve
from django.views.generic import RedirectView

from django.conf import settings
from django.conf.urls.static import static

from django.contrib import admin

from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from .views import ServeSPAView, FaviconView
from common.api.v1.views import LoginView, LogoutView


###
# Backend (Django) URLs – must be matched before the SPA catch-all.
# Paths without trailing slash are redirected so they hit Django, not the SPA.
urlpatterns = [
    path("favicon.ico", FaviconView.as_view()),
    path("favicon.png", FaviconView.as_view()),
    path("admin", RedirectView.as_view(url="/admin/", permanent=True)),
    path("admin/", admin.site.urls),
    path("accounts", RedirectView.as_view(url="/accounts/", permanent=True)),
    path("accounts/", include("allauth.urls")),

    path("api/v1", RedirectView.as_view(url="/api/v1/", permanent=True)),
    path("api/v1/login/", csrf_exempt(LoginView.as_view()), name="api-v1-login"),
    path("api/v1/logout/", csrf_exempt(LogoutView.as_view()), name="api-v1-logout"),
    path("api/v1/login", csrf_exempt(LoginView.as_view()), name="api-v1-login-no-slash"),
    path("api/v1/logout", csrf_exempt(LogoutView.as_view()), name="api-v1-logout-no-slash"),
    path("api/v1/", include("common.api.v1.urls")),
    path("api/v2/", include("common.api.v2.urls")),
    
    # Legacy /api/ routes (alias)
    path("api", RedirectView.as_view(url="/api/", permanent=True)),
    # Login/logout with CSRF exempt so SPA can POST without token (matched before include)
    path("api/login/", csrf_exempt(LoginView.as_view()), name="api-login"),
    path("api/logout/", csrf_exempt(LogoutView.as_view()), name="api-logout"),
    path("api/login", csrf_exempt(LoginView.as_view()), name="api-login-no-slash"),
    path("api/logout", csrf_exempt(LogoutView.as_view()), name="api-logout-no-slash"),
    path("api/", include("common.api.v1.urls")),
    
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
    if not getattr(settings, "TESTING", False):
        from debug_toolbar.toolbar import debug_toolbar_urls

        urlpatterns += debug_toolbar_urls()

###################################################################################################
