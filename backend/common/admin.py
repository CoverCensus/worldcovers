###################################################################################################
## WoCo Commons - Admin Panel Configuration
## Phase 1 model rewrite -- unified Marking, polymorphic Image, Cover* shape.
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
from django.core.paginator import Paginator
from django.utils.functional import cached_property
from django import forms
from django.contrib import messages

from import_export import resources, fields
from import_export.admin import ImportExportModelAdmin
from import_export.widgets import ForeignKeyWidget, Widget
from django.utils.dateparse import parse_datetime


class IsoDateTimeWidget(Widget):
    """Accepts ISO 8601 datetimes (with or without microseconds / tz offset) on import,
    and renders ISO format on export."""

    def clean(self, value, row=None, *args, **kwargs):
        if value in (None, ""):
            return None
        if hasattr(value, "isoformat"):
            return value
        parsed = parse_datetime(str(value).strip())
        if parsed is None:
            raise ValueError(f"Could not parse datetime: {value!r}")
        return parsed

    def render(self, value, obj=None):
        if value is None:
            return ""
        return value.isoformat()


from reversion_compare.admin import CompareVersionAdmin

from .models import (
    Color,
    Marking,
    MarkingType,
    MarkingVersion,
    Image,
    Postcover,
    PostcoverImage,
    CoverDate,
    CoverValuation,
    CoverMarking,
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
    Collection,
    CollectionAssignment,
    Contribution,
    FAQEntry,
)
from .csv_import import IMPORTERS

User = get_user_model()


def _collection_assignment_table_available() -> bool:
    """True if the CollectionAssignments table exists."""
    try:
        CollectionAssignment.objects.only("pk").first()
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
    """Populate created_by / modified_by on inline objects."""

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)
        for obj in instances:
            if hasattr(obj, "created_by") and getattr(obj, "created_by_id", None) is None:
                obj.created_by = request.user
            if hasattr(obj, "modified_by"):
                obj.modified_by = request.user
        formset.save_m2m()


class TimestampedModelResource(resources.ModelResource):
    """Base resource that handles user foreign keys properly"""
    created_by = fields.Field(
        column_name='created_by',
        attribute='created_by',
        widget=ForeignKeyWidget(User, 'id'),
    )
    modified_by = fields.Field(
        column_name='modified_by',
        attribute='modified_by',
        widget=ForeignKeyWidget(User, 'id'),
    )
    created_date = fields.Field(
        column_name='created_date',
        attribute='created_date',
        widget=IsoDateTimeWidget(),
    )
    modified_date = fields.Field(
        column_name='modified_date',
        attribute='modified_date',
        widget=IsoDateTimeWidget(),
    )

    class Meta:
        abstract = True


class ReversionImportExportAdmin(CompareVersionAdmin, ImportExportModelAdmin):
    """Base admin for models that already use ImportExportModelAdmin and want reversion."""
    pass


# ========== RESOURCES ==========

class ColorResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = Color
        import_id_fields = ['color_id']


class MarkingResource(TimestampedModelResource):
    post_office = fields.Field(
        column_name='post_office',
        attribute='post_office',
        widget=ForeignKeyWidget(PostOffice, 'id'),
    )
    shape = fields.Field(
        column_name='shape',
        attribute='shape',
        widget=ForeignKeyWidget(Shape, 'id'),
    )
    lettering = fields.Field(
        column_name='lettering',
        attribute='lettering',
        widget=ForeignKeyWidget(Lettering, 'id'),
    )
    color = fields.Field(
        column_name='color',
        attribute='color',
        widget=ForeignKeyWidget(Color, 'color_id'),
    )

    class Meta(TimestampedModelResource.Meta):
        model = Marking
        import_id_fields = ['marking_id']


class ShapeResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = Shape
        import_id_fields = ['id']


class LetteringResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = Lettering
        import_id_fields = ['id']


class RegionResource(TimestampedModelResource):
    parent_region = fields.Field(
        column_name='parent_region',
        attribute='parent_region',
        widget=ForeignKeyWidget(Region, 'id'),
    )

    class Meta(TimestampedModelResource.Meta):
        model = Region
        import_id_fields = ['id']


class PostOfficeResource(TimestampedModelResource):
    region = fields.Field(
        column_name='region',
        attribute='region',
        widget=ForeignKeyWidget(Region, 'id'),
    )

    class Meta(TimestampedModelResource.Meta):
        model = PostOffice
        import_id_fields = ['id']


class CoverResource(TimestampedModelResource):
    color = fields.Field(
        column_name='color',
        attribute='color',
        widget=ForeignKeyWidget(Color, 'color_id'),
    )

    class Meta(TimestampedModelResource.Meta):
        model = Cover
        import_id_fields = ['id']


class CoverDateResource(TimestampedModelResource):
    cover = fields.Field(
        column_name='cover',
        attribute='cover',
        widget=ForeignKeyWidget(Cover, 'id'),
    )

    class Meta(TimestampedModelResource.Meta):
        model = CoverDate
        import_id_fields = ['id']


class CoverValuationResource(TimestampedModelResource):
    cover = fields.Field(
        column_name='cover',
        attribute='cover',
        widget=ForeignKeyWidget(Cover, 'id'),
    )

    class Meta(TimestampedModelResource.Meta):
        model = CoverValuation
        import_id_fields = ['cover_valuation_id']


class CoverMarkingResource(TimestampedModelResource):
    cover = fields.Field(
        column_name='cover',
        attribute='cover',
        widget=ForeignKeyWidget(Cover, 'id'),
    )
    marking = fields.Field(
        column_name='marking',
        attribute='marking',
        widget=ForeignKeyWidget(Marking, 'marking_id'),
    )

    class Meta(TimestampedModelResource.Meta):
        model = CoverMarking
        import_id_fields = ['id']


class ImageResource(TimestampedModelResource):
    uploaded_by = fields.Field(
        column_name='uploaded_by',
        attribute='uploaded_by',
        widget=ForeignKeyWidget(User, 'id'),
    )

    class Meta(TimestampedModelResource.Meta):
        model = Image
        import_id_fields = ['image_id']


class ReferenceWorkResource(TimestampedModelResource):
    class Meta(TimestampedModelResource.Meta):
        model = ReferenceWork
        import_id_fields = ['id']


class CitationResource(TimestampedModelResource):
    reference_work = fields.Field(
        column_name='reference_work',
        attribute='reference_work',
        widget=ForeignKeyWidget(ReferenceWork, 'id'),
    )

    class Meta(TimestampedModelResource.Meta):
        model = Citation
        import_id_fields = ['id']


class CollectionAssignmentResource(resources.ModelResource):
    user = fields.Field(
        column_name='user',
        attribute='user',
        widget=ForeignKeyWidget(User, 'id'),
    )
    collection = fields.Field(
        column_name='collection',
        attribute='collection',
        widget=ForeignKeyWidget(Collection, 'id'),
    )

    class Meta:
        model = CollectionAssignment
        import_id_fields = ['id']


class CollectionResource(resources.ModelResource):
    region = fields.Field(
        column_name='region',
        attribute='region',
        widget=ForeignKeyWidget(Region, 'id'),
    )

    class Meta:
        model = Collection
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


# ========== PHYSICAL CHARACTERISTICS ADMIN ==========

@admin.register(Color)
class ColorAdmin(TimestampedModelAdmin):
    resource_class = ColorResource
    list_display = ['name', 'hex_val']
    search_fields = ['name', 'hex_val']
    actions = ['delete_colors_keep_listings']

    @admin.action(description='Delete selected colors (re-default markings to BLACK)')
    def delete_colors_keep_listings(self, request, queryset):
        """
        Delete Color records while preserving Marking listings. Markings whose
        color FK points to a deleted color are re-pointed at color_id=1 (BLACK).
        """
        from django.db import transaction

        total_colors = queryset.count()
        total_repointed = 0
        with transaction.atomic():
            for color in queryset:
                if color.pk == 1:
                    continue
                count = Marking.objects.filter(color=color).update(color_id=1)
                total_repointed += count
                color.delete()

        messages.success(
            request,
            f"Deleted {total_colors} color(s); re-pointed color on "
            f"{total_repointed} marking(s) to BLACK. All catalog listings were kept."
        )

    def get_actions(self, request):
        actions = super().get_actions(request)
        if 'delete_selected' in actions:
            del actions['delete_selected']
        return actions


# ========== MARKING ADMIN ==========

class CoverMarkingInline(admin.TabularInline):
    """Covers attached to this Marking via CoverMarking."""
    model = CoverMarking
    extra = 0
    raw_id_fields = ['cover']
    fields = ['cover', 'is_backstamp', 'placement']
    exclude = ['created_by', 'modified_by', 'created_date', 'modified_date']


@admin.register(Marking)
class MarkingAdmin(InlineRevisionMixin, TimestampedModelAdmin):
    resource_class = MarkingResource
    list_display = ['marking_id', 'code', 'type', 'post_office', 'color', 'shape', 'is_manuscript']
    list_filter = ['type', 'is_manuscript', 'color', 'shape']
    search_fields = ['code', 'catalog_txt', 'inscription_txt', 'desc', 'post_office__name']
    raw_id_fields = ['post_office', 'shape', 'lettering', 'color']
    inlines = [CoverMarkingInline]

    fieldsets = (
        ('Identity', {
            'fields': ('code', 'type', 'post_office'),
        }),
        ('Physical Characteristics', {
            'fields': (
                'shape', 'lettering', 'color', 'is_manuscript', 'impression',
                'is_irreg', 'width', 'height', 'date_fmt', 'rate_val',
            ),
        }),
        ('Text', {
            'fields': ('catalog_txt', 'inscription_txt', 'desc'),
        }),
        ('Metadata', {
            'fields': ('created_date', 'modified_date', 'created_by', 'modified_by'),
            'classes': ('collapse',),
        }),
    )


class CatalogRequestMarking(Marking):
    """Proxy that scopes the Marking changelist to user-contributed entries
    awaiting / under editorial review."""

    class Meta:
        proxy = True
        verbose_name = 'Catalog request'
        verbose_name_plural = 'Catalog requests'


@admin.register(CatalogRequestMarking)
class CatalogRequestMarkingAdmin(MarkingAdmin):
    """Admin view restricted to Markings linked to a Contribution row."""

    def get_queryset(self, request):
        return super().get_queryset(request).filter(contribution__isnull=False)


# ========== IMAGE ADMIN ==========

@admin.register(Image)
class ImageAdmin(TimestampedModelAdmin):
    resource_class = ImageResource
    list_display = ['image_id', 'subject_type', 'subject_id', 'original_filename', 'image_view', 'display_order', 'uploaded_by']
    list_filter = ['subject_type', 'image_view']
    search_fields = ['original_filename', 'storage_filename', 'subject_id']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date', 'file_checksum']
    paginator = NoCountPaginator

    fieldsets = (
        ('Subject', {
            'fields': ('subject_type', 'subject_id'),
        }),
        ('File Information', {
            'fields': (
                'original_filename', 'storage_filename', 'file_checksum',
                'mime_type', 'image_width', 'image_height', 'file_size_bytes',
            ),
        }),
        ('Display Settings', {
            'fields': ('image_view', 'image_description', 'display_order'),
        }),
        ('Submission Information', {
            'fields': ('uploaded_by',),
        }),
        ('Metadata', {
            'fields': ('created_date', 'modified_date', 'created_by', 'modified_by'),
            'classes': ('collapse',),
        }),
    )


# ========== COVER ADMIN ==========

class CoverDateInline(admin.TabularInline):
    model = CoverDate
    extra = 0
    fields = ['date', 'granularity']
    exclude = ['created_by', 'modified_by', 'created_date', 'modified_date']


class CoverValuationInline(admin.TabularInline):
    model = CoverValuation
    extra = 0
    fields = ['amt', 'appraisal_date']
    exclude = ['created_by', 'modified_by', 'created_date', 'modified_date']


class CoverMarkingForCoverInline(admin.TabularInline):
    model = CoverMarking
    extra = 0
    raw_id_fields = ['marking']
    fields = ['marking', 'is_backstamp', 'placement']
    exclude = ['created_by', 'modified_by', 'created_date', 'modified_date']


@admin.register(Cover)
class CoverAdmin(TimestampedModelAdmin):
    resource_class = CoverResource
    list_display = ['code', 'type', 'color', 'has_adhesive', 'height', 'width', 'is_institutional']
    list_filter = ['type', 'has_adhesive', 'is_institutional']
    search_fields = ['code', 'type']
    raw_id_fields = ['color']
    inlines = [CoverMarkingForCoverInline, CoverDateInline, CoverValuationInline]


@admin.register(CoverDate)
class CoverDateAdmin(TimestampedModelAdmin):
    resource_class = CoverDateResource
    list_display = ['cover', 'date', 'granularity']
    list_filter = ['granularity']
    search_fields = ['cover__code']
    raw_id_fields = ['cover']
    ordering = ['cover', 'date']


@admin.register(CoverValuation)
class CoverValuationAdmin(TimestampedModelAdmin):
    resource_class = CoverValuationResource
    list_display = ['cover_valuation_id', 'cover', 'amt', 'appraisal_date']
    list_filter = ['appraisal_date']
    search_fields = ['cover__code']
    raw_id_fields = ['cover']
    ordering = ['-appraisal_date']


@admin.register(CoverMarking)
class CoverMarkingAdmin(TimestampedModelAdmin):
    resource_class = CoverMarkingResource
    list_display = ['cover', 'marking', 'is_backstamp', 'placement']
    list_filter = ['is_backstamp']
    search_fields = ['cover__code', 'marking__code', 'placement']
    raw_id_fields = ['cover', 'marking']


@admin.register(MarkingVersion)
class MarkingVersionAdmin(admin.ModelAdmin):
    list_display = ['id', 'marking', 'version_no', 'created_at', 'created_by']
    list_filter = ['created_at']
    search_fields = ['marking__code']
    raw_id_fields = ['marking', 'transaction']
    readonly_fields = ['snapshot', 'created_at']
    ordering = ['-created_at']


# ========== POSTCOVER (DEPRECATED) ADMIN ==========

class PostcoverImageInline(admin.TabularInline):
    model = PostcoverImage
    extra = 1
    readonly_fields = ['file_checksum']
    fields = ['original_filename', 'storage_filename', 'image_view', 'display_order']
    exclude = ['created_by', 'modified_by', 'created_date', 'modified_date']


@admin.register(Postcover)
class PostcoverAdmin(InlineRevisionMixin, TimestampedModelAdmin):
    list_display = ['postcover_key', 'owner_user']
    search_fields = ['postcover_key', 'owner_user__username', 'description']
    raw_id_fields = ['owner_user']
    inlines = [PostcoverImageInline]


@admin.register(PostcoverImage)
class PostcoverImageAdmin(TimestampedModelAdmin):
    list_display = ['get_postcover_key', 'original_filename', 'image_view', 'display_order', 'uploaded_by']
    list_filter = ['image_view']
    search_fields = ['postcover__postcover_key', 'original_filename']
    readonly_fields = ['created_by', 'created_date', 'modified_by', 'modified_date', 'file_checksum']
    raw_id_fields = ['postcover']

    def get_postcover_key(self, obj):
        return obj.postcover.postcover_key
    get_postcover_key.short_description = 'Postcover'


# ========== CSV UPLOADS ==========

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
    csv_file = forms.FileField(
        label='CSV file',
        required=False,
        help_text='Upload a CSV. Required when adding new.',
    )

    class Meta:
        model = AdminCsvUpload
        fields = ['name']

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


# ========== LEGACY ERD TABLES ==========

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
    actions = ['import_to_lettering', 'import_to_colors']

    def has_add_permission(self, request):
        return request.user.is_staff

    def get_queryset(self, request):
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

    @admin.action(description='Import selected into Lettering Styles')
    def import_to_lettering(self, request, queryset):
        self._run_import(request, queryset, 'lettering')

    @admin.action(description='Import selected into Colors')
    def import_to_colors(self, request, queryset):
        self._run_import(request, queryset, 'colors')


# ========== USER ADMIN ==========

class CollectionAssignmentInline(admin.TabularInline):
    model = CollectionAssignment
    extra = 0
    raw_id_fields = ['collection']
    verbose_name = 'Collection assignment'
    verbose_name_plural = 'Collection assignments'


class EmailAddressInline(admin.TabularInline):
    model = EmailAddress
    extra = 0
    fields = ['email', 'verified', 'primary']


ROLE_CONTRIBUTOR = "contributor"
ROLE_EDITOR = "editor"

ROLE_CHOICES = (
    (ROLE_CONTRIBUTOR, "Contributor"),
    (ROLE_EDITOR, "Editor"),
)


class CollectionUserChangeForm(DjangoUserAdmin.form):
    """Manage Collection assignments via a two-column selector on the user form."""

    collections = forms.ModelMultipleChoiceField(
        label='Assigned Collections',
        queryset=Collection.objects.none(),
        required=False,
        widget=FilteredSelectMultiple('Collections', is_stacked=False),
        help_text='Collections this Editor is responsible for. Editors automatically '
                  'gain the review_contribution permission via the Editors group.',
    )

    role = forms.ChoiceField(
        label='Role',
        choices=ROLE_CHOICES,
        required=False,
        help_text='Application role: Contributor or Editor. Administrator is the '
                  'is_superuser flag below -- there is no separate Administrator group.',
    )

    class Meta(DjangoUserAdmin.form.Meta):
        _parent_fields = DjangoUserAdmin.form.Meta.fields
        if _parent_fields == '__all__':
            fields = [f.name for f in User._meta.get_fields() if f.concrete] + ['collections', 'role']
        else:
            fields = tuple(_parent_fields) + ('collections', 'role')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        collection_qs = Collection.objects.filter(is_active=True).select_related('region').order_by('name')
        self.fields['collections'].queryset = collection_qs

        if self.instance.pk and _collection_assignment_table_available():
            self.fields['collections'].initial = collection_qs.filter(
                editor_assignments__user=self.instance,
            )

        role_initial = ROLE_CONTRIBUTOR
        if self.instance.pk:
            if self.instance.groups.filter(name__iexact="Editors").exists():
                role_initial = ROLE_EDITOR
            elif (
                _collection_assignment_table_available()
                and CollectionAssignment.objects.filter(user=self.instance).exists()
            ):
                role_initial = ROLE_EDITOR
        self.fields['role'].initial = role_initial or ROLE_CONTRIBUTOR

    def _save_collections(self, request_user=None):
        if not self.instance.pk:
            return
        if not _collection_assignment_table_available():
            return

        selected_qs = self.cleaned_data.get('collections') or Collection.objects.none()
        user = self.instance
        actor = request_user or user
        selected_ids = set(selected_qs.values_list('pk', flat=True))

        CollectionAssignment.objects.filter(user=user).exclude(
            collection_id__in=selected_ids,
        ).delete()

        existing_ids = set(
            CollectionAssignment.objects.filter(user=user).values_list('collection_id', flat=True)
        )
        for pk in (selected_ids - existing_ids):
            CollectionAssignment.objects.create(
                user=user,
                collection_id=pk,
                created_by=actor,
                modified_by=actor,
            )

    def _save_role_groups(self):
        if not self.instance.pk:
            return
        role = self.cleaned_data.get("role")
        if not role:
            return

        contributors_group, _ = Group.objects.get_or_create(name="Contributors")
        editors_group, _ = Group.objects.get_or_create(name="Editors")
        user = self.instance
        user.groups.remove(contributors_group, editors_group)

        if role == ROLE_CONTRIBUTOR:
            user.groups.add(contributors_group)
        elif role == ROLE_EDITOR:
            user.groups.add(editors_group)

    def clean(self):
        cleaned = super().clean()
        role = cleaned.get("role") or ROLE_CONTRIBUTOR
        collections = cleaned.get("collections")

        from django.core.exceptions import ValidationError

        if role == ROLE_CONTRIBUTOR:
            cleaned["collections"] = Collection.objects.none()
        elif role == ROLE_EDITOR:
            if not collections or not list(collections):
                self.add_error(
                    "collections",
                    ValidationError("Editors must be assigned to at least one Collection."),
                )
        return cleaned

    def save_m2m(self):
        super().save_m2m()
        self._save_collections()
        self._save_role_groups()

    class Media:
        js = ("common/admin_user_role.js",)


try:
    admin.site.unregister(User)
except NotRegistered:
    pass

try:
    admin.site.unregister(EmailAddress)
except NotRegistered:
    pass


@admin.register(User)
class CustomUserAdmin(DjangoUserAdmin):
    form = CollectionUserChangeForm
    inlines = [EmailAddressInline]

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        if hasattr(form, '_save_collections'):
            form._save_collections(request_user=request.user)
        if hasattr(form, '_save_role_groups'):
            form._save_role_groups()

    _base_fieldsets = list(DjangoUserAdmin.fieldsets)
    try:
        _important_idx = next(
            idx
            for idx, (name, options) in enumerate(_base_fieldsets)
            if name == 'Important dates'
        )
    except StopIteration:
        _base_fieldsets.append(('Role & Collections', {'fields': ('role', 'collections')}))
    else:
        _base_fieldsets.insert(_important_idx, ('Role & Collections', {'fields': ('role', 'collections')}))

    fieldsets = tuple(_base_fieldsets)


# ========== CONTRIBUTION ADMIN ==========

@admin.register(Contribution)
class ContributionAdmin(admin.ModelAdmin):
    list_display = ["id", "contributor", "status", "get_state", "get_town", "reviewer", "created_at"]
    list_filter = ["status"]
    search_fields = ["contributor__username", "submitted_data"]
    readonly_fields = ["created_at", "updated_at", "marking"]
    actions = ["reject_contributions"]

    def get_state(self, obj):
        return (obj.submitted_data or {}).get("state", "-")
    get_state.short_description = "State"

    def get_town(self, obj):
        return (obj.submitted_data or {}).get("town", "-")
    get_town.short_description = "Town"

    @admin.action(description="Reject selected contributions (no catalog change)")
    def reject_contributions(self, request, queryset):
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


# ========== LOOKUPS ==========

@admin.register(Lettering)
class LetteringAdmin(TimestampedModelAdmin):
    resource_class = LetteringResource
    list_display = ["name"]
    search_fields = ["name"]
    ordering = ["name"]


@admin.register(Shape)
class ShapeAdmin(TimestampedModelAdmin):
    resource_class = ShapeResource
    list_display = ["name", "code"]
    search_fields = ["name", "code"]
    ordering = ["name"]


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


@admin.register(ReferenceWork)
class ReferenceWorkAdmin(TimestampedModelAdmin):
    resource_class = ReferenceWorkResource
    list_display = ["title", "authorship", "publication_year", "publisher"]
    search_fields = ["title", "authorship", "publisher", "isbn"]
    ordering = ["title"]


@admin.register(Collection)
class CollectionAdmin(ImportExportModelAdmin):
    resource_class = CollectionResource
    list_display = ['name', 'region', 'is_active', 'created_date']
    list_filter = ['is_active']
    search_fields = ['name', 'description', 'region__name', 'region__abbrev']
    raw_id_fields = ['region']

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        obj.modified_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(CollectionAssignment)
class CollectionAssignmentAdmin(ImportExportModelAdmin):
    resource_class = CollectionAssignmentResource
    list_display = ['user', 'collection', 'created_date']
    search_fields = ['user__username', 'collection__name', 'collection__region__name']
    raw_id_fields = ['user', 'collection']

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        obj.modified_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(FAQEntry)
class FAQEntryAdmin(TimestampedModelAdmin):
    resource_class = FAQEntryResource
    list_display = ("question", "is_active", "display_order")
    list_filter = ("is_active",)
    search_fields = ("question", "answer")
    ordering = ("display_order", "faq_entry_id")


###################################################################################################
