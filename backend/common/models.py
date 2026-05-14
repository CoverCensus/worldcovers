import hashlib
import uuid
from django.db import models
from django.db.models import Q, Min, Max, OuterRef, Subquery, F
from django.db.models.functions import Coalesce, Least, Greatest
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _
from django.conf import settings
from colorfield.fields import ColorField

class TimestampedModel(models.Model):
    """Abstract base model with creation and modification tracking"""
    created_date = models.DateTimeField(auto_now_add=True)
    modified_date = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='%(class)s_created')
    modified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='%(class)s_modified')

    class Meta:
        abstract = True

class Color(TimestampedModel):
    """Colors used in markings"""
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=50, unique=True)
    hex_val = ColorField(default='#FFFFFF')
    pantone_code = models.CharField(max_length=50, null=True, blank=True)

    class Meta:
        db_table = 'Colors'
        verbose_name = 'Color'
        verbose_name_plural = 'Colors'
        ordering = ['name']

    def __str__(self):
        return self.name


class MarkingType(models.TextChoices):
    TOWNMARK = 'TOWNMARK', 'Townmark'
    RATEMARK = 'RATEMARK', 'Ratemark'
    AUXMARK = 'AUXMARK', 'Auxmark'


class MarkingQuerySet(models.QuerySet):
    def with_date_range(self):
        """
        Annotate each Marking with the min/max date_seen.date values aggregated
        from two sources:
          1. DateSeen rows attached directly to the marking
             (subject_type='MARKING', subject_id=marking.id)
          2. DateSeen rows attached to covers that bear the marking via
             cover_markings (subject_type='COVER', subject_id=cover.id)
        Exposed to serializers as `earliest_seen` / `latest_seen`.

        Uses subqueries against DateSeen so the two sources can be unioned
        without producing a Cartesian explosion between cover_markings and
        directly-attached DateSeen rows.
        """
        direct_qs = DateSeen.objects.filter(
            subject_type='MARKING',
            subject_id=OuterRef('pk'),
        )
        # The CoverMarking lookup sits TWO subqueries deep: the outermost
        # query is Marking, the cover_qs Subquery (DateSeen) is one level in,
        # and the CoverMarking filter that follows is two levels in. A bare
        # `OuterRef('pk')` resolves only one level out -- it would join
        # CoverMarking.marking_id against DateSeen.pk, which is gibberish and
        # decorrelates the result so every Marking row gets the same span.
        # Django's documented idiom for two-level nesting is
        # `OuterRef(OuterRef('pk'))`; the outer wrapper hops past DateSeen
        # back up to the Marking queryset.
        cover_qs = DateSeen.objects.filter(
            subject_type='COVER',
            subject_id__in=CoverMarking.objects.filter(
                marking_id=OuterRef(OuterRef('pk')),
            ).values('cover_id'),
        )
        return self.annotate(
            earliest_seen_direct=Subquery(direct_qs.order_by('date').values('date')[:1]),
            latest_seen_direct=Subquery(direct_qs.order_by('-date').values('date')[:1]),
            earliest_seen_via_cover=Subquery(cover_qs.order_by('date').values('date')[:1]),
            latest_seen_via_cover=Subquery(cover_qs.order_by('-date').values('date')[:1]),
        ).annotate(
            # MySQL's GREATEST/LEAST return NULL if any argument is NULL, so we
            # wrap in Coalesce to fall back to whichever source has a value when
            # the other source is empty. Order of fallbacks does not affect
            # correctness because Coalesce returns the first non-null arg.
            earliest_seen=Coalesce(
                Least('earliest_seen_direct', 'earliest_seen_via_cover'),
                F('earliest_seen_direct'),
                F('earliest_seen_via_cover'),
            ),
            latest_seen=Coalesce(
                Greatest('latest_seen_direct', 'latest_seen_via_cover'),
                F('latest_seen_direct'),
                F('latest_seen_via_cover'),
            ),
        )


MARKING_DATE_FMT_CHOICES = [('MD', 'MD'), ('MDD', 'MDD'), ('YD', 'YD'), ('YMD', 'YMD'), ('YMDD', 'YMDD')]
MARKING_IMPRESSION_CHOICES = [('Normal', 'Normal'), ('Stencil', 'Stencil'), ('Negative', 'Negative')]


class Marking(TimestampedModel):
    """
    A unified postal marking row -- TOWNMARK, RATEMARK, or AUXMARK -- as
    observed on one or more Covers. Replaces the prior split Postmark /
    Ratemark / Auxmark tables.

    model.md domain type: markings
    """
    DATE_FMT_CHOICES = MARKING_DATE_FMT_CHOICES
    IMPRESSION_CHOICES = MARKING_IMPRESSION_CHOICES

    id = models.AutoField(primary_key=True)
    code = models.CharField(max_length=30, unique=True, null=True, blank=True, help_text='Editor-assigned reference identifier')
    type = models.CharField(max_length=8, choices=MarkingType.choices, help_text='Functional classification of this marking')
    catalog_txt = models.TextField(null=True, blank=True, help_text='Authoritative ASCC catalog entry text for this listing')
    inscription_txt = models.TextField(help_text='Text as physically inscribed on the marking')
    desc = models.TextField(null=True, blank=True, help_text='Free-text contributor annotation')
    is_manuscript = models.BooleanField()
    shape = models.ForeignKey('Shape', on_delete=models.PROTECT, null=True, blank=True, related_name='markings')
    lettering = models.ForeignKey('Lettering', on_delete=models.PROTECT, null=True, blank=True, related_name='markings')
    color = models.ForeignKey(Color, on_delete=models.PROTECT, default=1, related_name='markings')
    is_irreg = models.BooleanField(null=True, blank=True)
    width = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, help_text='Horizontal dimension in millimeters')
    height = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, help_text='Vertical dimension in millimeters')
    date_fmt = models.CharField(max_length=10, choices=MARKING_DATE_FMT_CHOICES, null=True, blank=True)
    impression = models.CharField(max_length=10, choices=MARKING_IMPRESSION_CHOICES, null=True, blank=True)
    rate_val = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text='Non-negative rate amount; most common on RATEMARK and integrated-rate TOWNMARK rows')
    post_office = models.ForeignKey('PostOffice', on_delete=models.PROTECT, related_name='markings')

    objects = MarkingQuerySet.as_manager()

    class Meta:
        db_table = 'Markings'
        verbose_name = 'Marking'
        verbose_name_plural = 'Markings'
        ordering = ['id']
        constraints = [
            models.CheckConstraint(
                check=Q(type__in=[c[0] for c in MarkingType.choices]),
                name='marking_type_valid',
            ),
            models.CheckConstraint(
                check=Q(date_fmt__isnull=True) | Q(date_fmt__in=[c[0] for c in MARKING_DATE_FMT_CHOICES]),
                name='marking_date_fmt_valid',
            ),
            models.CheckConstraint(
                check=Q(impression__isnull=True) | Q(impression__in=[c[0] for c in MARKING_IMPRESSION_CHOICES]),
                name='marking_impression_valid',
            ),
            models.CheckConstraint(
                check=(
                    Q(is_manuscript=True, lettering__isnull=True, shape__isnull=True, is_irreg__isnull=True)
                    | Q(is_manuscript=False, shape__isnull=False, is_irreg__isnull=False)
                ),
                name='marking_manuscript_consistency',
            ),
        ]

    def clean(self):
        super().clean()
        if self.is_manuscript:
            if self.lettering_id is not None:
                raise ValidationError({'lettering': 'Must be null when is_manuscript is true.'})
            if self.shape_id is not None:
                raise ValidationError({'shape': 'Must be null when is_manuscript is true.'})
            if self.is_irreg is not None:
                raise ValidationError({'is_irreg': 'Must be null when is_manuscript is true.'})
        else:
            if self.shape_id is None:
                raise ValidationError({'shape': 'Required when is_manuscript is false.'})
            if self.is_irreg is None:
                self.is_irreg = False

    def save(self, *args, **kwargs):
        if self.is_manuscript:
            self.lettering = None
            self.shape = None
            self.is_irreg = None
        else:
            if self.is_irreg is None:
                self.is_irreg = False
        super().save(*args, **kwargs)

    def __str__(self):
        if self.code:
            return f'{self.type} {self.code}'
        return f'{self.type} #{self.pk}'


class Contribution(models.Model):
    """
    Moderation ticket for catalog contributions.
    Submissions create a Contribution instead of directly updating the catalog.
    Editors approve/reject; on approval, submitted_data is applied to Marking.
    """
    STATUS_DRAFT = "draft"
    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_NEEDS_REVISION = "needs_revision"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_NEEDS_REVISION, "Needs revision"),
    ]
    id = models.AutoField(primary_key=True)
    contributor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='contributions')
    marking = models.OneToOneField(Marking, on_delete=models.CASCADE, related_name='contribution', null=True, blank=True, help_text='Set when approved; Marking created from submitted_data for new entries')
    # Routing target: which institutional Collection this contribution belongs to.
    # Resolved at submit time from the contributor-supplied state. NOT NULL — every
    # contribution must land in a Collection so the right Editors see it.
    collection = models.ForeignKey('Collection', on_delete=models.PROTECT, related_name='contributions')
    submitted_data = models.JSONField(default=dict, blank=True, help_text='Proposed changes (state, town, type, color, description, etc.)')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_contributions')
    review_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'Contributions'
        verbose_name = 'Contribution'
        verbose_name_plural = 'Contributions'
        ordering = ['-created_at']
        permissions = [
            ('review_contribution', 'Can review (approve / reject) contributions'),
        ]

    def __str__(self):
        return f'Contribution #{self.id} ({self.status})'

    def apply_to_catalog(self):
        from common.contribution_apply import apply_contribution_to_catalog
        return apply_contribution_to_catalog(self)


class SubmissionTransaction(models.Model):
    """Immutable audit events for submission and moderation workflows."""
    ACTION_SUBMIT = "submit"
    ACTION_EDIT_SUBMISSION = "edit_submission"
    ACTION_EDITOR_EDIT = "editor_edit"
    ACTION_APPROVE = "approve"
    ACTION_REJECT = "reject"
    ACTION_CATALOG_DIRECT_EDIT = "catalog_direct_edit"
    ACTION_RESTORE_VERSION = "restore_version"
    ACTION_RECORD_CREATE = "record_create"
    ACTION_RECORD_UPDATE = "record_update"
    ACTION_RECORD_DELETE = "record_delete"
    ACTION_CHOICES = [
        (ACTION_SUBMIT, "Submit"),
        (ACTION_EDIT_SUBMISSION, "Edit submission"),
        (ACTION_EDITOR_EDIT, "Editor edit"),
        (ACTION_APPROVE, "Approve"),
        (ACTION_REJECT, "Reject"),
        (ACTION_CATALOG_DIRECT_EDIT, "Catalog direct edit"),
        (ACTION_RESTORE_VERSION, "Restore version"),
        (ACTION_RECORD_CREATE, "Record create"),
        (ACTION_RECORD_UPDATE, "Record update"),
        (ACTION_RECORD_DELETE, "Record delete"),
    ]

    SOURCE_CONTRIBUTOR_PORTAL = "contributor_portal"
    SOURCE_EDITOR_PORTAL = "editor_portal"
    SOURCE_SYSTEM = "system"
    SOURCE_CHOICES = [
        (SOURCE_CONTRIBUTOR_PORTAL, "Contributor portal"),
        (SOURCE_EDITOR_PORTAL, "Editor portal"),
        (SOURCE_SYSTEM, "System"),
    ]

    id = models.AutoField(primary_key=True)
    transaction_uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="submission_transactions",
    )
    action = models.CharField(max_length=40, choices=ACTION_CHOICES)
    contribution = models.ForeignKey(
        Contribution,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transactions",
    )
    marking = models.ForeignKey(
        Marking,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transactions",
    )
    source = models.CharField(max_length=30, choices=SOURCE_CHOICES, default=SOURCE_SYSTEM)
    before_payload = models.JSONField(default=dict, blank=True)
    after_payload = models.JSONField(default=dict, blank=True)
    diff_payload = models.JSONField(default=list, blank=True)
    extra_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "SubmissionTransactions"
        verbose_name = "Submission Transaction"
        verbose_name_plural = "Submission Transactions"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["marking", "created_at"]),
            models.Index(fields=["contribution", "created_at"]),
            models.Index(fields=["actor", "created_at"]),
            models.Index(fields=["action", "created_at"]),
        ]

    def __str__(self):
        return f"Transaction #{self.id} ({self.action})"


class MarkingVersion(models.Model):
    """Snapshot history for recoverable marking states."""
    id = models.AutoField(primary_key=True)
    marking = models.ForeignKey(Marking, on_delete=models.CASCADE, related_name="versions")
    version_no = models.PositiveIntegerField()
    snapshot = models.JSONField(default=dict, blank=True)
    transaction = models.ForeignKey(
        SubmissionTransaction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="versions",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="marking_versions_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "MarkingVersions"
        verbose_name = "Marking Version"
        verbose_name_plural = "Marking Versions"
        ordering = ["-version_no", "-id"]
        unique_together = [["marking", "version_no"]]
        indexes = [
            models.Index(fields=["marking", "version_no"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"Marking #{self.marking_id} v{self.version_no}"


IMAGE_MARKING_VIEW_CHOICES = ['FULL', 'DETAIL']
IMAGE_COVER_VIEW_CHOICES = ['FRONT', 'BACK', 'INTERIOR', 'DETAIL']
IMAGE_VIEW_CHOICES_TUPLES = [(v, v.title()) for v in sorted(set(IMAGE_MARKING_VIEW_CHOICES + IMAGE_COVER_VIEW_CHOICES))]


class Image(TimestampedModel):
    """
    Polymorphic image attached to either a Cover or a Marking, keyed by
    (subject_type, subject_id). Replaces the old per-subject image tables.
    """
    SUBJECT_COVER = 'COVER'
    SUBJECT_MARKING = 'MARKING'
    SUBJECT_TYPE_CHOICES = [(SUBJECT_COVER, 'Cover'), (SUBJECT_MARKING, 'Marking')]

    MARKING_VIEW_CHOICES = IMAGE_MARKING_VIEW_CHOICES
    COVER_VIEW_CHOICES = IMAGE_COVER_VIEW_CHOICES
    IMAGE_VIEW_CHOICES = IMAGE_VIEW_CHOICES_TUPLES

    image_id = models.AutoField(primary_key=True)
    subject_type = models.CharField(max_length=8, choices=SUBJECT_TYPE_CHOICES)
    subject_id = models.PositiveIntegerField()
    original_filename = models.CharField(max_length=255)
    storage_filename = models.CharField(max_length=255, unique=True)
    file_checksum = models.CharField(max_length=64)
    mime_type = models.CharField(max_length=64)
    image_width = models.IntegerField()
    image_height = models.IntegerField()
    file_size_bytes = models.BigIntegerField()
    image_view = models.CharField(max_length=16, choices=IMAGE_VIEW_CHOICES_TUPLES)
    image_description = models.TextField(blank=True)
    is_tracing = models.BooleanField(default=False)
    display_order = models.IntegerField(default=0)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='images_uploaded')

    class Meta:
        db_table = 'images'
        verbose_name = 'Image'
        verbose_name_plural = 'Images'
        ordering = ['subject_type', 'subject_id', 'display_order']
        indexes = [
            models.Index(fields=['subject_type', 'subject_id', 'display_order']),
            models.Index(fields=['file_checksum']),
        ]
        constraints = [
            models.CheckConstraint(
                check=(
                    Q(subject_type='MARKING', image_view__in=IMAGE_MARKING_VIEW_CHOICES)
                    | Q(subject_type='COVER', image_view__in=IMAGE_COVER_VIEW_CHOICES)
                ),
                name='image_view_matches_subject_type',
            ),
        ]
        permissions = [
            ('approve_image', 'Can approve / reject image submissions'),
        ]

    def clean(self):
        super().clean()
        if self.subject_type == self.SUBJECT_MARKING:
            if self.image_view not in self.MARKING_VIEW_CHOICES:
                raise ValidationError({'image_view': f'Must be one of {self.MARKING_VIEW_CHOICES} when subject_type=MARKING.'})
        elif self.subject_type == self.SUBJECT_COVER:
            if self.image_view not in self.COVER_VIEW_CHOICES:
                raise ValidationError({'image_view': f'Must be one of {self.COVER_VIEW_CHOICES} when subject_type=COVER.'})

    def save(self, *args, **kwargs):
        if not self.file_checksum and hasattr(self, 'file_object'):
            self.file_checksum = self.generate_checksum(self.file_object)
        super().save(*args, **kwargs)

    @staticmethod
    def generate_checksum(file_object):
        sha256_hash = hashlib.sha256()
        for byte_block in iter(lambda: file_object.read(4096), b''):
            sha256_hash.update(byte_block)
        file_object.seek(0)
        return sha256_hash.hexdigest()

    def __str__(self):
        return f'{self.subject_type} #{self.subject_id} - {self.original_filename}'


class Postcover(TimestampedModel):
    """Physical postal covers/envelopes that collectors own"""
    postcover_id = models.AutoField(primary_key=True)
    owner_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='postcovers_owned')
    postcover_key = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)

    class Meta:
        db_table = 'Postcovers'
        verbose_name = 'Example Cover'
        verbose_name_plural = 'Example Covers'
        indexes = [models.Index(fields=['owner_user']), models.Index(fields=['postcover_key'])]

    def __str__(self):
        return f'{self.postcover_key} (Owner: {self.owner_user})'

class PostcoverImage(TimestampedModel):
    """Images of physical postal covers"""
    IMAGE_VIEW_CHOICES = [('FRONT', 'Front'), ('BACK', 'Back'), ('INTERIOR', 'Interior'), ('DETAIL', 'Detail')]
    postcover_image_id = models.AutoField(primary_key=True)
    postcover = models.ForeignKey(Postcover, on_delete=models.CASCADE, related_name='images')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='postcover_images_uploaded')
    original_filename = models.CharField(max_length=255)
    storage_filename = models.CharField(max_length=255, unique=True)
    file_checksum = models.CharField(max_length=64)
    mime_type = models.CharField(max_length=50)
    image_width = models.IntegerField()
    image_height = models.IntegerField()
    file_size_bytes = models.BigIntegerField()
    image_view = models.CharField(max_length=20, choices=IMAGE_VIEW_CHOICES)
    image_description = models.TextField(blank=True)
    display_order = models.IntegerField(default=0)

    class Meta:
        db_table = 'PostcoverImages'
        verbose_name = 'Example Image'
        verbose_name_plural = 'Example Images'
        ordering = ['postcover', 'display_order']
        indexes = [models.Index(fields=['postcover', 'display_order']), models.Index(fields=['file_checksum'])]

    def __str__(self):
        return f'{self.postcover} - {self.original_filename}'

    def save(self, *args, **kwargs):
        """Generate file checksum if not provided"""
        if not self.file_checksum and hasattr(self, 'file_object'):
            self.file_checksum = Image.generate_checksum(self.file_object)
        super().save(*args, **kwargs)

class Collection(TimestampedModel):
    """
    An institutional collection — a curatorial unit that wraps exactly one Region
    and has many Editor assignments. Contributions are routed to a Collection
    based on the state submitted; only Editors assigned to that Collection
    (or a superuser/Administrator) may review them.
    """
    name = models.CharField(max_length=200, help_text='Display name for this Collection (e.g. "Virginia").')
    description = models.TextField(blank=True)
    region = models.OneToOneField(
        'Region',
        on_delete=models.PROTECT,
        related_name='collection',
        help_text='The Region this Collection covers. One Collection per Region.',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'Collections'
        verbose_name = 'Collection'
        verbose_name_plural = 'Collections'
        ordering = ['name']

    def __str__(self):
        return self.name


class CollectionAssignment(TimestampedModel):
    """Links an Editor to a Collection they are responsible for curating."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='collection_assignments',
    )
    collection = models.ForeignKey(
        Collection,
        on_delete=models.CASCADE,
        related_name='editor_assignments',
    )

    class Meta:
        db_table = 'CollectionAssignments'
        verbose_name = 'Collection assignment'
        verbose_name_plural = 'Collection assignments'
        unique_together = [['user', 'collection']]
        ordering = ['collection', 'user']

    def __str__(self):
        return f'{self.user} → {self.collection}'

    def save(self, *args, **kwargs):
        """
        On assignment, ensure the user is in the Editors group so that group-level
        permissions (review_contribution, change_postmark, etc.) are granted
        immediately. Removal is intentionally NOT auto-demoted — admins explicitly
        remove from Editors group via the user admin if they want to revoke perms.
        """
        creating = self._state.adding
        super().save(*args, **kwargs)
        if creating:
            from django.contrib.auth.models import Group
            try:
                editors_group = Group.objects.get(name='Editors')
            except Group.DoesNotExist:
                return
            self.user.groups.add(editors_group)

class FAQEntry(TimestampedModel):
    """
    Simple FAQ entry for the public site, managed in Django admin
    and exposed to the SPA via a read-only API.
    """
    faq_entry_id = models.AutoField(primary_key=True)
    question = models.CharField(max_length=500)
    answer = models.TextField()
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0, help_text='Lower numbers appear first.')

    class Meta:
        db_table = 'FAQEntries'
        verbose_name = 'FAQ entry'
        verbose_name_plural = 'FAQ entries'
        ordering = ['display_order', 'faq_entry_id']

    def __str__(self):
        return self.question[:100]

class Region(TimestampedModel):
    """
    A named geographic or administrative area used to organize PostOffices
    within a historical hierarchy. Self-referential for nesting.

    model.md domain type: Region
    """
    REGION_TIER_CHOICES = [('COUNTRY', 'Country'), ('TERRITORY', 'Territory'), ('STATE', 'State'), ('PROVINCE', 'Province'), ('COUNTY', 'County'), ('CITY', 'City'), ('DISTRICT', 'District'), ('OTHER', 'Other')]
    name = models.CharField(max_length=100, help_text='Canonical region name for the applicable historical period')
    abbrev = models.CharField(max_length=3, help_text='Canonical two or three character abbreviation')
    region_tier = models.CharField(max_length=9, choices=REGION_TIER_CHOICES)
    parent_region = models.ForeignKey('self', on_delete=models.PROTECT, null=True, blank=True, related_name='child_regions')
    established_date = models.DateField(null=True, blank=True, help_text='First date this Region definition is considered in force')
    defunct_date = models.DateField(null=True, blank=True, help_text='Last date this Region definition is in force; null = active')

    class Meta:
        verbose_name = 'Region'
        verbose_name_plural = 'Regions'
        ordering = ['name']

    def __str__(self):
        return self.name

class PostOffice(TimestampedModel):
    """
    A postal facility identified as a fixed geographic place. Its political
    jurisdiction over time is recorded as a set of associations to regions
    in post_office_regions; the post office row itself does not name a
    single region.

    model.md domain type: PostOffice
    """
    name = models.CharField(max_length=255, help_text='Normalized town name, e.g. Abingdon, Richmond')

    class Meta:
        db_table = 'post_office'
        verbose_name = 'Post Office'
        verbose_name_plural = 'Post Offices'
        ordering = ['name']

    def __str__(self):
        r = self.region
        return f'{self.name} ({r})' if r is not None else self.name

    @property
    def region(self):
        # Resolve the most-recent active Region linked via the
        # post_office_regions junction. "Active" means defunct_date IS NULL;
        # NULLS-FIRST on defunct_date_desc puts active rows ahead of expired
        # ones, then we tie-break by latest established_date.
        link = (
            self.post_office_regions
            .select_related('region')
            .order_by(
                F('region__defunct_date').desc(nulls_first=True),
                F('region__established_date').desc(nulls_last=True),
            )
            .first()
        )
        return link.region if link is not None else None

class PostOfficeRegion(TimestampedModel):
    """
    Association linking a PostOffice to a Region under whose jurisdiction
    it operated. Temporal bounds are derived from Region.established_date
    and Region.defunct_date; this junction carries no temporal columns.

    model.md domain type: post_office_regions
    """
    post_office = models.ForeignKey(PostOffice, on_delete=models.CASCADE, related_name='post_office_regions')
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name='post_office_regions')

    class Meta:
        db_table = 'post_office_region'
        verbose_name = 'Post Office Region'
        verbose_name_plural = 'Post Office Regions'
        unique_together = [['post_office', 'region']]
        ordering = ['post_office__name', 'region__name']

    def __str__(self):
        return f'{self.post_office.name} -- {self.region.name}'

class Lettering(TimestampedModel):
    """
    Editorial value table for textual styling assigned to a postal marking.

    model.md domain type: Lettering
    Seed values: Italic, Serif, Sans-serif, Small, Large, Outline, Bold, Block,
    Gothic.
    """
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        verbose_name = 'Lettering'
        verbose_name_plural = 'Letterings'
        ordering = ['name']

    def __str__(self):
        return self.name

class Shape(TimestampedModel):
    """
    Editorial value table for the primary form assigned to a postal marking.

    model.md domain type: Shape
    Seed values: SL, BOX, O, C, ARC, Octagon, Pictorial, Ornamental Mortised, Other.
    """
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=30, unique=True, null=True, blank=True, help_text='Editor-assigned reference identifier')

    class Meta:
        verbose_name = 'Shape'
        verbose_name_plural = 'Shapes'
        ordering = ['name']

    def __str__(self):
        return self.name

class Cover(TimestampedModel):
    """
    A physical postal cover with recorded postal markings.

    model.md domain type: Cover
    """
    COVER_TYPE_CHOICES = [('FC', 'Folded Cover'), ('FL', 'Folded Letter')]
    code = models.CharField(max_length=30, unique=True, null=True, blank=True, db_column='code', help_text='Editor-assigned reference identifier')
    color = models.ForeignKey(Color, on_delete=models.PROTECT, null=True, blank=True, related_name='covers', help_text='Ink or material color of the cover itself')
    type = models.CharField(max_length=2, choices=COVER_TYPE_CHOICES, null=True, blank=True)
    has_adhesive = models.BooleanField(default=False, help_text='Whether the cover bears an adhesive stamp')
    height = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='Vertical dimension in millimeters')
    is_institutional = models.BooleanField(null=True, blank=True, help_text='Institutionally owned (museum, society, etc.)')
    width = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='Horizontal dimension in millimeters')

    class Meta:
        verbose_name = 'Cover'
        verbose_name_plural = 'Covers'
        ordering = ['id']

    def __str__(self):
        if self.code:
            return f'Cover {self.code}'
        return f'Cover #{self.pk}'

class DateSeen(TimestampedModel):
    """
    A single date point observed for either a Cover or a Marking.
    Polymorphic via (subject_type, subject_id), mirroring the Citation /
    Image polymorphic pattern.

    model.md domain type: dates_seen
    """
    SUBJECT_COVER = 'COVER'
    SUBJECT_MARKING = 'MARKING'
    SUBJECT_TYPE_CHOICES = [(SUBJECT_COVER, 'Cover'), (SUBJECT_MARKING, 'Marking')]

    GRANULARITY_CHOICES = [('DAY', 'Day'), ('MONTH', 'Month'), ('YEAR', 'Year')]

    subject_type = models.CharField(max_length=8, choices=SUBJECT_TYPE_CHOICES)
    subject_id = models.PositiveIntegerField(help_text='PK of the dated Cover or Marking')
    date = models.DateField(help_text='Calendar date of the observed use')
    granularity = models.CharField(max_length=5, choices=GRANULARITY_CHOICES)

    class Meta:
        db_table = 'dates_seen'
        verbose_name = 'Date Seen'
        verbose_name_plural = 'Dates Seen'
        ordering = ['subject_type', 'subject_id', 'date']
        indexes = [
            models.Index(fields=['subject_type', 'subject_id', 'date'], name='dates_seen_subject_date_idx'),
        ]
        constraints = [
            models.CheckConstraint(
                check=Q(subject_type__in=['COVER', 'MARKING']),
                name='dates_seen_subject_type_valid',
            ),
        ]

    def __str__(self):
        return f'{self.subject_type} #{self.subject_id} -- {self.date} ({self.granularity})'


class CoverValuation(TimestampedModel):
    """
    Estimated collector market value for a cover.

    model.md domain type: cover_valuations
    """
    id = models.AutoField(primary_key=True)
    cover = models.ForeignKey(Cover, on_delete=models.CASCADE, related_name='valuations')
    amt = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text='Non-negative USD; null = unpriced entry')
    appraisal_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'cover_valuation'
        verbose_name = 'Cover Valuation'
        verbose_name_plural = 'Cover Valuations'
        ordering = ['-appraisal_date']

    def __str__(self):
        return f'Cover #{self.cover_id} - ${self.amt} ({self.appraisal_date})'


class CoverMarking(TimestampedModel):
    """
    Junction linking a Cover to a Marking, with positional context describing
    how the marking appears on that cover.

    model.md domain type: cover_markings
    """
    cover = models.ForeignKey(Cover, on_delete=models.CASCADE, related_name='cover_markings')
    marking = models.ForeignKey(Marking, on_delete=models.CASCADE, related_name='cover_markings')
    is_backstamp = models.BooleanField(default=False, help_text='Whether this marking appears on the reverse of the cover')
    placement = models.CharField(max_length=64, null=True, blank=True, help_text='Free-form placement qualifier; vocabulary not yet enumerated')

    class Meta:
        db_table = 'cover_marking'
        verbose_name = 'Cover Marking'
        verbose_name_plural = 'Cover Markings'
        unique_together = [['cover', 'marking']]

    def __str__(self):
        return f'Cover #{self.cover_id} <-> Marking #{self.marking_id}'


class ReferenceWork(TimestampedModel):
    """
    A citable publication or source.

    model.md domain type: ReferenceWork
    """
    code = models.CharField(max_length=30, unique=True, null=True, blank=True, help_text='Editor-assigned reference identifier')
    title = models.CharField(max_length=500)
    authorship = models.CharField(max_length=500, help_text='Author(s) or Editor(s) of the publication')
    publisher = models.CharField(max_length=255)
    publication_year = models.IntegerField()
    edition = models.CharField(max_length=50, null=True, blank=True, help_text='Released version of publication')
    volume = models.CharField(max_length=50, null=True, blank=True, help_text='Identifier for a multi-volume series')
    isbn = models.CharField(max_length=20, null=True, blank=True)
    url = models.URLField(max_length=2000, null=True, blank=True)

    class Meta:
        db_table = 'reference_work'
        verbose_name = 'Reference Work'
        verbose_name_plural = 'Reference Works'
        ordering = ['title']

    def __str__(self):
        label = self.code or self.title
        return f'{label} ({self.publication_year})'

class Citation(TimestampedModel):
    """
    Links a ReferenceWork to a Cover or Marking.
    Polymorphic via subjectType/subjectId.

    model.md domain type: citations
    """
    SUBJECT_TYPE_CHOICES = [('COVER', 'Cover'), ('MARKING', 'Marking')]
    reference_work = models.ForeignKey(ReferenceWork, on_delete=models.PROTECT, related_name='citations')
    subject_type = models.CharField(max_length=20, choices=SUBJECT_TYPE_CHOICES)
    subject_id = models.PositiveIntegerField(help_text='PK of the referenced Cover or Marking')
    citation_detail = models.CharField(max_length=500, help_text='Page, section, or URL within the reference work')

    class Meta:
        verbose_name = 'Citation'
        verbose_name_plural = 'Citations'
        ordering = ['reference_work', 'subject_type', 'subject_id']
        constraints = [
            models.CheckConstraint(
                check=Q(subject_type__in=['COVER', 'MARKING']),
                name='citation_subject_type_valid',
            ),
        ]

    def __str__(self):
        return f'{self.reference_work} -> {self.subject_type} #{self.subject_id}'
