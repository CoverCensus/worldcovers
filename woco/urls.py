###################################################################################################
## WoCo Project - Routing
## MPC: 2025/10/24
###################################################################################################
from django.urls import include, path

from django.conf import settings
from django.conf.urls.static import static

from django.contrib import admin

from debug_toolbar.toolbar import debug_toolbar_urls

from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


###
urlpatterns = [
    path("admin/", admin.site.urls),
    path("accounts/", include("allauth.urls")),

    path("api/", include("common.urls")),
    path("api-auth/", include("rest_framework.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),

]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += debug_toolbar_urls()

###################################################################################################
