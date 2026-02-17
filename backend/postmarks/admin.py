from django.contrib import admin

from common.admin import (
    TimestampedModelAdmin,
    InlineRevisionMixin,
    PostmarkAdmin,
    PostmarkImageAdmin,
    PostmarkPublicationAdmin,
    PostmarkPublicationReferenceAdmin,
    PostmarkShapeAdmin,
    LetteringStyleAdmin,
    FramingStyleAdmin,
    ColorAdmin,
    DateFormatAdmin,
    PostcoverAdmin,
    PostcoverImageAdmin,
    AdministrativeUnitAdmin,
)
from common.utils import get_canonical_location_reference_codes

from .models import (
    Listing,
    ListingImage,
    PostmarkShape,
    LetteringStyle,
    FramingStyle,
    Color,
    DateFormat,
    PostmarkPublication,
    PostmarkPublicationReference,
    PostmarkColor,
    PostmarkDatesSeen,
    PostmarkSize,
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
            .select_related('postmark_shape', 'state')
            .order_by('postmark_id')
        )


admin.site.register(ListingImage, PostmarkImageAdmin)
admin.site.register(PostmarkShape, PostmarkShapeAdmin)
admin.site.register(LetteringStyle, LetteringStyleAdmin)
admin.site.register(FramingStyle, FramingStyleAdmin)
admin.site.register(Color, ColorAdmin)
admin.site.register(DateFormat, DateFormatAdmin)
admin.site.register(PostmarkPublication, PostmarkPublicationAdmin)
admin.site.register(PostmarkPublicationReference, PostmarkPublicationReferenceAdmin)
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


@admin.register(PostmarkColor)
class PostmarkColorAdmin(TimestampedModelAdmin):
    list_display = ['postmark', 'color']
    raw_id_fields = ['postmark', 'color']


@admin.register(PostmarkDatesSeen)
class PostmarkDatesSeenAdmin(TimestampedModelAdmin):
    list_display = ['postmark', 'earliest_date_seen', 'latest_date_seen']
    raw_id_fields = ['postmark']


@admin.register(PostmarkSize)
class PostmarkSizeAdmin(TimestampedModelAdmin):
    list_display = ['postmark', 'width', 'height', 'size_notes']
    raw_id_fields = ['postmark']


@admin.register(PostmarkValuation)
class PostmarkValuationAdmin(TimestampedModelAdmin):
    list_display = ['postmark', 'estimated_value', 'valuation_date', 'valued_by_user']
    raw_id_fields = ['postmark', 'valued_by_user']


@admin.register(PostcoverPostmark)
class PostcoverPostmarkAdmin(InlineRevisionMixin, TimestampedModelAdmin):
    list_display = ['postcover', 'postmark', 'position_order', 'postmark_location']
    raw_id_fields = ['postcover', 'postmark']
