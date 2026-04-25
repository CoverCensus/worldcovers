###################################################################################################
## WoCo Commons - API Endpoints & Routing
## MPC: 2025/11/15
###################################################################################################
from django.urls import path, include
from django.views.decorators.csrf import csrf_exempt
from rest_framework.routers import DefaultRouter

from . import views

# Create a router and register our viewsets
router = DefaultRouter()

# ========== GEOGRAPHIC & JURISDICTIONAL CORE ==========

# New v2 geography models
router.register(
    r"regions",
    views.RegionViewSet,
    basename="region",
)
router.register(
    r"post-offices",
    views.PostOfficeViewSet,
    basename="post-office",
)
router.register(
    r"letterings",
    views.LetteringViewSet,
    basename="lettering",
)
router.register(
    r"framings",
    views.FramingViewSet,
    basename="framing",
)
router.register(
    r"shapes",
    views.ShapeViewSet,
    basename="shape",
)
router.register(
    r"covers",
    views.CoverV2ViewSet,
    basename="cover-v2",
)
router.register(
    r"dates-observed",
    views.DateObservedViewSet,
    basename="date-observed",
)
router.register(
    r"ratemarks",
    views.RatemarkViewSet,
    basename="ratemark",
)
router.register(
    r"auxmarks",
    views.AuxmarkViewSet,
    basename="auxmark",
)
router.register(
    r"cover-postmarks",
    views.CoverPostmarkViewSet,
    basename="cover-postmark",
)
router.register(
    r"postmark-ratemarks",
    views.PostmarkRatemarkViewSet,
    basename="postmark-ratemark",
)
router.register(
    r"mark-framings",
    views.MarkFramingViewSet,
    basename="mark-framing",
)
router.register(
    r"reference-works",
    views.ReferenceWorkViewSet,
    basename="reference-work",
)
router.register(
    r"citations",
    views.CitationViewSet,
    basename="citation",
)

# ========== SHARED LOOKUPS ==========

router.register(
    r"colors",
    views.ColorViewSet,
    basename="color",
)
# ========== POSTMARKS ==========

router.register(
    r"postmarks",
    views.PostmarkViewSet,
    basename="postmark",
)
router.register(
    r"postmark-images",
    views.PostmarkImageViewSet,
    basename="postmark-image",
)
router.register(
    r"postmark-valuations",
    views.PostmarkValuationViewSet,
    basename="postmark-valuation",
)


# ========== ADMIN (STAFF ONLY) ==========

router.register(
    r"admin-csv-uploads",
    views.AdminCsvUploadViewSet,
    basename="admin-csv-upload",
)
router.register(
    r"contributions",
    views.ContributionViewSet,
    basename="contribution",
)
router.register(
    r"collections",
    views.CollectionViewSet,
    basename="collection",
)

# FAQ entries (public site)
router.register(
    r"faq-entries",
    views.FAQEntryViewSet,
    basename="faq-entry",
)

# The API URLs are now determined automatically by the router
# csrf_exempt on login/logout/login-requests so the SPA can POST without a CSRF token
urlpatterns = [
    path("login/", csrf_exempt(views.LoginView.as_view()), name="login"),
    path("logout/", csrf_exempt(views.LogoutView.as_view()), name="logout"),
    path("login-requests/", csrf_exempt(views.LoginRequestView.as_view()), name="login-request"),
    path("forgot-password/", csrf_exempt(views.ForgotPasswordApiView.as_view()), name="forgot-password"),
    path("reset-password/", csrf_exempt(views.ResetPasswordApiView.as_view()), name="reset-password"),
    path("change-password/", csrf_exempt(views.ChangePasswordApiView.as_view()), name="change-password"),
    path("contributions/", csrf_exempt(views.ContributionView.as_view()), name="contribution"),
    path("postmarks/<int:pk>/delete-mine/", views.DeleteMySubmissionView.as_view(), name="postmark-delete-mine"),
    path("me/", views.CurrentUserView.as_view(), name="current-user"),
    path("postmarks-range/", views.PostmarkDateRangeView.as_view(), name="postmarks-range"),
    path("help-docs/", views.HelpDocsView.as_view(), name="help-docs"),
    path("", include(router.urls)),
]

###################################################################################################
