from common.models import (
    Postmark as CommonPostmark,
    PostmarkImage as CommonPostmarkImage,
    PostmarkValuation as CommonPostmarkValuation,
    Postcover as CommonPostcover,
    PostcoverPostmark as CommonPostcoverPostmark,
    PostcoverImage as CommonPostcoverImage,
    AdministrativeUnit as CommonAdministrativeUnit,
    AdministrativeUnitIdentity as CommonAdministrativeUnitIdentity,
    AdministrativeUnitResponsibility as CommonAdministrativeUnitResponsibility,
    FAQEntry as CommonFAQEntry,
    Contribution as CommonContribution,
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
        verbose_name = "Example Cover (Deprecated)"
        verbose_name_plural = "Example Covers (Deprecated)"


class PostcoverPostmark(CommonPostcoverPostmark):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Example Cover Marking (Deprecated)"
        verbose_name_plural = "Example Cover Markings (Deprecated)"


class PostcoverImage(CommonPostcoverImage):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Example Image (Deprecated)"
        verbose_name_plural = "Example Images (Deprecated)"


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


class FAQEntry(CommonFAQEntry):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "FAQ entry"
        verbose_name_plural = "FAQ entries"


class Contribution(CommonContribution):
    class Meta:
        proxy = True
        app_label = "postmarks"
        verbose_name = "Contribution"
        verbose_name_plural = "Contributions"
