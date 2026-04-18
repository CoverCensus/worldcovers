from common.models import (
    Postmark as CommonPostmark,
    PostmarkImage as CommonPostmarkImage,
    Color as CommonColor,
    PostmarkValuation as CommonPostmarkValuation,
    Postcover as CommonPostcover,
    PostcoverPostmark as CommonPostcoverPostmark,
    PostcoverImage as CommonPostcoverImage,
    AdministrativeUnit as CommonAdministrativeUnit,
    AdministrativeUnitIdentity as CommonAdministrativeUnitIdentity,
    AdministrativeUnitResponsibility as CommonAdministrativeUnitResponsibility,
)


class Listing(CommonPostmark):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Listing"
        verbose_name_plural = "Listings"


class CatalogRequest(Listing):
    """
    Proxy for Postmark used to show only user-contributed catalog requests
    in the Postmarks section of the admin.
    """

    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Catalog request"
        verbose_name_plural = "Catalog requests"


class ListingImage(CommonPostmarkImage):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Listing Image"
        verbose_name_plural = "Listing Images"


class Color(CommonColor):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Color"
        verbose_name_plural = "Colors"


class PostmarkValuation(CommonPostmarkValuation):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Postmark Valuation"
        verbose_name_plural = "Postmark Valuations"


class Postcover(CommonPostcover):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Example Cover"
        verbose_name_plural = "Example Covers"


class PostcoverPostmark(CommonPostcoverPostmark):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Example Cover Marking"
        verbose_name_plural = "Example Cover Markings"


class PostcoverImage(CommonPostcoverImage):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Example Image"
        verbose_name_plural = "Example Images"


class Location(CommonAdministrativeUnit):
    """Proxy for AdministrativeUnit; appears under Postmarks in admin as 'Locations'."""
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Location"
        verbose_name_plural = "Locations"


class LocationIdentity(CommonAdministrativeUnitIdentity):
    """Proxy for AdministrativeUnitIdentity; appears under Postmarks in admin."""
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Location identity"
        verbose_name_plural = "Location identities"


class LocationResponsibility(CommonAdministrativeUnitResponsibility):
    """Proxy for AdministrativeUnitResponsibility; appears under Postmarks in admin."""
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Location responsibility"
        verbose_name_plural = "Location responsibilities"
