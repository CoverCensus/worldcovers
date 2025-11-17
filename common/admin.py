###################################################################################################
## WoCo Project - Configuration
## MPC: 2025/10/24
###################################################################################################
from django.contrib import admin
from django.contrib.auth import get_user_model

from import_export import resources, fields
from import_export.admin import ImportExportModelAdmin
from import_export.widgets import ForeignKeyWidget

from .models import (
    GeographicLocation, AdministrativeUnit, GeographicAffiliation,
    AdministrativeUnitNameHistory, AdministrativeUnitHistory,
    PostmarkShape, LetteringStyle, FramingStyle, Color, DateFormat,
    Postmark, PostmarkColor, PostmarkDatesSeen, PostmarkSize,
    PostmarkValuation, PostmarkPublication, PostmarkPublicationReference,
    PostmarkImage, Postcover, PostcoverPostmark, PostcoverImage
)

User = get_user_model()


# ========== BASE ABSTRACT MODELS ==========

class TimestampedModelAdmin(ImportExportModelAdmin):
    """Base admin for models using TimestampedModel"""
    exclude = ['created_by', 'modified_by']
    readonly_fields = ['created_date', 'modified_date']
    
    def save_model(self, request, obj, form, change):
        # If creating a new object
        if not change:
            obj.created_by = request.user
        obj.modified_by = request.user
        super().save_model(request, obj, form, change)


# ========== BASE RESOURCE CLASS ==========

class TimestampedModelResource(resources.ModelResource):
    """Base resource that handles user foreign keys properly"""
    created_by = fields.Field(
        column_name='created_by',
        attribute='created_by',
        widget=ForeignKeyWidget(User, 'id')
    )
    modified_by = fields.Field(
        column_name='modified_by',
        attribute='modified_by',
        widget=ForeignKeyWidget(User, 'id')
    )
    
    class Meta:
        abstract = True
        exclude = ('id',)


# ========== RESOURCES (for Import-Export) ==========

class GeographicLocationResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = GeographicLocation
        import_id_fields = ['geographic_location_id']


class AdministrativeUnitResource(TimestampedModelResource):
    parent_administrative_unit = fields.Field(
        column_name='parent_administrative_unit',
        attribute='parent_administrative_unit',
        widget=ForeignKeyWidget(AdministrativeUnit, 'administrative_unit_id')
    )
    
    class Meta(TimestampedModelResource.Meta):
        model = AdministrativeUnit
        import_id_fields = ['administrative_unit_id']


class GeographicAffiliationResource(TimestampedModelResource):
    geographic_location = fields.Field(
        column_name='geographic_location',
        attribute='geographic_location',
        widget=ForeignKeyWidget(GeographicLocation, 'geographic_location_id')
    )
    administrative_unit = fields.Field(
        column_name='administrative_unit',
        attribute='administrative_unit',
        widget=ForeignKeyWidget(AdministrativeUnit, 'administrative_unit_id')
    )
    
    class Meta(TimestampedModelResource.Meta):
        model = GeographicAffiliation
        import_id_fields = ['geographic_affiliation_id']


class AdministrativeUnitNameHistoryResource(resources.ModelResource):
    administrative_unit = fields.Field(
        column_name='administrative_unit',
        attribute='administrative_unit',
        widget=ForeignKeyWidget(AdministrativeUnit, 'administrative_unit_id')
    )
    created_by = fields.Field(
        column_name='created_by',
        attribute='created_by',
        widget=ForeignKeyWidget(User, 'id')
    )
    
    class Meta:
        model = AdministrativeUnitNameHistory
        exclude = ('id',)
        import_id_fields = ['administrative_unit_name_history_id']


class AdministrativeUnitHistoryResource(resources.ModelResource):
    administrative_unit = fields.Field(
        column_name='administrative_unit',
        attribute='administrative_unit',
        widget=ForeignKeyWidget(AdministrativeUnit, 'administrative_unit_id')
    )
    parent_administrative_unit = fields.Field(
        column_name='parent_administrative_unit',
        attribute='parent_administrative_unit',
        widget=ForeignKeyWidget(AdministrativeUnit, 'administrative_unit_id')
    )
    created_by = fields.Field(
        column_name='created_by',
        attribute='created_by',
        widget=ForeignKeyWidget(User, 'id')
    )
    
    class Meta:
        model = AdministrativeUnitHistory
        exclude = ('id',)
        import_id_fields = ['administrative_unit_history_id']


class PostmarkShapeResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = PostmarkShape
        import_id_fields = ['postmark_shape_id']


class LetteringStyleResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = LetteringStyle
        import_id_fields = ['lettering_style_id']


class FramingStyleResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = FramingStyle
        import_id_fields = ['framing_style_id']


class ColorResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = Color
        import_id_fields = ['color_id']  # This is the key fix!


class DateFormatResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = DateFormat
        import_id_fields = ['date_format_id']


class PostmarkResource(TimestampedModelResource):
    geographic_location = fields.Field(
        column_name='geographic_location',
        attribute='geographic_location',
        widget=ForeignKeyWidget(GeographicLocation, 'geographic_location_id')
    )
    postmark_shape = fields.Field(
        column_name='postmark_shape',
        attribute='postmark_shape',
        widget=ForeignKeyWidget(PostmarkShape, 'postmark_shape_id')
    )
    lettering_style = fields.Field(
        column_name='lettering_style',
        attribute='lettering_style',
        widget=ForeignKeyWidget(LetteringStyle, 'lettering_style_id')
    )
    framing_style = fields.Field(
        column_name='framing_style',
        attribute='framing_style',
        widget=ForeignKeyWidget(FramingStyle, 'framing_style_id')
    )
    date_format = fields.Field(
        column_name='date_format',
        attribute='date_format',
        widget=ForeignKeyWidget(DateFormat, 'date_format_id')
    )
    
    class Meta(TimestampedModelResource.Meta):
        model = Postmark
        import_id_fields = ['postmark_id']


class PostmarkColorResource(resources.ModelResource):
    postmark = fields.Field(
        column_name='postmark',
        attribute='postmark',
        widget=ForeignKeyWidget(Postmark, 'postmark_id')
    )
    color = fields.Field(
        column_name='color',
        attribute='color',
        widget=ForeignKeyWidget(Color, 'color_id')
    )
    created_by = fields.Field(
        column_name='created_by',
        attribute='created_by',
        widget=ForeignKeyWidget(User, 'id')
    )
    
    class Meta:
        model = PostmarkColor
        exclude = ('id',)
        import_id_fields = ['postmark_color_id']


class PostmarkDatesSeenResource(resources.ModelResource):
    postmark = fields.Field(
        column_name='postmark',
        attribute='postmark',
        widget=ForeignKeyWidget(Postmark, 'postmark_id')
    )
    created_by = fields.Field(
        column_name='created_by',
        attribute='created_by',
        widget=ForeignKeyWidget(User, 'id')
    )
    
    class Meta:
        model = PostmarkDatesSeen
        exclude = ('id',)
        import_id_fields = ['postmark_dates_seen_id']


class PostmarkSizeResource(resources.ModelResource):
    postmark = fields.Field(
        column_name='postmark',
        attribute='postmark',
        widget=ForeignKeyWidget(Postmark, 'postmark_id')
    )
    created_by = fields.Field(
        column_name='created_by',
        attribute='created_by',
        widget=ForeignKeyWidget(User, 'id')
    )
    
    class Meta:
        model = PostmarkSize
        exclude = ('id',)
        import_id_fields = ['postmark_size_id']


class PostmarkValuationResource(TimestampedModelResource):
    postmark = fields.Field(
        column_name='postmark',
        attribute='postmark',
        widget=ForeignKeyWidget(Postmark, 'postmark_id')
    )
    valued_by_user = fields.Field(
        column_name='valued_by_user',
        attribute='valued_by_user',
        widget=ForeignKeyWidget(User, 'id')
    )
    
    class Meta(TimestampedModelResource.Meta):
        model = PostmarkValuation
        import_id_fields = ['postmark_valuation_id']


class PostmarkPublicationResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = PostmarkPublication
        import_id_fields = ['postmark_publication_id']


class PostmarkPublicationReferenceResource(resources.ModelResource):
    postmark = fields.Field(
        column_name='postmark',
        attribute='postmark',
        widget=ForeignKeyWidget(Postmark, 'postmark_id')
    )
    postmark_publication = fields.Field(
        column_name='postmark_publication',
        attribute='postmark_publication',
        widget=ForeignKeyWidget(PostmarkPublication, 'postmark_publication_id')
    )
    created_by = fields.Field(
        column_name='created_by',
        attribute='created_by',
        widget=ForeignKeyWidget(User, 'id')
    )
    
    class Meta:
        model = PostmarkPublicationReference
        exclude = ('id',)
        import_id_fields = ['postmark_publication_reference_id']


class PostmarkImageResource(TimestampedModelResource):
    postmark = fields.Field(
        column_name='postmark',
        attribute='postmark',
        widget=ForeignKeyWidget(Postmark, 'postmark_id')
    )
    
    class Meta(TimestampedModelResource.Meta):
        model = PostmarkImage
        import_id_fields = ['postmark_image_id']


class PostcoverResource(TimestampedModelResource):
    owner_user = fields.Field(
        column_name='owner_user',
        attribute='owner_user',
        widget=ForeignKeyWidget(User, 'id')
    )
    
    class Meta(TimestampedModelResource.Meta):
        model = Postcover
        import_id_fields = ['postcover_id']


class PostcoverPostmarkResource(resources.ModelResource):
    postcover = fields.Field(
        column_name='postcover',
        attribute='postcover',
        widget=ForeignKeyWidget(Postcover, 'postcover_id')
    )
    postmark = fields.Field(
        column_name='postmark',
        attribute='postmark',
        widget=ForeignKeyWidget(Postmark, 'postmark_id')
    )
    created_by = fields.Field(
        column_name='created_by',
        attribute='created_by',
        widget=ForeignKeyWidget(User, 'id')
    )
    
    class Meta:
        model = PostcoverPostmark
        exclude = ('id',)
        import_id_fields = ['postcover_postmark_id']


class PostcoverImageResource(TimestampedModelResource):
    postcover = fields.Field(
        column_name='postcover',
        attribute='postcover',
        widget=ForeignKeyWidget(Postcover, 'postcover_id')
    )
    uploaded_by_user = fields.Field(
        column_name='uploaded_by_user',
        attribute='uploaded_by_user',
        widget=ForeignKeyWidget(User, 'id')
    )
    
    class Meta(TimestampedModelResource.Meta):
        model = PostcoverImage
        import_id_fields = ['postcover_image_id']
        

# ========== GEOGRAPHIC ADMIN ==========

@admin.register(GeographicLocation)
class GeographicLocationAdmin(TimestampedModelAdmin):
    resource_class = GeographicLocationResource
    list_display = ['location_name', 'location_type', 'latitude', 'longitude', 'created_date']
    list_filter = ['location_type', 'created_date']
    search_fields = ['location_name']
    readonly_fields = ['created_date', 'modified_date']


@admin.register(AdministrativeUnit)
class AdministrativeUnitAdmin(TimestampedModelAdmin):
    resource_class = AdministrativeUnitResource
    list_display = ['unit_name', 'unit_abbreviation', 'unit_type', 'hierarchy_level', 'is_active']
    list_filter = ['unit_type', 'hierarchy_level', 'is_active']
    search_fields = ['unit_name', 'unit_abbreviation']
    readonly_fields = ['created_date', 'modified_date']
    raw_id_fields = ['parent_administrative_unit']


@admin.register(GeographicAffiliation)
class GeographicAffiliationAdmin(TimestampedModelAdmin):
    resource_class = GeographicAffiliationResource
    list_display = ['geographic_location', 'administrative_unit', 'effective_from_date', 'effective_to_date']
    list_filter = ['effective_from_date', 'administrative_unit__unit_type']
    search_fields = ['geographic_location__location_name', 'administrative_unit__unit_name']
    readonly_fields = ['created_date', 'modified_date']
    raw_id_fields = ['geographic_location', 'administrative_unit']
    date_hierarchy = 'effective_from_date'


@admin.register(AdministrativeUnitNameHistory)
class AdministrativeUnitNameHistoryAdmin(TimestampedModelAdmin):
    resource_class = AdministrativeUnitNameHistoryResource
    list_display = ['administrative_unit', 'historical_name', 'historical_abbreviation', 
                    'effective_from_date', 'effective_to_date']
    list_filter = ['effective_from_date']
    search_fields = ['historical_name', 'administrative_unit__unit_name']
    readonly_fields = ['created_date']
    raw_id_fields = ['administrative_unit']
    date_hierarchy = 'effective_from_date'


@admin.register(AdministrativeUnitHistory)
class AdministrativeUnitHistoryAdmin(TimestampedModelAdmin):
    resource_class = AdministrativeUnitHistoryResource
    list_display = ['administrative_unit', 'unit_name', 'change_reason', 
                    'effective_from_date', 'effective_to_date', 'is_active']
    list_filter = ['change_reason', 'unit_type', 'is_active', 'effective_from_date']
    search_fields = ['unit_name', 'administrative_unit__unit_name']
    readonly_fields = ['created_date']
    raw_id_fields = ['administrative_unit', 'parent_administrative_unit']
    date_hierarchy = 'effective_from_date'


# ========== PHYSICAL CHARACTERISTICS ADMIN ==========

@admin.register(PostmarkShape)
class PostmarkShapeAdmin(TimestampedModelAdmin):
    resource_class = PostmarkShapeResource
    list_display = ['shape_name', 'shape_description', 'created_date']
    search_fields = ['shape_name', 'shape_description']
    readonly_fields = ['created_date', 'modified_date']


@admin.register(LetteringStyle)
class LetteringStyleAdmin(TimestampedModelAdmin):
    resource_class = LetteringStyleResource
    list_display = ['lettering_style_name', 'lettering_description', 'created_date']
    search_fields = ['lettering_style_name', 'lettering_description']
    readonly_fields = ['created_date', 'modified_date']


@admin.register(FramingStyle)
class FramingStyleAdmin(TimestampedModelAdmin):
    resource_class = FramingStyleResource
    list_display = ['framing_style_name', 'framing_description', 'created_date']
    search_fields = ['framing_style_name', 'framing_description']
    readonly_fields = ['created_date', 'modified_date']


@admin.register(Color)
class ColorAdmin(TimestampedModelAdmin):
    resource_class = ColorResource
    list_display = ['color_name', 'color_value']
    search_fields = ['color_name', 'color_value']
    readonly_fields = ['created_date', 'modified_date']


@admin.register(DateFormat)
class DateFormatAdmin(TimestampedModelAdmin):
    resource_class = DateFormatResource
    list_display = ['format_name', 'format_description', 'created_date']
    search_fields = ['format_name', 'format_description']
    readonly_fields = ['created_date', 'modified_date']


# ========== POSTMARK ADMIN ==========

class PostmarkColorInline(admin.TabularInline):
    model = PostmarkColor
    extra = 1
    raw_id_fields = ['color']


class PostmarkDatesSeenInline(admin.TabularInline):
    model = PostmarkDatesSeen
    extra = 1


class PostmarkSizeInline(admin.TabularInline):
    model = PostmarkSize
    extra = 1


class PostmarkValuationInline(admin.TabularInline):
    model = PostmarkValuation
    extra = 0
    raw_id_fields = ['valued_by_user']


class PostmarkPublicationReferenceInline(admin.TabularInline):
    model = PostmarkPublicationReference
    extra = 1
    raw_id_fields = ['postmark_publication']


class PostmarkImageInline(admin.TabularInline):
    model = PostmarkImage
    extra = 1
    readonly_fields = ['created_date', 'modified_date', 'file_checksum']
    fields = ['original_filename', 'storage_filename', 'image_view', 'display_order', 
              'image_status', 'submitter_name', 'submitter_email']


@admin.register(Postmark)
class PostmarkAdmin(TimestampedModelAdmin):
    resource_class = PostmarkResource
    list_display = ['postmark_key', 'geographic_location', 'postmark_shape', 
                    'rate_location', 'rate_value', 'condition', 'is_manuscript', 'created_date']
    list_filter = ['postmark_shape', 'lettering_style', 'framing_style', 
                   'rate_location', 'condition', 'is_manuscript', 'created_date']
    search_fields = ['postmark_key', 'geographic_location__location_name', 'rate_value']
    readonly_fields = ['created_date', 'modified_date']
    raw_id_fields = ['geographic_location', 'postmark_shape', 'lettering_style', 
                     'framing_style', 'date_format']
    
    inlines = [
        PostmarkColorInline,
        PostmarkDatesSeenInline,
        PostmarkSizeInline,
        PostmarkValuationInline,
        PostmarkPublicationReferenceInline,
        PostmarkImageInline,
    ]
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('postmark_key', 'geographic_location')
        }),
        ('Physical Characteristics', {
            'fields': ('postmark_shape', 'lettering_style', 'framing_style', 'date_format', 'condition')
        }),
        ('Rate Information', {
            'fields': ('rate_location', 'rate_value')
        }),
        ('Additional Details', {
            'fields': ('is_manuscript', 'other_characteristics')
        }),
        ('Metadata', {
            'fields': ('created_date', 'modified_date'),
            'classes': ('collapse',)
        }),
    )


@admin.register(PostmarkColor)
class PostmarkColorAdmin(TimestampedModelAdmin):
    resource_class = PostmarkColorResource
    list_display = ['postmark', 'color', 'created_date']
    list_filter = ['color', 'created_date']
    search_fields = ['postmark__postmark_key']
    readonly_fields = ['created_date']
    raw_id_fields = ['postmark', 'color']


@admin.register(PostmarkDatesSeen)
class PostmarkDatesSeenAdmin(TimestampedModelAdmin):
    resource_class = PostmarkDatesSeenResource
    list_display = ['postmark', 'earliest_date_seen', 'latest_date_seen', 'created_date']
    list_filter = ['earliest_date_seen', 'latest_date_seen']
    search_fields = ['postmark__postmark_key']
    readonly_fields = ['created_date']
    raw_id_fields = ['postmark']
    date_hierarchy = 'earliest_date_seen'


@admin.register(PostmarkSize)
class PostmarkSizeAdmin(TimestampedModelAdmin):
    resource_class = PostmarkSizeResource
    list_display = ['postmark', 'width', 'height', 'size_notes', 'created_date']
    search_fields = ['postmark__postmark_key', 'size_notes']
    readonly_fields = ['created_date']
    raw_id_fields = ['postmark']


@admin.register(PostmarkValuation)
class PostmarkValuationAdmin(TimestampedModelAdmin):
    resource_class = PostmarkValuationResource
    list_display = ['postmark', 'estimated_value', 'valuation_date', 'valued_by_user']
    list_filter = ['valuation_date']
    search_fields = ['postmark__postmark_key']
    readonly_fields = ['created_date', 'modified_date']
    raw_id_fields = ['postmark', 'valued_by_user']
    date_hierarchy = 'valuation_date'


# ========== PUBLICATION ADMIN ==========

@admin.register(PostmarkPublication)
class PostmarkPublicationAdmin(TimestampedModelAdmin):
    resource_class = PostmarkPublicationResource
    list_display = ['publication_title', 'author', 'publisher', 'publication_date', 'publication_type']
    list_filter = ['publication_type', 'publication_date']
    search_fields = ['publication_title', 'author', 'publisher', 'isbn']
    readonly_fields = ['created_date', 'modified_date']
    date_hierarchy = 'publication_date'


@admin.register(PostmarkPublicationReference)
class PostmarkPublicationReferenceAdmin(TimestampedModelAdmin):
    resource_class = PostmarkPublicationReferenceResource
    list_display = ['postmark', 'postmark_publication', 'published_id', 'reference_location']
    list_filter = ['postmark_publication__publication_type']
    search_fields = ['postmark__postmark_key', 'postmark_publication__publication_title', 'published_id']
    readonly_fields = ['created_date']
    raw_id_fields = ['postmark', 'postmark_publication']


# ========== IMAGE ADMIN ==========

@admin.register(PostmarkImage)
class PostmarkImageAdmin(TimestampedModelAdmin):
    resource_class = PostmarkImageResource
    list_display = ['postmark', 'original_filename', 'image_view', 'display_order', 
                    'image_status', 'submitter_name', 'created_date']
    list_filter = ['image_view', 'image_status', 'created_date']
    search_fields = ['postmark__postmark_key', 'original_filename', 'submitter_name', 'submitter_email']
    readonly_fields = ['created_date', 'modified_date', 'file_checksum']
    raw_id_fields = ['postmark']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('postmark', 'original_filename', 'storage_filename')
        }),
        ('File Metadata', {
            'fields': ('file_checksum', 'mime_type', 'image_width', 'image_height', 'file_size_bytes')
        }),
        ('Display Settings', {
            'fields': ('image_view', 'image_description', 'display_order', 'image_status')
        }),
        ('Submission Information', {
            'fields': ('submitter_name', 'submitter_email')
        }),
        ('Timestamps', {
            'fields': ('created_date', 'modified_date', 'created_by', 'modified_by'),
            'classes': ('collapse',)
        }),
    )


# ========== POSTCOVER ADMIN ==========

class PostcoverPostmarkInline(admin.TabularInline):
    model = PostcoverPostmark
    extra = 1
    raw_id_fields = ['postmark']


class PostcoverImageInline(admin.TabularInline):
    model = PostcoverImage
    extra = 1
    readonly_fields = ['created_date', 'modified_date', 'file_checksum']
    fields = ['original_filename', 'storage_filename', 'image_view', 'display_order']


@admin.register(Postcover)
class PostcoverAdmin(TimestampedModelAdmin):
    resource_class = PostcoverResource
    list_display = ['postcover_key', 'owner_user', 'condition', 'created_date']
    list_filter = ['condition', 'created_date']
    search_fields = ['postcover_key', 'owner_user__username', 'description']
    readonly_fields = ['created_date', 'modified_date']
    raw_id_fields = ['owner_user']
    
    inlines = [
        PostcoverPostmarkInline,
        PostcoverImageInline,
    ]


@admin.register(PostcoverPostmark)
class PostcoverPostmarkAdmin(TimestampedModelAdmin):
    resource_class = PostcoverPostmarkResource
    list_display = ['postcover', 'postmark', 'position_order', 'postmark_location', 'created_date']
    list_filter = ['postmark_location', 'created_date']
    search_fields = ['postcover__postcover_key', 'postmark__postmark_key']
    readonly_fields = ['created_date']
    raw_id_fields = ['postcover', 'postmark']


@admin.register(PostcoverImage)
class PostcoverImageAdmin(TimestampedModelAdmin):
    resource_class = PostcoverImageResource
    list_display = ['postcover', 'original_filename', 'image_view', 'display_order', 
                    'uploaded_by_user', 'created_date']
    list_filter = ['image_view', 'created_date']
    search_fields = ['postcover__postcover_key', 'original_filename']
    readonly_fields = ['created_date', 'modified_date', 'file_checksum']
    raw_id_fields = ['postcover', 'uploaded_by_user']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('postcover', 'original_filename', 'storage_filename', 'uploaded_by_user')
        }),
        ('File Metadata', {
            'fields': ('file_checksum', 'mime_type', 'image_width', 'image_height', 'file_size_bytes')
        }),
        ('Display Settings', {
            'fields': ('image_view', 'image_description', 'display_order')
        }),
        ('Timestamps', {
            'fields': ('created_date', 'modified_date', 'created_by', 'modified_by'),
            'classes': ('collapse',)
        }),
    )

###################################################################################################
