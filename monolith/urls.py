###################################################################################################
## Monolith Project - Routing
## MPC: 2025/10/24
###################################################################################################
from django.urls import include, path

from django.conf import settings

from django.contrib import admin

from debug_toolbar.toolbar import debug_toolbar_urls


###
urlpatterns = [
    path("admin/", admin.site.urls),
]
if not settings.TESTING:
    urlpatterns = [
        *urlpatterns,
    ] + debug_toolbar_urls()

###################################################################################################
