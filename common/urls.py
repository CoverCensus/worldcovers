###################################################################################################
## WoCo Project - Model Filters
## MPC: 2025/11/15
###################################################################################################
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# Create a router and register our viewsets
router = DefaultRouter()

# Geographic Hierarchy
router.register(r"geographic-locations", views.GeographicLocationViewSet, basename="geographic-location")
router.register(r"administrative-units", views.AdministrativeUnitViewSet, basename="administrative-unit")
router.register(r"geographic-affiliations", views.GeographicAffiliationViewSet, basename="geographic-affiliation")

router.register(r"administrative-unit-name-history", views.AdministrativeUnitNameHistoryViewSet, 
                basename="administrative-unit-name-history")
router.register(r"administrative-unit-history", views.AdministrativeUnitHistoryViewSet, 
                basename="administrative-unit-history")

# Physical Characteristics
router.register(r"postmark-shapes", views.PostmarkShapeViewSet, basename="postmark-shape")
router.register(r"lettering-styles", views.LetteringStyleViewSet, basename="lettering-style")
router.register(r"framing-styles", views.FramingStyleViewSet, basename="framing-style")
router.register(r"colors", views.ColorViewSet, basename="color")
router.register(r"date-formats", views.DateFormatViewSet, basename="date-format")

# Postmarks
router.register(r"postmarks", views.PostmarkViewSet, basename="postmark")
router.register(r"postmark-images", views.PostmarkImageViewSet, basename="postmark-image")
router.register(r"postmark-valuations", views.PostmarkValuationViewSet, basename="postmark-valuation")

# Publications
router.register(r"publications", views.PostmarkPublicationViewSet, basename="publication")
router.register(r"publication-references", views.PostmarkPublicationReferenceViewSet, basename="publication-reference")

# Postcovers
router.register(r"postcovers", views.PostcoverViewSet, basename="postcover")
router.register(r"postcover-images", views.PostcoverImageViewSet, basename="postcover-image")

# The API URLs are now determined automatically by the router
urlpatterns = [
    path('', include(router.urls)),
]

###################################################################################################
