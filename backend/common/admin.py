###################################################################################################
## WoCo Commons - Admin Panel Configuration
## MPC: 2025/10/24
###################################################################################################
import csv
import io

from django.contrib import admin
from django.contrib.admin.sites import NotRegistered
from allauth.account.models import EmailAddress
from django.contrib.admin.widgets import FilteredSelectMultiple
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils.html import format_html
from django.utils import timezone
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
    AdministrativeUnit,
    AdministrativeUnitIdentity,
    AdministrativeUnitResponsibility,
    Color,
    Postmark,
    PostmarkValuation,
    PostmarkImage,
    Postcover,
    PostcoverPostmark,
    PostcoverImage,
    Auxmark,
    Framing,
    MarkFraming,
    Ratemark,
    PostmarkRatemark,
    CoverPostmark,
    DateObserved,
    Region,
    PostOffice,
    ReferenceWork,
    Shape,
    Cover,
    Lettering,
    Citation,
    LegacyAbbreviation,
    LegacyRateLocation,
    LegacyRateValue,
    LegacyParseStep,
    LegacyUserState,
    LegacyRawStateDataPendingUpdate,
    LegacyCover,
    AdminCsvUpload,
    UserLocationAssignment,
    Contribution,
    FAQEntry,
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


class ColorResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = Color
        import_id_fields = ['color_id']


class PostmarkResource(TimestampedModelResource):
    post_office = fields.Field(
        column_name='post_office',
        attribute='post_office',
        widget=ForeignKeyWidget(PostOffice, 'id')
    )
    shape = fields.Field(
        column_name='shape',
        attribute='shape',
        widget=ForeignKeyWidget(Shape, 'id')
    )
    lettering = fields.Field(
        column_name='lettering',
        attribute='lettering',
        widget=ForeignKeyWidget(Lettering, 'id')
    )
    color = fields.Field(
        column_name='color',
        attribute='color',
        widget=ForeignKeyWidget(Color, 'color_id')
    )

    class Meta(TimestampedModelResource.Meta):
        model = Postmark
        import_id_fields = ['postmark_id']


class ShapeResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = Shape
        import_id_fields = ['id']


class LetteringResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = Lettering
        import_id_fields = ['id']


class FramingResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = Framing
        import_id_fields = ['id']


class RegionResource(TimestampedModelResource):
    parent_region = fields.Field(
        column_name='parent_region',
        attribute='parent_region',
        widget=ForeignKeyWidget(Region, 'id')
    )

    class Meta(TimestampedModelResource.Meta):
        model = Region
        import_id_fields = ['id']


class PostOfficeResource(TimestampedModelResource):
    region = fields.Field(
        column_name='region',
        attribute='region',
        widget=ForeignKeyWidget(Region, 'id')
    )

    class Meta(TimestampedModelResource.Meta):
        model = PostOffice
        import_id_fields = ['id']


class CoverResource(TimestampedModelResource):
    color = fields.Field(
        column_name='color',
        attribute='color',
        widget=ForeignKeyWidget(Color, 'color_id')
    )

    class Meta(TimestampedModelResource.Meta):
        model = Cover
        import_id_fields = ['id']


class RatemarkResource(TimestampedModelResource):
    shape = fields.Field(
        column_name='shape',
        attribute='shape',
        widget=ForeignKeyWidget(Shape, 'id')
    )
    lettering = fields.Field(
        column_name='lettering',
        attribute='lettering',
        widget=ForeignKeyWidget(Lettering, 'id')
    )
    color = fields.Field(
        column_name='color',
        attribute='color',
        widget=ForeignKeyWidget(Color, 'color_id')
    )

    class Meta(TimestampedModelResource.Meta):
        model = Ratemark
        import_id_fields = ['id']


class AuxmarkResource(TimestampedModelResource):
    shape = fields.Field(
        column_name='shape',
        attribute='shape',
        widget=ForeignKeyWidget(Shape, 'id')
    )
    lettering = fields.Field(
        column_name='lettering',
        attribute='lettering',
        widget=ForeignKeyWidget(Lettering, 'id')
    )
    color = fields.Field(
        column_name='color',
        attribute='color',
        widget=ForeignKeyWidget(Color, 'color_id')
    )

    class Meta(TimestampedModelResource.Meta):
        model = Auxmark
        import_id_fields = ['id']


class PostmarkValuationResource(TimestampedModelResource):
    postmark = fields.Field(
        column_name='postmark',
        attribute='postmark',
        widget=ForeignKeyWidget(Postmark, 'postmark_id')
    )

    class Meta(TimestampedModelResource.Meta):
        model = PostmarkValuation
        import_id_fields = ['postmark_valuation_id']


class PostmarkImageResource(TimestampedModelResource):
    postmark = fields.Field(
        column_name='postmark',
        attribute='postmark',
        widget=ForeignKeyWidget(Postmark, 'postmark_id')
    )
    uploaded_by = fields.Field(
        column_name='uploaded_by',
        attribute='uploaded_by',
        widget=ForeignKeyWidget(User, 'id')
    )

    class Meta(TimestampedModelResource.Meta):
        model = PostmarkImage
        import_id_fields = ['postmark_image_id']


class DateObservedResource(TimestampedModelResource):
    postmark = fields.Field(
        column_name='postmark',
        attribute='postmark',
        widget=ForeignKeyWidget(Postmark, 'postmark_id')
    )

    class Meta(TimestampedModelResource.Meta):
        model = DateObserved
        import_id_fields = ['id']


class PostcoverResource(TimestampedModelResource):
    owner_user = fields.Field(
        column_name='owner_user',
        attribute='owner_user',
        widget=ForeignKeyWidget(User, 'id')
    )

    class Meta(TimestampedModelResource.Meta):
        model = Postcover
        import_id_fields = ['postcover_id']


class PostcoverPostmarkResource(TimestampedModelResource):
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

    class Meta(TimestampedModelResource.Meta):
        model = PostcoverPostmark
        import_id_fields = ['postcover_postmark_id']


class PostcoverImageResource(TimestampedModelResource):
    postcover = fields.Field(
        column_name='postcover',
        attribute='postcover',
        widget=ForeignKeyWidget(Postcover, 'postcover_id')
    )
    uploaded_by = fields.Field(
        column_name='uploaded_by',
        attribute='uploaded_by',
        widget=ForeignKeyWidget(User, 'id')
    )

    class Meta(TimestampedModelResource.Meta):
        model = PostcoverImage
        import_id_fields = ['postcover_image_id']


class CoverPostmarkResource(TimestampedModelResource):
    cover = fields.Field(
        column_name='cover',
        attribute='cover',
        widget=ForeignKeyWidget(Cover, 'id')
    )
    postmark = fields.Field(
        column_name='postmark',
        attribute='postmark',
        widget=ForeignKeyWidget(Postmark, 'postmark_id')
    )

    class Meta(TimestampedModelResource.Meta):
        model = CoverPostmark
        import_id_fields = ['id']


class PostmarkRatemarkResource(TimestampedModelResource):
    postmark = fields.Field(
        column_name='postmark',
        attribute='postmark',
        widget=ForeignKeyWidget(Postmark, 'postmark_id')
    )
    ratemark = fields.Field(
        column_name='ratemark',
        attribute='ratemark',
        widget=ForeignKeyWidget(Ratemark, 'id')
    )

    class Meta(TimestampedModelResource.Meta):
        model = PostmarkRatemark
        import_id_fields = ['id']


class MarkFramingResource(TimestampedModelResource):
    framing = fields.Field(
        column_name='framing',
        attribute='framing',
        widget=ForeignKeyWidget(Framing, 'id')
    )

    class Meta(TimestampedModelResource.Meta):
        model = MarkFraming
        import_id_fields = ['id']


class ReferenceWorkResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = ReferenceWork
        import_id_fields = ['id']


class CitationResource(TimestampedModelResource):
    reference_work = fields.Field(
        column_name='reference_work',
        attribute='reference_work',
        widget=ForeignKeyWidget(ReferenceWork, 'id')
    )

    class Meta(TimestampedModelResource.Meta):
        model = Citation
        import_id_fields = ['id']


class UserLocationAssignmentResource(resources.ModelResource):
    user = fields.Field(
        column_name='user',
        attribute='user',
        widget=ForeignKeyWidget(User, 'id')
    )
    administrative_unit = fields.Field(
        column_name='administrative_unit',
        attribute='administrative_unit',
        widget=ForeignKeyWidget(AdministrativeUnit, 'administrative_unit_id')
    )

    class Meta:
        model = UserLocationAssignment
        import_id_fields = ['id']


class FAQEntryResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = FAQEntry
        import_id_fields = ['faq_entry_id']


class LegacyAbbreviationResource(resources.ModelResource):
    class Meta:
        model = LegacyAbbreviation
        import_id_fields = ['id']


class LegacyRateLocationResource(resources.ModelResource):
    class Meta:
        model = LegacyRateLocation
        import_id_fields = ['id']


class LegacyRateValueResource(resources.ModelResource):
    class Meta:
        model = LegacyRateValue
        import_id_fields = ['id']


class LegacyParseStepResource(resources.ModelResource):
    class Meta:
        model = LegacyParseStep
        import_id_fields = ['id']


class LegacyUserStateResource(resources.ModelResource):
    class Meta:
        model = LegacyUserState
        import_id_fields = ['id']


class LegacyRawStateDataPendingUpdateResource(resources.ModelResource):
    class Meta:
        model = LegacyRawStateDataPendingUpdate
        import_id_fields = ['id']


class LegacyCoverResource(resources.ModelResource):
    class Meta:
        model = LegacyCover
        import_id_fields = ['id']


# ========== GEOGRAPHIC ADMIN ==========

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


# ========== PHYSICAL CHARACTERISTICS ADMIN ==========

@admin.register(Color)
class ColorAdmin(TimestampedModelAdmin):
    resource_class = ColorResource
    list_display = ['name', 'hex_val']
    search_fields = ['name', 'hex_val']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    actions = ['delete_colors_keep_listings']

    @admin.action(description='Delete selected colors (keep listings)')
    def delete_colors_keep_listings(self, request, queryset):
        """
        Delete Color records while preserving Postmark listings. Postmarks whose
        color FK points to a deleted color have their color nulled out first.
        """
        from django.db import transaction

        total_colors = queryset.count()
        total_nulled = 0

        with transaction.atomic():
            for color in queryset:
                count = Postmark.objects.filter(color=color).update(color=None)
                total_nulled += count
                color.delete()

        messages.success(
            request,
            f"Deleted {total_colors} color(s); nulled color on {total_nulled} postmark(s). "
            "All catalog listings were kept."
        )

    def get_actions(self, request):
        """
        Hide Django's default 'delete_selected' action so staff use the
        safer custom delete_colors_keep_listings action instead, which
        preserves Postmark listings.
        """
        actions = super().get_actions(request)
        if 'delete_selected' in actions:
            del actions['delete_selected']
        return actions


# ========== POSTMARK ADMIN ==========

class PostmarkValuationInline(admin.TabularInline):
    model = PostmarkValuation
    extra = 0
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


@admin.register(Postmark)
class PostmarkAdmin(InlineRevisionMixin, TimestampedModelAdmin):
    resource_class = PostmarkResource
    list_display = ['code', 'post_office', 'color', 'shape', 'is_manuscript']
    list_filter = ['is_manuscript', 'color', 'shape']
    search_fields = ['code', 'catalog_txt', 'inscription_txt', 'post_office__name']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    raw_id_fields = ['post_office', 'shape', 'lettering', 'color']

    inlines = [
        PostmarkValuationInline,
        PostmarkImageInline,
        ExampleCoverInline,
    ]

    fieldsets = (
        ('Identity', {
            'fields': ('code', 'post_office')
        }),
        ('Physical Characteristics', {
            'fields': ('shape', 'lettering', 'color', 'is_manuscript', 'impression',
                       'is_irreg', 'width', 'height', 'date_type', 'date_fmt')
        }),
        ('Text', {
            'fields': ('catalog_txt', 'inscription_txt')
        }),
        ('Metadata', {
            'fields': ('created_date', 'modified_date', 'created_by', 'modified_by'),
            'classes': ('collapse',)
        }),
    )

    def example_cover_count(self, obj):
        return obj.postcover_postmarks.count()
    example_cover_count.short_description = 'Example Covers'

    def example_cover_link(self, obj):
        url = (
            reverse('admin:common_postcover_changelist')
            + f"?postcover_postmarks__postmark__id__exact={obj.pk}"
        )
        return format_html('<a href="{}">View</a>', url)
    example_cover_link.short_description = 'Example Covers Link'


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
        help_text='Upload a CSV (e.g. tblStates.csv, tblTownmarkLettering.csv). Required when adding new.',
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
class LegacyAbbreviationAdmin(ImportExportModelAdmin):
    resource_class = LegacyAbbreviationResource
    list_display = ['id', 'txt_abbreviation', 'txt_meaning', 'n_order', 'yn_active']
    list_filter = ['yn_active']
    search_fields = ['txt_abbreviation', 'txt_meaning']
    ordering = ['n_order', 'txt_abbreviation']


@admin.register(LegacyRateLocation)
class LegacyRateLocationAdmin(ImportExportModelAdmin):
    resource_class = LegacyRateLocationResource
    list_display = ['id', 'txt_townmark_rate_location', 'n_order', 'yn_active']
    list_filter = ['yn_active']
    ordering = ['n_order']


@admin.register(LegacyRateValue)
class LegacyRateValueAdmin(ImportExportModelAdmin):
    resource_class = LegacyRateValueResource
    list_display = ['id', 'txt_townmark_rate_value', 'n_order', 'yn_active']
    list_filter = ['yn_active']
    ordering = ['n_order']


@admin.register(LegacyParseStep)
class LegacyParseStepAdmin(ImportExportModelAdmin):
    resource_class = LegacyParseStepResource
    list_display = ['id', 'txt_parse_step', 'n_state_id', 'yn_completed', 'n_order', 'yn_active']
    list_filter = ['yn_completed', 'yn_active']
    search_fields = ['txt_parse_step']
    ordering = ['n_state_id', 'n_order']


@admin.register(LegacyUserState)
class LegacyUserStateAdmin(ImportExportModelAdmin):
    resource_class = LegacyUserStateResource
    list_display = ['id', 'n_user_id', 'n_state_id', 'mem_roles']
    list_filter = ['n_state_id']
    ordering = ['n_user_id', 'n_state_id']


@admin.register(LegacyRawStateDataPendingUpdate)
class LegacyRawStateDataPendingUpdateAdmin(ImportExportModelAdmin):
    resource_class = LegacyRawStateDataPendingUpdateResource
    list_display = ['id', 'n_raw_state_data_id', 'n_state_id']
    list_filter = ['n_state_id']
    readonly_fields = ['payload']
    ordering = ['-id']


@admin.register(LegacyCover)
class LegacyCoverAdmin(ImportExportModelAdmin):
    resource_class = LegacyCoverResource
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


class EmailAddressInline(admin.TabularInline):
    model = EmailAddress
    extra = 0
    fields = ['email', 'verified', 'primary']


ROLE_CONTRIBUTOR = "contributor"
ROLE_STATE_EDITOR = "state_editor"

ROLE_CHOICES = (
    (ROLE_CONTRIBUTOR, "Contributor"),
    (ROLE_STATE_EDITOR, "State Editor"),
)


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

    role = forms.ChoiceField(
        label='Role',
        choices=ROLE_CHOICES,
        required=False,
        help_text='High-level role used for UI and default permissions (Contributor or State Editor).',
    )

    class Meta(DjangoUserAdmin.form.Meta):
        _parent_fields = DjangoUserAdmin.form.Meta.fields
        if _parent_fields == '__all__':
            # Can't add to __all__; use concrete User field names + locations
            fields = [f.name for f in User._meta.get_fields() if f.concrete] + ['locations', 'role']
        else:
            fields = tuple(_parent_fields) + ('locations', 'role')

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

        # Initialise role from group membership or from location assignments, so that
        # opening a state editor always shows "State Editor" with their assigned locations.
        role_initial = ROLE_CONTRIBUTOR
        if self.instance.pk:
            if self.instance.groups.filter(name__iexact="State Editors").exists():
                role_initial = ROLE_STATE_EDITOR
            elif _user_location_table_available() and UserLocationAssignment.objects.filter(user=self.instance).exists():
                role_initial = ROLE_STATE_EDITOR
        self.fields['role'].initial = role_initial or ROLE_CONTRIBUTOR

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

    def _save_role_groups(self):
        """Map the selected role to Django auth groups."""
        if not self.instance.pk:
            return

        role = self.cleaned_data.get("role")
        if not role:
            return

        # Ensure the role groups exist
        contributor_group, _ = Group.objects.get_or_create(name="Contributors")
        state_editor_group, _ = Group.objects.get_or_create(name="State Editors")

        user = self.instance

        # Remove from both role groups first
        user.groups.remove(contributor_group, state_editor_group)

        # Then add the appropriate one
        if role == ROLE_CONTRIBUTOR:
            user.groups.add(contributor_group)
        elif role == ROLE_STATE_EDITOR:
            user.groups.add(state_editor_group)

    def clean(self):
        """
        Enforce relationship between role and locations:
        - Contributors: locations are always cleared (no assignments).
        - State Editors: must have at least one location selected.
        """
        cleaned = super().clean()
        role = cleaned.get("role") or ROLE_CONTRIBUTOR
        locations = cleaned.get("locations")

        from django.core.exceptions import ValidationError

        if role == ROLE_CONTRIBUTOR:
            # Contributors should not carry any explicit location assignments
            cleaned["locations"] = AdministrativeUnit.objects.none()
        elif role == ROLE_STATE_EDITOR:
            # State Editors must have at least one location
            if not locations or not list(locations):
                self.add_error(
                    "locations",
                    ValidationError("State Editors must have at least one location assigned."),
                )
        return cleaned

    def save_m2m(self):
        # Let the base form handle its M2M fields (groups, permissions, etc.)
        super().save_m2m()
        # Then sync our custom locations selection to the through model
        self._save_locations()
        # And keep role/group mapping in sync with the selected role
        self._save_role_groups()

    class Media:
        # Small bit of JavaScript to hide the Locations selector
        # unless role="state_editor" is selected.
        js = ("common/admin_user_role.js",)


try:
    admin.site.unregister(User)
except NotRegistered:
    # Default User admin may not be registered in some configurations.
    pass

try:
    admin.site.unregister(EmailAddress)
except NotRegistered:
    pass


@admin.register(User)
class CustomUserAdmin(DjangoUserAdmin):
    """
    Extend the default Django User admin to show a dual-column Locations selector,
    similar to the built-in user permissions UI.
    """

    form = UserLocationUserChangeForm
    inlines = [EmailAddressInline]

    def save_related(self, request, form, formsets, change):
        """Ensure custom role/location mappings are persisted after related saves."""
        super().save_related(request, form, formsets, change)
        if hasattr(form, '_save_locations'):
            form._save_locations()
        # Explicitly sync role -> Django auth group mapping here as well.
        # In Django admin, form.save(commit=False) can replace save_m2m on the
        # form instance, so relying only on the form's save_m2m override is brittle.
        if hasattr(form, '_save_role_groups'):
            form._save_role_groups()

    # Add a dedicated fieldset for role + locations, positioned between the built-in
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
        _base_fieldsets.append(('Role & Locations', {'fields': ('role', 'locations')}))
    else:
        _base_fieldsets.insert(_important_idx, ('Role & Locations', {'fields': ('role', 'locations')}))

    fieldsets = tuple(_base_fieldsets)


# ========== CONTRIBUTION ADMIN ==========


@admin.register(Contribution)
class ContributionAdmin(admin.ModelAdmin):
    list_display = ["id", "contributor", "status", "get_state", "get_town", "reviewer", "created_at"]
    list_filter = ["status"]
    search_fields = ["contributor__username", "submitted_data"]
    readonly_fields = ["created_at", "updated_at", "postmark"]
    actions = ["approve_contributions", "reject_contributions"]

    def get_state(self, obj):
        return (obj.submitted_data or {}).get("state", "-")
    get_state.short_description = "State"

    def get_town(self, obj):
        return (obj.submitted_data or {}).get("town", "-")
    get_town.short_description = "Town"

    def save_model(self, request, obj, form, change):
        """
        When a staff member edits a single Contribution in the admin and
        changes its status from pending → approved, automatically apply the
        submitted data to the catalog (create/update Postmark) so that the
        listing appears in the main catalog/search.
        """
        previous_status = None
        if change and obj.pk:
            try:
                previous = Contribution.objects.only("status").get(pk=obj.pk)
                previous_status = previous.status
            except Contribution.DoesNotExist:
                previous_status = None

        super().save_model(request, obj, form, change)

        # Only act on a fresh transition from pending -> approved
        if previous_status == Contribution.STATUS_PENDING and obj.status == Contribution.STATUS_APPROVED:
            try:
                postmark = obj.apply_to_catalog()
                if not postmark:
                    self.message_user(
                        request,
                        "Could not apply contribution to catalog. Check submitted data.",
                        level=messages.ERROR,
                    )
                    return

                # Ensure the Contribution is linked to the Postmark (for new entries)
                if obj.postmark_id != postmark.pk:
                    obj.postmark = postmark
                    obj.save(update_fields=["postmark", "updated_at"])
            except Exception:
                self.message_user(
                    request,
                    "An error occurred while applying this contribution to the catalog.",
                    level=messages.ERROR,
                )


    @admin.action(description="Approve selected contributions and create/update catalog listings")
    def approve_contributions(self, request, queryset):
        """
        Admin bulk action to approve pending contributions.
        Mirrors the API behaviour:
        - Applies submitted_data to the catalog via contribution.apply_to_catalog()
          (creates a Postmark for new entries or updates the existing one).
        - Marks the Contribution as approved and links it to the Postmark.
        - Marks the Contribution as approved so it appears in the public catalog/search listing.
        """
        approved = 0
        failed = 0

        for contrib in queryset.select_related("postmark"):
            if contrib.status != Contribution.STATUS_PENDING:
                continue
            try:
                postmark = contrib.apply_to_catalog()
                if not postmark:
                    failed += 1
                    continue
                contrib.status = Contribution.STATUS_APPROVED
                contrib.reviewer = request.user
                contrib.postmark = postmark
                contrib.save(update_fields=["status", "reviewer", "postmark", "updated_at"])
                approved += 1
            except Exception:
                failed += 1

        if approved:
            self.message_user(
                request,
                f"Approved {approved} contribution(s) and applied them to the catalog.",
                level=messages.SUCCESS,
            )
        if failed:
            self.message_user(
                request,
                f"{failed} contribution(s) could not be applied to the catalog. "
                "Check submitted data and try again.",
                level=messages.WARNING,
            )

    @admin.action(description="Reject selected contributions (no catalog change)")
    def reject_contributions(self, request, queryset):
        """
        Admin bulk action to reject pending contributions.
        Does not change the catalog; only updates Contribution.status.
        """
        rejected = 0
        for contrib in queryset:
            if contrib.status != Contribution.STATUS_PENDING:
                continue
            contrib.status = Contribution.STATUS_REJECTED
            contrib.reviewer = request.user
            contrib.save(update_fields=["status", "reviewer", "updated_at"])
            rejected += 1

        if rejected:
            self.message_user(
                request,
                f"Rejected {rejected} contribution(s).",
                level=messages.SUCCESS,
            )


@admin.register(Lettering)
class LetteringAdmin(TimestampedModelAdmin):
    resource_class = LetteringResource
    list_display = ["name"]
    search_fields = ["name"]
    ordering = ["name"]


@admin.register(Framing)
class FramingAdmin(TimestampedModelAdmin):
    resource_class = FramingResource
    list_display = ["name", "code"]
    search_fields = ["name", "code"]
    ordering = ["name"]


@admin.register(Shape)
class ShapeAdmin(TimestampedModelAdmin):
    resource_class = ShapeResource
    list_display = ["name", "code"]
    search_fields = ["name", "code"]
    ordering = ["name"]


@admin.register(Cover)
class CoverAdmin(TimestampedModelAdmin):
    resource_class = CoverResource
    list_display = ["code", "type", "color", "has_adhesive", "height", "width", "is_institutional"]
    list_filter = ["type", "has_adhesive", "is_institutional"]
    search_fields = ["code", "type"]
    raw_id_fields = ["color"]


@admin.register(Auxmark)
class AuxmarkAdmin(TimestampedModelAdmin):
    resource_class = AuxmarkResource
    list_display = [
        "parent_mark_type",
        "parent_mark_id",
        "inscription_txt",
        "is_manuscript",
        "shape",
        "lettering",
        "color",
        "impression",
        "is_irreg",
        "width",
        "height",
    ]
    list_filter = ["parent_mark_type", "is_manuscript", "impression", "is_irreg"]
    search_fields = ["inscription_txt", "parent_mark_type"]
    raw_id_fields = ["shape", "lettering", "color"]
    ordering = ["parent_mark_type", "parent_mark_id"]


@admin.register(Citation)
class CitationAdmin(TimestampedModelAdmin):
    resource_class = CitationResource
    list_display = ["reference_work", "subject_type", "subject_id", "citation_detail"]
    list_filter = ["subject_type"]
    search_fields = ["reference_work__title", "citation_detail"]
    ordering = ["reference_work", "subject_type", "subject_id"]


@admin.register(Region)
class RegionAdmin(TimestampedModelAdmin):
    resource_class = RegionResource
    list_display = ["name", "abbrev", "region_tier", "parent_region"]
    list_filter = ["region_tier"]
    search_fields = ["name", "abbrev"]
    raw_id_fields = ["parent_region"]
    ordering = ["name"]


@admin.register(PostOffice)
class PostOfficeAdmin(TimestampedModelAdmin):
    resource_class = PostOfficeResource
    list_display = ["name", "region"]
    list_filter = ["region"]
    search_fields = ["name", "region__name"]
    raw_id_fields = ["region"]
    ordering = ["name"]


@admin.register(DateObserved)
class DateObservedAdmin(TimestampedModelAdmin):
    resource_class = DateObservedResource
    list_display = ["postmark", "date", "granularity"]
    list_filter = ["granularity"]
    search_fields = ["postmark__code"]
    raw_id_fields = ["postmark"]
    ordering = ["postmark", "date"]


@admin.register(Ratemark)
class RatemarkAdmin(TimestampedModelAdmin):
    resource_class = RatemarkResource
    list_display = ["id", "inscription_txt", "is_manuscript", "shape", "lettering", "color", "rate_val"]
    list_filter = ["is_manuscript", "impression", "is_irreg"]
    search_fields = ["inscription_txt"]
    raw_id_fields = ["shape", "lettering", "color"]


@admin.register(CoverPostmark)
class CoverPostmarkAdmin(TimestampedModelAdmin):
    resource_class = CoverPostmarkResource
    list_display = ["cover", "postmark", "is_backstamp"]
    search_fields = ["cover__code", "postmark__code"]
    raw_id_fields = ["cover", "postmark"]


@admin.register(PostmarkRatemark)
class PostmarkRatemarkAdmin(TimestampedModelAdmin):
    resource_class = PostmarkRatemarkResource
    list_display = ["postmark", "ratemark", "placement_type"]
    list_filter = ["placement_type"]
    search_fields = ["postmark__code", "ratemark__inscription_txt"]
    raw_id_fields = ["postmark", "ratemark"]


@admin.register(MarkFraming)
class MarkFramingAdmin(TimestampedModelAdmin):
    resource_class = MarkFramingResource
    list_display = ["parent_mark_type", "parent_mark_id", "framing", "framing_pos"]
    list_filter = ["parent_mark_type"]
    search_fields = ["parent_mark_type", "parent_mark_id", "framing__name"]
    raw_id_fields = ["framing"]


@admin.register(ReferenceWork)
class ReferenceWorkAdmin(TimestampedModelAdmin):
    resource_class = ReferenceWorkResource
    list_display = ["title", "authorship", "publication_year", "publisher"]
    search_fields = ["title", "authorship", "publisher", "isbn"]
    ordering = ["title"]


@admin.register(PostmarkValuation)
class PostmarkValuationAdmin(TimestampedModelAdmin):
    resource_class = PostmarkValuationResource
    list_display = ["postmark_valuation_id", "postmark", "appraisal_pos", "amt", "appraisal_date"]
    list_filter = ["appraisal_date"]
    search_fields = ["postmark__code"]
    raw_id_fields = ["postmark"]
    ordering = ["postmark", "appraisal_pos"]


@admin.register(PostmarkImage)
class PostmarkImageAdmin(TimestampedModelAdmin):
    resource_class = PostmarkImageResource
    list_display = ['get_postmark_key', 'original_filename', 'image_view', 'display_order', 'uploaded_by']
    list_filter = ['image_view']
    search_fields = ['postmark__code', 'original_filename', 'uploaded_by']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date', 'file_checksum']
    raw_id_fields = ['postmark']
    paginator = NoCountPaginator

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.select_related('postmark', 'uploaded_by').order_by('-id')

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
        try:
            return str(obj.postmark) if obj.postmark_id else '-'
        except Exception:
            return '-'
    get_postmark_key.short_description = 'Postmark'


@admin.register(Postcover)
class PostcoverAdmin(InlineRevisionMixin, TimestampedModelAdmin):
    resource_class = PostcoverResource
    list_display = ['postcover_key', 'owner_user']
    search_fields = ['postcover_key', 'owner_user__username', 'description']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date']
    raw_id_fields = ['owner_user']

    inlines = [
        PostcoverPostmarkInline,
        PostcoverImageInline,
    ]


@admin.register(PostcoverPostmark)
class PostcoverPostmarkAdmin(TimestampedModelAdmin):
    resource_class = PostcoverPostmarkResource
    list_display = ['postcover', 'postmark', 'position_order', 'postmark_location']
    list_filter = ['postmark_location']
    search_fields = ['postcover__postcover_key', 'postmark__code']
    raw_id_fields = ['postcover', 'postmark']
    ordering = ['postcover', 'position_order']


@admin.register(PostcoverImage)
class PostcoverImageAdmin(TimestampedModelAdmin):
    resource_class = PostcoverImageResource
    list_display = ['get_postcover_key', 'original_filename', 'image_view',
                    'display_order', 'uploaded_by']
    list_filter = ['image_view']
    search_fields = ['postcover__postcover_key', 'original_filename']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date', 'file_checksum']
    raw_id_fields = ['postcover']

    def get_postcover_key(self, obj):
        return obj.postcover.postcover_key
    get_postcover_key.short_description = 'Postcover'


@admin.register(UserLocationAssignment)
class UserLocationAssignmentAdmin(ImportExportModelAdmin):
    resource_class = UserLocationAssignmentResource
    list_display = ['user', 'administrative_unit']
    search_fields = ['user__username', 'administrative_unit__reference_code']
    raw_id_fields = ['user', 'administrative_unit']


@admin.register(FAQEntry)
class FAQEntryAdmin(TimestampedModelAdmin):
    resource_class = FAQEntryResource
    list_display = ("question", "is_active", "display_order")
    list_filter = ("is_active",)
    search_fields = ("question", "answer")
    ordering = ("display_order", "faq_entry_id")


###################################################################################################