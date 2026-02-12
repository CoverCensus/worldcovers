###################################################################################################
## WoCo Commons - Admin Panel Configuration
## MPC: 2025/10/24
###################################################################################################
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group

from import_export import resources, fields
from import_export.admin import ImportExportModelAdmin
from import_export.widgets import ForeignKeyWidget

from reversion.admin import VersionAdmin
from reversion_compare.admin import CompareVersionAdmin

from .models import (
    PostalFacility, PostalFacilityIdentity,
    AdministrativeUnit, AdministrativeUnitIdentity, AdministrativeUnitResponsibility,
    JurisdictionalAffiliation,
    PostmarkShape, LetteringStyle, FramingStyle, Color, DateFormat,
    Postmark, PostmarkColor, PostmarkDatesSeen, PostmarkSize,
    PostmarkValuation, PostmarkPublication, PostmarkPublicationReference,
    PostmarkImage, Postcover, PostcoverPostmark, PostcoverImage
)

User = get_user_model()


# ========== BASE ABSTRACT MODELS ==========

class TimestampedModelAdmin(ImportExportModelAdmin):
    """Base admin for models using TimestampedModel"""
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        obj.modified_by = request.user
        super().save_model(request, obj, form, change)


class InlineRevisionMixin:
    """
    Ensures created_by and modified_by fields are populated on inline objects.
    We set the fields on the instances, then let Django's normal save logic run.
    """
    def save_formset(self, request, form, formset, change):
        # Get instances but do NOT save yet
        instances = formset.save(commit=False)

        for obj in instances:
            # New objects: set created_by if it exists and isn't set yet
            if hasattr(obj, "created_by") and getattr(obj, "created_by_id", None) is None:
                obj.created_by = request.user

            # All objects: bump modified_by if field exists
            if hasattr(obj, "modified_by"):
                obj.modified_by = request.user

        # Save m2m relations
        formset.save_m2m()
    

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


class ReversionAdminBase(CompareVersionAdmin, admin.ModelAdmin):
    """
    Base admin that enables django-reversion history + compare.
    """
    pass


class ReversionImportExportAdmin(CompareVersionAdmin, ImportExportModelAdmin):
    """
    Base admin for models that already use ImportExportModelAdmin.
    """
    pass


# ========== RESOURCES (for Import-Export) ==========

class PostalFacilityResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = PostalFacility
        import_id_fields = ['postal_facility_id']


class PostalFacilityIdentityResource(TimestampedModelResource):
    postal_facility = fields.Field(
        column_name='postal_facility',
        attribute='postal_facility',
        widget=ForeignKeyWidget(PostalFacility, 'postal_facility_id')
    )
    
    class Meta(TimestampedModelResource.Meta):
        model = PostalFacilityIdentity
        import_id_fields = ['postal_facility_identity_id']


class AdministrativeUnitResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = AdministrativeUnit
        import_id_fields = ['administrative_unit_id']


class AdministrativeUnitIdentityResource(TimestampedModelResource):
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
    
    class Meta:
        model = AdministrativeUnitIdentity
        import_id_fields = ['administrative_unit_identity_id']


class AdministrativeUnitResponsibilityResource(TimestampedModelResource):
    administrative_unit = fields.Field(
        column_name='administrative_unit',
        attribute='administrative_unit',
        widget=ForeignKeyWidget(AdministrativeUnit, 'administrative_unit_id')
    )
    group = fields.Field(
        column_name='group',
        attribute='group',
        widget=ForeignKeyWidget(Group, 'id')
    )
    
    class Meta(TimestampedModelResource.Meta):
        model = AdministrativeUnitResponsibility
        import_id_fields = ['administrative_unit_responsibility_id']


class JurisdictionalAffiliationResource(TimestampedModelResource):
    postal_facility_identity = fields.Field(
        column_name='postal_facility_identity',
        attribute='postal_facility_identity',
        widget=ForeignKeyWidget(PostalFacilityIdentity, 'postal_facility_identity_id')
    )
    administrative_unit = fields.Field(
        column_name='administrative_unit',
        attribute='administrative_unit',
        widget=ForeignKeyWidget(AdministrativeUnit, 'administrative_unit_id')
    )
    
    class Meta(TimestampedModelResource.Meta):
        model = JurisdictionalAffiliation
        import_id_fields = ['jurisdictional_affiliation_id']


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
        import_id_fields = ['color_id']


class DateFormatResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = DateFormat
        import_id_fields = ['date_format_id']


class PostmarkResource(TimestampedModelResource):
    postal_facility_identity = fields.Field(
        column_name='postal_facility_identity',
        attribute='postal_facility_identity',
        widget=ForeignKeyWidget(PostalFacilityIdentity, 'postal_facility_identity_id')
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


# ========== GEOGRAPHIC ADMIN ==========

class PostalFacilityIdentityInline(admin.TabularInline):
    model = PostalFacilityIdentity
    extra = 1
    fields = ['facility_name', 'facility_type', 'effective_from_date', 'effective_to_date', 'is_operational']
    exclude = ["created_by", "modified_by", "created_date", "modified_date"]


@admin.register(PostalFacility)
class PostalFacilityAdmin(InlineRevisionMixin, TimestampedModelAdmin):
    resource_class = PostalFacilityResource
    list_display = ['reference_code', 'get_current_name', 'latitude', 'longitude']
    search_fields = ['reference_code']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    inlines = [PostalFacilityIdentityInline]
    
    def get_current_name(self, obj):
        identity = obj.get_current_identity()
        return identity.facility_name if identity else '-'
    get_current_name.short_description = 'Current Name'


@admin.register(PostalFacilityIdentity)
class PostalFacilityIdentityAdmin(TimestampedModelAdmin):
    resource_class = PostalFacilityIdentityResource
    list_display = ['facility_name', 'postal_facility', 'facility_type', 
                    'effective_from_date', 'effective_to_date', 'is_operational']
    list_filter = ['facility_type', 'is_operational', 'effective_from_date']
    search_fields = ['facility_name', 'postal_facility__reference_code']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    raw_id_fields = ['postal_facility']
    date_hierarchy = 'effective_from_date'
    
    fieldsets = (
        ('Facility Reference', {
            'fields': ('postal_facility',)
        }),
        ('Identity Information', {
            'fields': ('facility_name', 'facility_type', 'is_operational', 'discontinuation_reason')
        }),
        ('Temporal Bounds', {
            'fields': ('effective_from_date', 'effective_to_date')
        }),
        ('Location Override (if facility moved)', {
            'fields': ('latitude', 'longitude'),
            'classes': ('collapse',)
        }),
        ('Additional Information', {
            'fields': ('notes',)
        }),
        ('Metadata', {
            'fields': ('created_date', 'modified_date', 'created_by', 'modified_by'),
            'classes': ('collapse',)
        }),
    )


class AdministrativeUnitIdentityInline(admin.TabularInline):
    model = AdministrativeUnitIdentity
    extra = 1
    fk_name = "administrative_unit"
    fields = ['unit_name', 'unit_abbreviation', 'unit_type', 'hierarchy_level',
              'effective_from_date', 'effective_to_date', 'change_reason']
    raw_id_fields = ['parent_administrative_unit']
    exclude = ["created_by", "modified_by", "created_date", "modified_date"]


class AdministrativeUnitResponsibilityInline(admin.TabularInline):
    model = AdministrativeUnitResponsibility
    extra = 1
    fields = ['group', 'is_active', 'notes']
    exclude = ["created_by", "modified_by", "created_date", "modified_date"]


@admin.register(AdministrativeUnit)
class AdministrativeUnitAdmin(InlineRevisionMixin, TimestampedModelAdmin):
    resource_class = AdministrativeUnitResource
    list_display = ['reference_code', 'get_current_name', 'get_current_type', 
                    'get_responsible_groups']
    search_fields = ['reference_code']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    inlines = [AdministrativeUnitIdentityInline, AdministrativeUnitResponsibilityInline]
    
    def get_current_name(self, obj):
        identity = obj.get_current_identity()
        return identity.unit_name if identity else '-'
    get_current_name.short_description = 'Current Name'
    
    def get_current_type(self, obj):
        identity = obj.get_current_identity()
        return identity.unit_type if identity else '-'
    get_current_type.short_description = 'Type'
    
    def get_responsible_groups(self, obj):
        groups = [resp.group.name for resp in obj.responsibilities.filter(is_active=True)]
        return ', '.join(groups) if groups else '-'
    get_responsible_groups.short_description = 'Responsible Groups'


@admin.register(AdministrativeUnitIdentity)
class AdministrativeUnitIdentityAdmin(TimestampedModelAdmin):
    resource_class = AdministrativeUnitIdentityResource
    list_display = ['unit_name', 'administrative_unit', 'unit_type', 'hierarchy_level',
                    'effective_from_date', 'effective_to_date', 'change_reason']
    list_filter = ['unit_type', 'hierarchy_level', 'change_reason', 'effective_from_date']
    search_fields = ['unit_name', 'unit_abbreviation', 'administrative_unit__reference_code']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    raw_id_fields = ['administrative_unit', 'parent_administrative_unit']
    date_hierarchy = 'effective_from_date'
    
    fieldsets = (
        ('Administrative Unit Reference', {
            'fields': ('administrative_unit', 'parent_administrative_unit')
        }),
        ('Identity Information', {
            'fields': ('unit_name', 'unit_abbreviation', 'unit_type', 'hierarchy_level')
        }),
        ('Temporal Bounds', {
            'fields': ('effective_from_date', 'effective_to_date', 'change_reason')
        }),
        ('Metadata', {
            'fields': ('created_date', 'created_by'),
            'classes': ('collapse',)
        }),
    )


@admin.register(AdministrativeUnitResponsibility)
class AdministrativeUnitResponsibilityAdmin(TimestampedModelAdmin):
    resource_class = AdministrativeUnitResponsibilityResource
    list_display = ['get_unit_name', 'group', 'is_active']
    list_filter = ['is_active', 'group']
    search_fields = ['administrative_unit__reference_code', 'group__name']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    raw_id_fields = ['administrative_unit']
    
    fieldsets = (
        ('Responsibility Assignment', {
            'fields': ('administrative_unit', 'group', 'is_active')
        }),
        ('Notes', {
            'fields': ('notes',)
        }),
        ('Metadata', {
            'fields': ('created_date', 'modified_date', 'created_by', 'modified_by'),
            'classes': ('collapse',)
        }),
    )
    
    def get_unit_name(self, obj):
        identity = obj.administrative_unit.get_current_identity()
        return identity.unit_name if identity else obj.administrative_unit.reference_code
    get_unit_name.short_description = 'Administrative Unit'


@admin.register(JurisdictionalAffiliation)
class JurisdictionalAffiliationAdmin(TimestampedModelAdmin):
    resource_class = JurisdictionalAffiliationResource
    list_display = ['get_facility_name', 'get_admin_unit_name', 
                    'effective_from_date', 'effective_to_date']
    list_filter = ['effective_from_date', 'administrative_unit']
    search_fields = ['postal_facility_identity__facility_name', 
                     'administrative_unit__reference_code']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    raw_id_fields = ['postal_facility_identity', 'administrative_unit']
    date_hierarchy = 'effective_from_date'
    
    fieldsets = (
        ('Affiliation', {
            'fields': ('postal_facility_identity', 'administrative_unit')
        }),
        ('Temporal Bounds', {
            'fields': ('effective_from_date', 'effective_to_date')
        }),
        ('Source', {
            'fields': ('affiliation_source',)
        }),
        ('Metadata', {
            'fields': ('created_date', 'modified_date', 'created_by', 'modified_by'),
            'classes': ('collapse',)
        }),
    )
    
    def get_facility_name(self, obj):
        return obj.postal_facility_identity.facility_name
    get_facility_name.short_description = 'Facility'
    
    def get_admin_unit_name(self, obj):
        identity = obj.get_administrative_unit_identity()
        return identity.unit_name if identity else obj.administrative_unit.reference_code
    get_admin_unit_name.short_description = 'Administrative Unit'


# ========== PHYSICAL CHARACTERISTICS ADMIN ==========

@admin.register(PostmarkShape)
class PostmarkShapeAdmin(TimestampedModelAdmin):
    resource_class = PostmarkShapeResource
    list_display = ['shape_name', 'shape_description']
    search_fields = ['shape_name', 'shape_description']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']


@admin.register(LetteringStyle)
class LetteringStyleAdmin(TimestampedModelAdmin):
    resource_class = LetteringStyleResource
    list_display = ['lettering_style_name', 'lettering_description']
    search_fields = ['lettering_style_name', 'lettering_description']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']


@admin.register(FramingStyle)
class FramingStyleAdmin(TimestampedModelAdmin):
    resource_class = FramingStyleResource
    list_display = ['framing_style_name', 'framing_description']
    search_fields = ['framing_style_name', 'framing_description']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']


@admin.register(Color)
class ColorAdmin(TimestampedModelAdmin):
    resource_class = ColorResource
    list_display = ['color_name', 'color_value']
    search_fields = ['color_name', 'color_value']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']


@admin.register(DateFormat)
class DateFormatAdmin(TimestampedModelAdmin):
    resource_class = DateFormatResource
    list_display = ['format_name', 'format_description']
    search_fields = ['format_name', 'format_description']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']


# ========== POSTMARK ADMIN ==========

class PostmarkColorInline(admin.TabularInline):
    model = PostmarkColor
    extra = 1
    raw_id_fields = ['color']
    exclude = ["created_by", "modified_by", "created_date", "modified_date"]


class PostmarkDatesSeenInline(admin.TabularInline):
    model = PostmarkDatesSeen
    extra = 1
    exclude = ["created_by", "modified_by", "created_date", "modified_date"]


class PostmarkSizeInline(admin.TabularInline):
    model = PostmarkSize
    extra = 1
    exclude = ["created_by", "modified_by", "created_date", "modified_date"]


class PostmarkValuationInline(admin.TabularInline):
    model = PostmarkValuation
    extra = 0
    raw_id_fields = ['valued_by_user']
    exclude = ["created_by", "modified_by", "created_date", "modified_date"]


class PostmarkPublicationReferenceInline(admin.TabularInline):
    model = PostmarkPublicationReference
    extra = 1
    raw_id_fields = ['postmark_publication']
    exclude = ["created_by", "modified_by", "created_date", "modified_date"]


class PostmarkImageInline(admin.TabularInline):
    model = PostmarkImage
    extra = 1
    readonly_fields = ['file_checksum']
    fields = ['original_filename', 'storage_filename', 'image_view', 'display_order','uploaded_by']
    exclude = ["created_by", "modified_by", "created_date", "modified_date"]


@admin.register(Postmark)
class PostmarkAdmin(InlineRevisionMixin, TimestampedModelAdmin):
    resource_class = PostmarkResource
    list_display = ['postmark_key', 'get_facility_name', 'get_admin_unit', 
                    'postmark_shape', 'rate_value', 'is_manuscript', 
                    'get_responsible_groups']
    list_filter = ['postmark_shape', 'lettering_style', 'framing_style',
                   'rate_location', 'is_manuscript']
    search_fields = ['postmark_key', 'postal_facility_identity__facility_name', 'rate_value']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    raw_id_fields = ['postal_facility_identity', 'postmark_shape', 'lettering_style',
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
            'fields': ('postmark_key', 'postal_facility_identity')
        }),
        ('Physical Characteristics', {
            'fields': ('postmark_shape', 'lettering_style', 'framing_style', 'date_format')
        }),
        ('Rate Information', {
            'fields': ('rate_location', 'rate_value')
        }),
        ('Additional Details', {
            'fields': ('is_manuscript', 'other_characteristics')
        }),
        ('Metadata', {
            'fields': ('created_date', 'modified_date', 'created_by', 'modified_by'),
            'classes': ('collapse',)
        }),
    )
    
    def get_facility_name(self, obj):
        return obj.postal_facility_identity.facility_name
    get_facility_name.short_description = 'Facility'
    
    def get_admin_unit(self, obj):
        affiliations = obj.postal_facility_identity.jurisdictions.filter(
            effective_to_date__isnull=True
        ).first()
        if affiliations:
            identity = affiliations.get_administrative_unit_identity()
            return identity.unit_name if identity else '-'
        return '-'
    get_admin_unit.short_description = 'Administrative Unit'
    
    def get_responsible_groups(self, obj):
        groups = obj.get_responsible_groups()
        return ', '.join([g.name for g in groups]) if groups else '-'
    get_responsible_groups.short_description = 'Responsible Groups'


@admin.register(PostmarkImage)
class PostmarkImageAdmin(TimestampedModelAdmin):
    list_display = ['get_postmark_key', 'original_filename', 'image_view', 'display_order', 'uploaded_by']
    list_filter = ['image_view']
    search_fields = ['postmark__postmark_key', 'original_filename', 'uploaded_by']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date', 'file_checksum']
    raw_id_fields = ['postmark']
    
    fieldsets = (
        ('Postmark', {
            'fields': ('postmark',)
        }),
        ('File Information', {
            'fields': ('original_filename', 'storage_filename', 'file_checksum', 
                      'mime_type', 'image_width', 'image_height', 'file_size_bytes')
        }),
        ('Display Settings', {
            'fields': ('image_view', 'image_description', 'display_order')
        }),
        ('Submission Information', {
            'fields': ('uploaded_by',)
        }),
        ('Metadata', {
            'fields': ('created_date', 'modified_date', 'created_by', 'modified_by'),
            'classes': ('collapse',)
        }),
    )
    
    def get_postmark_key(self, obj):
        return obj.postmark.postmark_key
    get_postmark_key.short_description = 'Postmark'


# ========== PUBLICATION ADMIN ==========

@admin.register(PostmarkPublication)
class PostmarkPublicationAdmin(TimestampedModelAdmin):
    list_display = ['publication_title', 'author', 'publisher', 'publication_date', 'publication_type']
    list_filter = ['publication_type', 'publication_date']
    search_fields = ['publication_title', 'author', 'publisher', 'isbn']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    date_hierarchy = 'publication_date'


@admin.register(PostmarkPublicationReference)
class PostmarkPublicationReferenceAdmin(TimestampedModelAdmin):
    list_display = ['get_postmark_key', 'get_publication_title', 'published_id', 'reference_location']
    list_filter = ['postmark_publication__publication_type']
    search_fields = ['postmark__postmark_key', 'postmark_publication__publication_title', 'published_id']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    raw_id_fields = ['postmark', 'postmark_publication']
    
    def get_postmark_key(self, obj):
        return obj.postmark.postmark_key
    get_postmark_key.short_description = 'Postmark'
    
    def get_publication_title(self, obj):
        return obj.postmark_publication.publication_title
    get_publication_title.short_description = 'Publication'


# ========== POSTCOVER ADMIN ==========

class PostcoverPostmarkInline(admin.TabularInline):
    model = PostcoverPostmark
    extra = 1
    raw_id_fields = ['postmark']
    exclude = ["created_by", "modified_by", "created_date", "modified_date"]


class PostcoverImageInline(admin.TabularInline):
    model = PostcoverImage
    extra = 1
    readonly_fields = ['file_checksum']
    fields = ['original_filename', 'storage_filename', 'image_view', 'display_order']
    exclude = ["created_by", "modified_by", "created_date", "modified_date"]


@admin.register(Postcover)
class PostcoverAdmin(InlineRevisionMixin, TimestampedModelAdmin):
    list_display = ['postcover_key', 'owner_user']
    search_fields = ['postcover_key', 'owner_user__username', 'description']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    raw_id_fields = ['owner_user']
    
    inlines = [
        PostcoverPostmarkInline,
        PostcoverImageInline,
    ]


@admin.register(PostcoverImage)
class PostcoverImageAdmin(TimestampedModelAdmin):
    list_display = ['get_postcover_key', 'original_filename', 'image_view', 
                    'display_order', 'uploaded_by']
    list_filter = ['image_view']
    search_fields = ['postcover__postcover_key', 'original_filename']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date', 'file_checksum']
    raw_id_fields = ['postcover']
    
    def get_postcover_key(self, obj):
        return obj.postcover.postcover_key
    get_postcover_key.short_description = 'Postcover'

###################################################################################################