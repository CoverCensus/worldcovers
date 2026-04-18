from django.contrib import admin

from common.admin import (
    TimestampedModelAdmin,
    InlineRevisionMixin,
    PostmarkAdmin,
    PostmarkImageAdmin,
    ColorAdmin,
    PostcoverAdmin,
    PostcoverImageAdmin,
    AdministrativeUnitAdmin,
)
from common.utils import get_canonical_location_reference_codes

from .models import (
    Listing,
    CatalogRequest,
    ListingImage,
    Color,
    PostmarkValuation,
    Postcover,
    PostcoverPostmark,
    PostcoverImage,
    Location,
)


@admin.register(Listing)
class ListingAdmin(PostmarkAdmin):
    list_per_page = 50
    list_max_show_all = 200
    show_full_result_count = False

    def get_queryset(self, request):
        return (
            super().get_queryset(request)
            .select_related('post_office', 'shape', 'color')
            .order_by('id')
        )


@admin.register(CatalogRequest)
class CatalogRequestAdmin(ListingAdmin):
    """
    Admin view that shows only user-contributed catalog entries,
    so admins can approve/reject/mark as needing revision.
    """

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.filter(contribution__isnull=False)


admin.site.register(ListingImage, PostmarkImageAdmin)
admin.site.register(Color, ColorAdmin)
admin.site.register(Postcover, PostcoverAdmin)
admin.site.register(PostcoverImage, PostcoverImageAdmin)


# Locations (proxy of AdministrativeUnit) — under Postmarks; only show rows from tblStates.csv
class LocationAdmin(AdministrativeUnitAdmin):
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        codes = get_canonical_location_reference_codes()
        if codes is not None:
            return qs.filter(reference_code__in=codes)
        return qs


admin.site.register(Location, LocationAdmin)


@admin.register(PostmarkValuation)
class PostmarkValuationAdmin(TimestampedModelAdmin):
    list_display = ['postmark', 'amt', 'appraisal_date']
    raw_id_fields = ['postmark']


@admin.register(PostcoverPostmark)
class PostcoverPostmarkAdmin(InlineRevisionMixin, TimestampedModelAdmin):
    list_display = ['postcover', 'postmark', 'position_order', 'postmark_location']
    raw_id_fields = ['postcover', 'postmark']
