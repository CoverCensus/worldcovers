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
)

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
)


admin.site.register(Listing, PostmarkAdmin)
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
