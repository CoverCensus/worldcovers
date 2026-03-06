###################################################################################################
## WoCo Commons - Admin Panel Configuration
## MPC: 2025/10/24
###################################################################################################
import csv
import io

from django.contrib import admin
from django.contrib.admin.sites import NotRegistered
from django.contrib.admin.widgets import FilteredSelectMultiple
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils.html import format_html
from django.core.paginator import Paginator
from django.utils.functional import cached_property
from django import forms
from django.contrib import messages
from django.db import connection

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
    PostmarkImage, Postcover, PostcoverPostmark, PostcoverImage,
    LegacyAbbreviation, LegacyRateLocation, LegacyRateValue,
    LegacyParseStep, LegacyUserState, LegacyRawStateDataPendingUpdate, LegacyCover,
    AdminCsvUpload, UserLocationAssignment,
)
from .csv_import import IMPORTERS
from .utils import get_canonical_location_reference_codes

User = get_user_model()


def _user_location_table_available() -> bool:
    """True if UserLocationAssignments table exists (for load/save of chosen locations)."""
    try:
        UserLocationAssignment.objects.only("pk").first()
        return True
    except Exception:
        return False


# ========== BASE ABSTRACT MODELS ==========

class NoCountPaginator(Paginator):
    @cached_property
    def count(self):
        return 10_000_000


class TimestampedModelAdmin(ImportExportModelAdmin):
    """Base admin for models using TimestampedModel"""
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    show_full_result_count = False
    list_per_page = 50
    list_max_show_all = 200

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
        ('Location Reference', {
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
    get_unit_name.short_description = 'Location'


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
    get_admin_unit_name.short_description = 'Location'


# ========== PHYSICAL CHARACTERISTICS ADMIN ==========

class PostmarkShapeAdmin(TimestampedModelAdmin):
    resource_class = PostmarkShapeResource
    list_display = ['shape_name', 'shape_description']
    search_fields = ['shape_name', 'shape_description']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']


class LetteringStyleAdmin(TimestampedModelAdmin):
    resource_class = LetteringStyleResource
    list_display = ['lettering_style_name', 'lettering_description']
    search_fields = ['lettering_style_name', 'lettering_description']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']


class FramingStyleAdmin(TimestampedModelAdmin):
    resource_class = FramingStyleResource
    list_display = ['framing_style_name', 'framing_description']
    search_fields = ['framing_style_name', 'framing_description']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']


class ColorAdmin(TimestampedModelAdmin):
    resource_class = ColorResource
    list_display = ['color_name', 'color_value']
    search_fields = ['color_name', 'color_value']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']


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


class ExampleCoverInline(admin.TabularInline):
    """Example Covers attached to this Listing via PostcoverPostmark"""
    model = PostcoverPostmark
    extra = 1
    raw_id_fields = ['postcover']
    fields = ['postcover', 'position_order', 'postmark_location']
    exclude = ["created_by", "modified_by", "created_date", "modified_date"]


class PostmarkAdmin(InlineRevisionMixin, TimestampedModelAdmin):
    resource_class = PostmarkResource
    list_display = ['postmark_key', 'get_postmark_shape_display', 'state', 'rate_value', 'visibility']
    list_filter = ['state']
    search_fields = ['postmark_key', 'postal_facility_identity__facility_name', 'rate_value', 'public_slug', 'raw_state_data_id']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    raw_id_fields = ['site', 'postal_facility_identity', 'state', 'postmark_shape', 'lettering_style',
                     'framing_style', 'date_format']
    
    inlines = [
        PostmarkColorInline,
        PostmarkDatesSeenInline,
        PostmarkSizeInline,
        PostmarkValuationInline,
        PostmarkPublicationReferenceInline,
        PostmarkImageInline,
        ExampleCoverInline,
    ]
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('postmark_key', 'site', 'postal_facility_identity', 'state')
        }),
        ('Listing Status & Source', {
            'fields': ('visibility', 'public_slug', 'source_catalog', 'source_page', 'last_public_update_at')
        }),
        ('Import Linkage', {
            'fields': ('raw_state_data_id', 'raw_import_payload'),
            'classes': ('collapse',)
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
    
    def get_postmark_shape_display(self, obj):
        """Safe list_display for postmark_shape so one bad FK does not break the changelist."""
        try:
            return obj.postmark_shape if obj.postmark_shape_id else '-'
        except Exception:
            return '-'
    get_postmark_shape_display.short_description = 'Postmark shape'

    def get_facility_name(self, obj):
        if not obj.postal_facility_identity:
            return '-'
        return obj.postal_facility_identity.facility_name
    get_facility_name.short_description = 'Facility'
    
    def get_admin_unit(self, obj):
        if not obj.postal_facility_identity:
            return '-'
        affiliations = obj.postal_facility_identity.jurisdictions.filter(
            effective_to_date__isnull=True
        ).first()
        if affiliations:
            identity = affiliations.get_administrative_unit_identity()
            return identity.unit_name if identity else '-'
        return '-'
    get_admin_unit.short_description = 'Location'
    
    def get_responsible_groups(self, obj):
        groups = obj.get_responsible_groups()
        return ', '.join([g.name for g in groups]) if groups else '-'
    get_responsible_groups.short_description = 'Responsible Groups'

    def example_cover_count(self, obj):
        return obj.postcover_postmarks.count()
    example_cover_count.short_description = 'Example Covers'

    def example_cover_link(self, obj):
        url = (
            reverse('admin:common_postcover_changelist')
            + f"?postcover_postmarks__postmark__postmark_id__exact={obj.postmark_id}"
        )
        return format_html('<a href="{}">View</a>', url)
    example_cover_link.short_description = 'Example Covers Link'


class PostmarkImageAdmin(TimestampedModelAdmin):
    list_display = ['get_postmark_key', 'original_filename', 'image_view', 'display_order', 'uploaded_by']
    list_filter = ['image_view']
    search_fields = ['postmark__postmark_key', 'original_filename', 'uploaded_by']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date', 'file_checksum']
    raw_id_fields = ['postmark']
    # Avoid slow COUNT(*) on large tables in production (prevents 502 from timeout)
    paginator = NoCountPaginator

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.select_related('postmark', 'uploaded_by').order_by('-postmark_image_id')

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
        """
        Safe accessor for the related postmark key so that a broken
        foreign key does not crash the changelist view.
        """
        try:
            if obj.postmark_id:
                return obj.postmark.postmark_key
        except Exception:
            # If the FK is stale or the related Postmark row is missing,
            # fall back to a neutral placeholder so the row can still render.
            return '-'
        return '-'
    get_postmark_key.short_description = 'Postmark'


# ========== PUBLICATION ADMIN ==========

class PostmarkPublicationAdmin(TimestampedModelAdmin):
    list_display = ['publication_title', 'author', 'publisher', 'publication_date', 'publication_type']
    list_filter = ['publication_type', 'publication_date']
    search_fields = ['publication_title', 'author', 'publisher', 'isbn']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    date_hierarchy = 'publication_date'


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


class PostcoverAdmin(InlineRevisionMixin, TimestampedModelAdmin):
    list_display = ['postcover_key', 'owner_user']
    search_fields = ['postcover_key', 'owner_user__username', 'description']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    raw_id_fields = ['owner_user']
    
    inlines = [
        PostcoverPostmarkInline,
        PostcoverImageInline,
    ]


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


def _parse_csv_file(uploaded_file) -> dict:
    """Parse CSV file. Returns { headers: [...], rows: [[...], ...] }."""
    content = uploaded_file.read()
    if isinstance(content, bytes):
        content = content.decode('utf-8', errors='replace')
    reader = csv.reader(io.StringIO(content), quoting=csv.QUOTE_MINIMAL)
    rows = list(reader)
    if not rows:
        return {'headers': [], 'rows': []}
    return {'headers': rows[0], 'rows': rows[1:]}


class AdminCsvUploadForm(forms.ModelForm):
    """Form with optional CSV file upload. File is required when adding a new upload."""
    csv_file = forms.FileField(
        label='CSV file',
        required=False,
        help_text='Upload a CSV (e.g. tblTownmarkDateFormat.csv). Required when adding new.',
    )

    class Meta:
        model = AdminCsvUpload
        fields = ['name']  # csv_file is form-only, not a model field

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['name'].required = False
        self.fields['name'].help_text = 'Display name (optional; defaults to filename).'
        if self.instance and self.instance.pk:
            self.fields['csv_file'].help_text = 'Leave empty to keep existing data. Upload a new file to replace.'

    def clean(self):
        data = super().clean()
        if not self.instance.pk and not self.files.get('csv_file'):
            raise forms.ValidationError('Please upload a CSV file when adding a new upload.')
        return data


# ========== LEGACY ERD TABLES (read-only friendly) ==========


@admin.register(LegacyAbbreviation)
class LegacyAbbreviationAdmin(admin.ModelAdmin):
    list_display = ['id', 'txt_abbreviation', 'txt_meaning', 'n_order', 'yn_active']
    list_filter = ['yn_active']
    search_fields = ['txt_abbreviation', 'txt_meaning']
    ordering = ['n_order', 'txt_abbreviation']


@admin.register(LegacyRateLocation)
class LegacyRateLocationAdmin(admin.ModelAdmin):
    list_display = ['id', 'txt_townmark_rate_location', 'n_order', 'yn_active']
    list_filter = ['yn_active']
    ordering = ['n_order']


@admin.register(LegacyRateValue)
class LegacyRateValueAdmin(admin.ModelAdmin):
    list_display = ['id', 'txt_townmark_rate_value', 'n_order', 'yn_active']
    list_filter = ['yn_active']
    ordering = ['n_order']


@admin.register(LegacyParseStep)
class LegacyParseStepAdmin(admin.ModelAdmin):
    list_display = ['id', 'txt_parse_step', 'n_state_id', 'yn_completed', 'n_order', 'yn_active']
    list_filter = ['yn_completed', 'yn_active']
    search_fields = ['txt_parse_step']
    ordering = ['n_state_id', 'n_order']


@admin.register(LegacyUserState)
class LegacyUserStateAdmin(admin.ModelAdmin):
    list_display = ['id', 'n_user_id', 'n_state_id', 'mem_roles']
    list_filter = ['n_state_id']
    ordering = ['n_user_id', 'n_state_id']


@admin.register(LegacyRawStateDataPendingUpdate)
class LegacyRawStateDataPendingUpdateAdmin(admin.ModelAdmin):
    list_display = ['id', 'n_raw_state_data_id', 'n_state_id']
    list_filter = ['n_state_id']
    readonly_fields = ['payload']
    ordering = ['-id']


@admin.register(LegacyCover)
class LegacyCoverAdmin(admin.ModelAdmin):
    list_display = ['id', 'n_user_id', 'txt_cover_key_id', 'txt_state_abv', 'txt_town', 'n_estimated_value']
    list_filter = ['txt_state_abv']
    search_fields = ['txt_town', 'txt_cover_key_id', 'mem_notes']
    ordering = ['n_user_id', 'id']


@admin.register(AdminCsvUpload)
class AdminCsvUploadAdmin(admin.ModelAdmin):
    form = AdminCsvUploadForm
    list_display = ['id', 'name', 'file_name', 'uploaded_at', 'uploaded_by']
    list_filter = ['uploaded_at']
    search_fields = ['name', 'file_name']
    readonly_fields = ['uploaded_at', 'uploaded_by', 'data', 'row_count_display']
    ordering = ['-uploaded_at']
    list_per_page = 25
    actions = ['import_to_date_formats', 'import_to_lettering', 'import_to_framing', 'import_to_colors', 'import_to_states']

    def has_add_permission(self, request):
        return request.user.is_staff

    def get_queryset(self, request):
        # Select only small columns so MySQL never reads the huge Data JSON (avoids "Out of sort memory")
        return super().get_queryset(request).only(
            'id', 'name', 'file_name', 'uploaded_at', 'uploaded_by_id'
        )

    def get_fieldsets(self, request, obj=None):
        if obj is None:
            return [(None, {'fields': ['name', 'csv_file']})]
        return [
            (None, {'fields': ['name', 'file_name', 'uploaded_at', 'uploaded_by', 'row_count_display']}),
            ('Parsed data', {'fields': ['data'], 'classes': ['collapse']}),
        ]

    def row_count_display(self, obj):
        return len((obj.data or {}).get('rows') or [])
    row_count_display.short_description = 'Rows'

    def save_model(self, request, obj, form, change):
        csv_file = request.FILES.get('csv_file') or (form.files.get('csv_file') if form else None)
        if csv_file:
            try:
                obj.data = _parse_csv_file(csv_file)
                obj.file_name = csv_file.name or obj.file_name or 'upload.csv'
                if not (change and obj.name):
                    obj.name = request.POST.get('name') or csv_file.name or obj.file_name or 'Unnamed upload'
            except Exception as e:
                self.message_user(request, f'CSV parse error: {e}', level=messages.ERROR)
                return
        if not change:
            obj.uploaded_by = request.user
        super().save_model(request, obj, form, change)

    def _run_import(self, request, queryset, import_type):
        created_total = 0
        errors_all = []
        for obj in queryset:
            data = obj.data or {}
            if not data.get('rows'):
                self.message_user(request, f'Upload "{obj.name}" has no rows.', level=messages.WARNING)
                continue
            importer = IMPORTERS.get(import_type)
            if not importer:
                continue
            try:
                result = importer(data, request.user)
                created_total += result.get('created', 0)
                errors_all.extend(result.get('errors') or [])
            except Exception as e:
                self.message_user(request, f'Import failed for "{obj.name}": {e}', level=messages.ERROR)
        if created_total or errors_all:
            msg = f'Created {created_total} record(s).'
            if errors_all:
                msg += f' {len(errors_all)} error(s) (e.g. {errors_all[0][:80]}).'
            self.message_user(request, msg, level=messages.SUCCESS if created_total else messages.WARNING)
        else:
            self.message_user(request, 'No rows imported (duplicates skipped or no data).', level=messages.INFO)

    @admin.action(description='Import selected into Date Formats')
    def import_to_date_formats(self, request, queryset):
        self._run_import(request, queryset, 'date_format')

    @admin.action(description='Import selected into Lettering Styles')
    def import_to_lettering(self, request, queryset):
        self._run_import(request, queryset, 'lettering')

    @admin.action(description='Import selected into Framing Styles')
    def import_to_framing(self, request, queryset):
        self._run_import(request, queryset, 'framing')

    @admin.action(description='Import selected into Colors')
    def import_to_colors(self, request, queryset):
        self._run_import(request, queryset, 'colors')

    @admin.action(description='Import selected into States (Admin Units)')
    def import_to_states(self, request, queryset):
        self._run_import(request, queryset, 'states')


# ========== USER ADMIN CUSTOMIZATION ==========


class UserLocationAssignmentInline(admin.TabularInline):
    """
    Inline so staff can assign locations to a user directly on the user detail page.
    (Kept for reference; primary UI uses a dual-column selector on the user form.)
    """
    model = UserLocationAssignment
    extra = 0
    raw_id_fields = ['administrative_unit']
    verbose_name = 'Location'
    verbose_name_plural = 'Locations'


class UserLocationUserChangeForm(DjangoUserAdmin.form):
    """
    Extend the base User change form to manage locations via a two-column selector,
    similar to the built-in user permissions widget.
    """

    locations = forms.ModelMultipleChoiceField(
        label='Locations',
        queryset=AdministrativeUnit.objects.none(),
        required=False,
        widget=FilteredSelectMultiple('Locations', is_stacked=False),
        help_text='Select which locations this user is associated with.',
    )

    class Meta(DjangoUserAdmin.form.Meta):
        _parent_fields = DjangoUserAdmin.form.Meta.fields
        if _parent_fields == '__all__':
            # Can't add to __all__; use concrete User field names + locations
            fields = [f.name for f in User._meta.get_fields() if f.concrete] + ['locations']
        else:
            fields = tuple(_parent_fields) + ('locations',)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Base queryset: all AdministrativeUnits. If a canonical list of state
        # reference codes is available, mirror the Location admin behavior by
        # restricting to those codes; otherwise, show all locations.
        location_qs = AdministrativeUnit.objects.all()
        codes = get_canonical_location_reference_codes()
        if codes is not None:
            location_qs = location_qs.filter(reference_code__in=codes)

        location_qs = location_qs.order_by('reference_code')
        self.fields['locations'].queryset = location_qs

        # Preselect Chosen Locations from UserLocationAssignment when editing a user
        if self.instance.pk and _user_location_table_available():
            self.fields['locations'].initial = location_qs.filter(
                user_location_assignments__user=self.instance
            )

    def _save_locations(self):
        """Save chosen locations to UserLocationAssignments for this user."""
        if not self.instance.pk:
            return
        if not _user_location_table_available():
            return
        # locations is in Meta.fields so it is in cleaned_data after validation
        selected_qs = self.cleaned_data.get('locations') or AdministrativeUnit.objects.none()

        user = self.instance
        selected_ids = set(selected_qs.values_list('pk', flat=True))

        # Remove assignments that are no longer selected
        UserLocationAssignment.objects.filter(user=user).exclude(
            administrative_unit_id__in=selected_ids
        ).delete()

        # Add new assignments for newly selected locations
        existing_ids = set(
            UserLocationAssignment.objects.filter(user=user).values_list(
                'administrative_unit_id', flat=True
            )
        )
        to_create_ids = selected_ids - existing_ids

        UserLocationAssignment.objects.bulk_create(
            [
                UserLocationAssignment(user=user, administrative_unit_id=pk)
                for pk in to_create_ids
            ]
        )

    def save_m2m(self):
        # Let the base form handle its M2M fields (groups, permissions, etc.)
        super().save_m2m()
        # Then sync our custom locations selection to the through model
        self._save_locations()


try:
    admin.site.unregister(User)
except NotRegistered:
    # Default User admin may not be registered in some configurations.
    pass


@admin.register(User)
class CustomUserAdmin(DjangoUserAdmin):
    """
    Extend the default Django User admin to show a dual-column Locations selector,
    similar to the built-in user permissions UI.
    """

    form = UserLocationUserChangeForm

    # Add a dedicated fieldset for locations, positioned between the built-in
    # "Permissions" and "Important dates" sections on the user detail page.
    _base_fieldsets = list(DjangoUserAdmin.fieldsets)
    try:
        _important_idx = next(
            idx
            for idx, (name, options) in enumerate(_base_fieldsets)
            if name == 'Important dates'
        )
    except StopIteration:
        # Fallback: if Django's UserAdmin ever renames/removes "Important dates",
        # just append Locations at the end (better than breaking).
        _base_fieldsets.append(('Locations', {'fields': ('locations',)}))
    else:
        _base_fieldsets.insert(_important_idx, ('Locations', {'fields': ('locations',)}))

    fieldsets = tuple(_base_fieldsets)


###################################################################################################