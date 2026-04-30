###################################################################################################
## WoCo Commons - API v2 Routing
## Phase 1 stub: only auth + a handful of safe-to-keep read-only routes are wired.
## Marking/Image/Cover* viewsets are deferred to the Phase 2 API rewrite.
###################################################################################################
from django.urls import path, include
from django.views.decorators.csrf import csrf_exempt
from rest_framework.routers import DefaultRouter

from common.api.auth import LoginView, LogoutView, CurrentUserView
from . import views

router = DefaultRouter()

# Lookups and reference data that survive the Phase 1 model rewrite untouched.
router.register(r"colors", views.ColorViewSet, basename="color")
router.register(r"regions", views.RegionViewSet, basename="region")
router.register(r"post-offices", views.PostOfficeViewSet, basename="post-office")
router.register(r"letterings", views.LetteringViewSet, basename="lettering")
router.register(r"shapes", views.ShapeViewSet, basename="shape")
router.register(r"reference-works", views.ReferenceWorkViewSet, basename="reference-work")
router.register(r"faq-entries", views.FAQEntryViewSet, basename="faq-entry")

urlpatterns = [
    path("login/", csrf_exempt(LoginView.as_view()), name="login"),
    path("logout/", csrf_exempt(LogoutView.as_view()), name="logout"),
    path("me/", CurrentUserView.as_view(), name="current-user"),
    path("", include(router.urls)),
]

###################################################################################################
