###################################################################################################
## WoCo Commons - API Endpoints & Routing
## MPC: 2025/11/15
###################################################################################################
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

# Create a router and register our viewsets
router = DefaultRouter()

# ========== GEOGRAPHIC & JURISDICTIONAL CORE ==========

# Postal facilities (stable containers + identities + jurisdiction)
router.register(
    r"postal-facilities",
    views.PostalFacilityViewSet,
    basename="postal-facility",
)
router.register(
    r"postal-facility-identities",
    views.PostalFacilityIdentityViewSet,
    basename="postal-facility-identity",
)

# Administrative units (stable containers + identities + group responsibilities)
router.register(
    r"administrative-units",
    views.AdministrativeUnitViewSet,
    basename="administrative-unit",
)
router.register(
    r"administrative-unit-identities",
    views.AdministrativeUnitIdentityViewSet,
    basename="administrative-unit-identity",
)
router.register(
    r"administrative-unit-responsibilities",
    views.AdministrativeUnitResponsibilityViewSet,
    basename="administrative-unit-responsibility",
)

# Jurisdictional links between facilities and units
router.register(
    r"jurisdictional-affiliations",
    views.JurisdictionalAffiliationViewSet,
    basename="jurisdictional-affiliation",
)

# ========== PHYSICAL CHARACTERISTICS ==========

router.register(
    r"postmark-shapes",
    views.PostmarkShapeViewSet,
    basename="postmark-shape",
)
router.register(
    r"lettering-styles",
    views.LetteringStyleViewSet,
    basename="lettering-style",
)
router.register(
    r"framing-styles",
    views.FramingStyleViewSet,
    basename="framing-style",
)
router.register(
    r"colors",
    views.ColorViewSet,
    basename="color",
)
router.register(
    r"date-formats",
    views.DateFormatViewSet,
    basename="date-format",
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

# ========== PUBLICATIONS ==========

router.register(
    r"publications",
    views.PostmarkPublicationViewSet,
    basename="publication",
)
router.register(
    r"publication-references",
    views.PostmarkPublicationReferenceViewSet,
    basename="publication-reference",
)

# ========== POSTCOVERS ==========

router.register(
    r"postcovers",
    views.PostcoverViewSet,
    basename="postcover",
)
router.register(
    r"postcover-images",
    views.PostcoverImageViewSet,
    basename="postcover-image",
)

# The API URLs are now determined automatically by the router
urlpatterns = [
    path("", include(router.urls)),
]

###################################################################################################
