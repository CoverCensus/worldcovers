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
from common.account_admin import VerifiedAdminAuthenticationForm

admin.site.login_form = VerifiedAdminAuthenticationForm
admin.site.site_header = f"{settings.SITE_NAME} administration"
admin.site.site_title = settings.SITE_NAME

from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from .views import ServeSPAView, FaviconView, AdminFaviconView
from common.api.auth import LoginView, LogoutView


###
# Backend (Django) URLs -- must be matched before the SPA catch-all.
# Paths without trailing slash are redirected so they hit Django, not the SPA.
urlpatterns = [
    path("favicon.ico", FaviconView.as_view()),
    path("favicon.svg", FaviconView.as_view()),
    path("favicon-96x96.png", FaviconView.as_view()),
    path("apple-touch-icon.png", FaviconView.as_view()),
    path("web-app-manifest-192x192.png", FaviconView.as_view()),
    path("web-app-manifest-512x512.png", FaviconView.as_view()),
    path("site.webmanifest", FaviconView.as_view()),

    path("admin-favicon/favicon.ico", AdminFaviconView.as_view()),
    path("admin-favicon/favicon.svg", AdminFaviconView.as_view()),
    path("admin-favicon/favicon-96x96.png", AdminFaviconView.as_view()),
    path("admin-favicon/apple-touch-icon.png", AdminFaviconView.as_view()),
    path("admin-favicon/web-app-manifest-192x192.png", AdminFaviconView.as_view()),
    path("admin-favicon/web-app-manifest-512x512.png", AdminFaviconView.as_view()),
    path("admin-favicon/site.webmanifest", AdminFaviconView.as_view()),
    path("admin", RedirectView.as_view(url="/admin/", permanent=True)),
    path("admin/", admin.site.urls),
    path("accounts", RedirectView.as_view(url="/accounts/", permanent=True)),
    path("accounts/login/", RedirectView.as_view(url="/auth")),
    path("accounts/signup/", RedirectView.as_view(url="/auth")),
    path("accounts/", include("allauth.urls")),

    path("api/v2/", include("common.api.v2.urls")),

    # Preserve older account URLs with the same session and CSRF rules.
    path("api/login/", LoginView.as_view(), name="api-login"),
    path("api/logout/", LogoutView.as_view(), name="api-logout"),
    path("api/login", LoginView.as_view(), name="api-login-no-slash"),
    path("api/logout", LogoutView.as_view(), name="api-logout-no-slash"),

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
        r"^(?!(?:api|admin|accounts|api-auth|media|static|assets)(?:/|$))(?P<frontend_path>.*)$",
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
