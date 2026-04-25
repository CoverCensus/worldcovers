import hashlib
import uuid
from django.db import models
from django.db.models import Q
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
    """Colors used in postmarks"""
    color_id = models.AutoField(primary_key=True)
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


class Postmark(TimestampedModel):
    """
    A town marking device (or manuscript marking) as observed on one or more Covers.

    model.md domain type: Postmark
    """
    DATE_TYPE_CHOICES = [('BISHOP MARK', 'Bishop Mark'), ('FRANKLIN MARK', 'Franklin Mark'), ('QUAKER DATE', 'Quaker Date')]
    DATE_FMT_CHOICES = [('MD', 'MD'), ('MDD', 'MDD'), ('YD', 'YD'), ('YMD', 'YMD'), ('YMDD', 'YMDD')]
    IMPRESSION_CHOICES = [('Normal', 'Normal'), ('Stencil', 'Stencil'), ('Negative', 'Negative')]
    postmark_id = models.AutoField(primary_key=True)
    code = models.CharField(max_length=30, unique=True, null=True, blank=True, help_text='Editor-assigned reference identifier')
    catalog_txt = models.TextField(blank=True, help_text='Authoritative catalog entry text for this listing')
    inscription_txt = models.TextField(blank=True, help_text='Text as physically inscribed on the town marking device')
    post_office = models.ForeignKey('PostOffice', on_delete=models.PROTECT, null=True, blank=True, related_name='postmarks')
    shape = models.ForeignKey('Shape', on_delete=models.PROTECT, null=True, blank=True, related_name='postmarks')
    lettering = models.ForeignKey('Lettering', on_delete=models.PROTECT, null=True, blank=True, related_name='postmarks')
    color = models.ForeignKey(Color, on_delete=models.PROTECT, null=True, blank=True, related_name='postmarks')
    is_manuscript = models.BooleanField(default=False)
    impression = models.CharField(max_length=10, choices=IMPRESSION_CHOICES, null=True, blank=True)
    is_irreg = models.BooleanField(null=True, blank=True)
    width = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    height = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    date_type = models.CharField(max_length=20, choices=DATE_TYPE_CHOICES, null=True, blank=True)
    date_fmt = models.CharField(max_length=10, choices=DATE_FMT_CHOICES, null=True, blank=True)

    class Meta:
        db_table = 'Postmarks'
        verbose_name = 'Postmark'
        verbose_name_plural = 'Postmarks'
        ordering = ['postmark_id']

    def __str__(self):
        if self.code:
            return f'Postmark {self.code}'
        if self.post_office_id:
            try:
                return f'Postmark #{self.pk} ({self.post_office})'
            except Exception:
                pass
        return f'Postmark #{self.pk}'


class Contribution(models.Model):
    """
    Moderation ticket for catalog contributions.
    Submissions create a Contribution instead of directly updating the catalog.
    Editors approve/reject; on approval, submitted_data is applied to Postmark.
    """
    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_NEEDS_REVISION = 'needs_revision'
    STATUS_CHOICES = [(STATUS_PENDING, 'Pending'), (STATUS_APPROVED, 'Approved'), (STATUS_REJECTED, 'Rejected'), (STATUS_NEEDS_REVISION, 'Needs revision')]
    id = models.AutoField(primary_key=True)
    contributor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='contributions')
    postmark = models.OneToOneField(Postmark, on_delete=models.CASCADE, related_name='contribution', null=True, blank=True, help_text='Set when approved; Postmark created from submitted_data for new entries')
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
    postmark = models.ForeignKey(
        Postmark,
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
            models.Index(fields=["postmark", "created_at"]),
            models.Index(fields=["contribution", "created_at"]),
            models.Index(fields=["actor", "created_at"]),
            models.Index(fields=["action", "created_at"]),
        ]

    def __str__(self):
        return f"Transaction #{self.id} ({self.action})"


class PostmarkVersion(models.Model):
    """Snapshot history for recoverable postmark states."""
    id = models.AutoField(primary_key=True)
    postmark = models.ForeignKey(Postmark, on_delete=models.CASCADE, related_name="versions")
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
        related_name="postmark_versions_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "PostmarkVersions"
        verbose_name = "Postmark Version"
        verbose_name_plural = "Postmark Versions"
        ordering = ["-version_no", "-id"]
        unique_together = [["postmark", "version_no"]]
        indexes = [
            models.Index(fields=["postmark", "version_no"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"Postmark #{self.postmark_id} v{self.version_no}"


class PostmarkValuation(TimestampedModel):
    """Valuations for postmarks"""
    postmark_valuation_id = models.AutoField(primary_key=True)
    postmark = models.ForeignKey(Postmark, on_delete=models.CASCADE, related_name='valuations')
    appraisal_pos = models.PositiveSmallIntegerField(default=0, help_text='Ordinal position within the postmark valuation sequence')
    amt = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text='Non-negative USD; null = unpriced entry')
    appraisal_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'PostmarkValuations'
        verbose_name = 'Postmark Valuation'
        verbose_name_plural = 'Postmark Valuations'
        unique_together = [['postmark', 'appraisal_pos']]
        ordering = ['-appraisal_date']

    def __str__(self):
        return f'{self.postmark} - ${self.amt} ({self.appraisal_date})'


class PostmarkImage(TimestampedModel):
    """Images of postmarks with metadata"""
    IMAGE_VIEW_CHOICES = [('FULL', 'Full'), ('DETAIL', 'Detail'), ('COMPARISON', 'Comparison')]
    postmark_image_id = models.AutoField(primary_key=True)
    postmark = models.ForeignKey(Postmark, on_delete=models.CASCADE, related_name='images')
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
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='postmark_images_uploaded')

    class Meta:
        db_table = 'PostmarkImages'
        verbose_name = 'Listing Image'
        verbose_name_plural = 'Listing Images'
        ordering = ['postmark', 'display_order']
        indexes = [models.Index(fields=['postmark', 'display_order']), models.Index(fields=['file_checksum'])]
        permissions = [
            ('approve_postmarkimage', 'Can approve / reject postmark image submissions'),
        ]

    def __str__(self):
        """
        Robust string representation that tolerates missing or invalid
        related Postmark records, so that admin views never crash.
        """
        try:
            postmark_display = str(self.postmark) if self.postmark_id else 'Orphan'
        except Exception:
            postmark_display = 'Orphan'
        return f'{postmark_display} - {self.original_filename}'

    def save(self, *args, **kwargs):
        """Generate file checksum if not provided"""
        if not self.file_checksum and hasattr(self, 'file_object'):
            self.file_checksum = self.generate_checksum(self.file_object)
        super().save(*args, **kwargs)

    @staticmethod
    def generate_checksum(file_object):
        """Generate SHA-256 checksum for file"""
        sha256_hash = hashlib.sha256()
        for byte_block in iter(lambda: file_object.read(4096), b''):
            sha256_hash.update(byte_block)
        file_object.seek(0)
        return sha256_hash.hexdigest()

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

class PostcoverPostmark(TimestampedModel):
    """Many-to-many relationship: Postcovers contain Postmarks"""
    POSTMARK_LOCATION_CHOICES = [('FRONT', 'Front'), ('BACK', 'Back'), ('FRONT_UPPER_RIGHT', 'Front Upper Right'), ('FRONT_UPPER_LEFT', 'Front Upper Left'), ('BACK_UPPER_RIGHT', 'Back Upper Right'), ('BACK_UPPER_LEFT', 'Back Upper Left'), ('BACK_LOWER_LEFT', 'Back Lower Left'), ('BACK_LOWER_RIGHT', 'Back Lower Right')]
    postcover_postmark_id = models.AutoField(primary_key=True)
    postcover = models.ForeignKey(Postcover, on_delete=models.CASCADE, related_name='postcover_postmarks')
    postmark = models.ForeignKey(Postmark, on_delete=models.CASCADE, related_name='postcover_postmarks')
    position_order = models.IntegerField()
    postmark_location = models.CharField(max_length=20, choices=POSTMARK_LOCATION_CHOICES)

    class Meta:
        db_table = 'PostcoverPostmarks'
        verbose_name = 'Example Cover Marking'
        verbose_name_plural = 'Example Cover Markings'
        unique_together = [['postcover', 'postmark', 'position_order']]
        ordering = ['postcover', 'position_order']

    def __str__(self):
        return f'{self.postcover} - {self.postmark} (Position {self.position_order})'

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
            self.file_checksum = PostmarkImage.generate_checksum(self.file_object)
        super().save(*args, **kwargs)

class LegacyAbbreviation(models.Model):
    """TBLABBREVIATIONS: abbreviation → meaning (e.g. Arc, Box, DL)."""
    id = models.AutoField(primary_key=True, db_column='ID')
    txt_abbreviation = models.CharField(max_length=100, db_column='txtAbbreviation')
    txt_meaning = models.CharField(max_length=255, blank=True, db_column='txtMeaning')
    n_order = models.IntegerField(default=0, db_column='nOrder')
    yn_active = models.BooleanField(default=True, db_column='ynActive')

    class Meta:
        db_table = 'LegacyAbbreviations'
        verbose_name = 'Legacy Abbreviation'
        ordering = ['n_order', 'txt_abbreviation']

    def __str__(self):
        return f'{self.txt_abbreviation}: {self.txt_meaning}'

class LegacyRateLocation(models.Model):
    """TBLTOWNMARKRATELOCATION: rate location lookup."""
    id = models.AutoField(primary_key=True, db_column='nTownmarkRateLocationID')
    txt_townmark_rate_location = models.CharField(max_length=100, db_column='txtTownmarkRateLocation')
    mem_townmark_rate_location = models.CharField(max_length=255, blank=True, db_column='memTownmarkRateLocation')
    n_order = models.IntegerField(default=0, db_column='nOrder')
    yn_active = models.BooleanField(default=True, db_column='ynActive')

    class Meta:
        db_table = 'LegacyTownmarkRateLocations'
        verbose_name = 'Legacy Rate Location'
        ordering = ['n_order']

    def __str__(self):
        return self.txt_townmark_rate_location

class LegacyRateValue(models.Model):
    """TBLTOWNMARKRATEVALUE: rate value lookup (numeric or text)."""
    id = models.AutoField(primary_key=True, db_column='nTownmarkRateValueID')
    txt_townmark_rate_value = models.CharField(max_length=50, db_column='txtTownmarkRateValue')
    n_order = models.IntegerField(default=0, db_column='nOrder')
    yn_active = models.BooleanField(default=True, db_column='ynActive')

    class Meta:
        db_table = 'LegacyTownmarkRateValues'
        verbose_name = 'Legacy Rate Value'
        ordering = ['n_order']

    def __str__(self):
        return str(self.txt_townmark_rate_value)

class LegacyParseStep(models.Model):
    """TBLPARSESTEPS: parse step per state."""
    id = models.AutoField(primary_key=True, db_column='nParseStepID')
    txt_parse_step = models.CharField(max_length=255, db_column='txtParseStep')
    n_state_id = models.IntegerField(db_column='nStateID')
    yn_completed = models.BooleanField(default=False, db_column='ynCompleted')
    n_order = models.IntegerField(default=0, db_column='nOrder')
    yn_active = models.BooleanField(default=True, db_column='ynActive')

    class Meta:
        db_table = 'LegacyParseSteps'
        verbose_name = 'Legacy Parse Step'
        ordering = ['n_state_id', 'n_order']

    def __str__(self):
        return f'{self.txt_parse_step} (State {self.n_state_id})'

class LegacyUserState(models.Model):
    """CTUSERSTATES: user ↔ state visibility/roles."""
    id = models.AutoField(primary_key=True, db_column='ID')
    n_user_id = models.IntegerField(db_column='nUserID')
    n_state_id = models.IntegerField(db_column='nStateID')
    mem_roles = models.TextField(blank=True, db_column='memRoles')

    class Meta:
        db_table = 'LegacyUserStates'
        verbose_name = 'Legacy User State'
        unique_together = [['n_user_id', 'n_state_id']]
        ordering = ['n_user_id', 'n_state_id']

    def __str__(self):
        return f'User {self.n_user_id} → State {self.n_state_id}'

class LegacyRawStateDataPendingUpdate(models.Model):
    """TBLRAWSTATEDATA_PENDINGUPDATE: pending edit rows; full row stored as JSON."""
    id = models.AutoField(primary_key=True, db_column='id')
    n_raw_state_data_id = models.IntegerField(null=True, blank=True, db_column='nRawStateDataID')
    n_state_id = models.IntegerField(null=True, blank=True, db_column='nStateID')
    payload = models.JSONField(default=dict, db_column='Payload')

    class Meta:
        db_table = 'LegacyRawStateDataPendingUpdates'
        verbose_name = 'Legacy Pending Update'
        ordering = ['-id']

    def __str__(self):
        return f'Pending #{self.id} (raw {self.n_raw_state_data_id})'

class LegacyCover(models.Model):
    """TBLCOVERS: user-entered cover records from legacy CSV."""
    id = models.AutoField(primary_key=True, db_column='nCoverID')
    n_user_id = models.IntegerField(db_column='nUserID')
    txt_cover_key_id = models.CharField(max_length=100, blank=True, db_column='txtCoverKeyID')
    txt_state_abv = models.CharField(max_length=20, blank=True, db_column='txtStateAbv')
    txt_territory = models.CharField(max_length=255, blank=True, db_column='txtTerritory')
    txt_town = models.CharField(max_length=255, blank=True, db_column='txtTown')
    txt_townmark_shape = models.CharField(max_length=100, blank=True, db_column='txtTownmarkShape')
    txt_lettering = models.CharField(max_length=100, blank=True, db_column='txtLettering')
    txt_townmark_framing = models.CharField(max_length=100, blank=True, db_column='txtTownmarkFraming')
    txt_date_format = models.CharField(max_length=100, blank=True, db_column='txtDateFormat')
    txt_rate = models.CharField(max_length=50, blank=True, db_column='txtRate')
    txt_rate_text = models.CharField(max_length=255, blank=True, db_column='txtRateText')
    txt_second_rate = models.CharField(max_length=255, blank=True, db_column='txtSecondRate')
    n_width = models.FloatField(null=True, blank=True, db_column='nWidth')
    n_height = models.FloatField(null=True, blank=True, db_column='nHeight')
    txt_color = models.CharField(max_length=100, blank=True, db_column='txtColor')
    n_earliest_use_day = models.IntegerField(null=True, blank=True, db_column='nEarliestUseDay')
    n_earliest_use_month = models.IntegerField(null=True, blank=True, db_column='nEarliestUseMonth')
    n_earliest_use_year = models.IntegerField(null=True, blank=True, db_column='nEarliestUseYear')
    n_latest_use_day = models.IntegerField(null=True, blank=True, db_column='nLatestUseDay')
    n_latest_use_month = models.IntegerField(null=True, blank=True, db_column='nLatestUseMonth')
    n_latest_use_year = models.IntegerField(null=True, blank=True, db_column='nLatestUseYear')
    mem_ascc_text = models.TextField(blank=True, db_column='memASCCText')
    mem_notes = models.TextField(blank=True, db_column='memNotes')
    mem_other_char = models.TextField(blank=True, db_column='memOtherChar')
    n_estimated_value = models.FloatField(null=True, blank=True, db_column='nEstimatedValue')
    txt_published_id = models.CharField(max_length=100, blank=True, db_column='txtPublishedID')
    txt_image1 = models.CharField(max_length=255, blank=True, db_column='txtImage1')
    txt_image2 = models.CharField(max_length=255, blank=True, db_column='txtImage2')

    class Meta:
        db_table = 'LegacyCovers'
        verbose_name = 'Legacy Cover'
        ordering = ['n_user_id', 'id']

    def __str__(self):
        return f'Cover {self.id} ({self.txt_town or self.txt_cover_key_id})'

class AdminCsvUpload(models.Model):
    """
    Stores a CSV file uploaded by a staff user for admin reference.
    Data is parsed and stored as JSON (headers + rows) for display in the dashboard.
    """
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255, help_text='Display name for this upload (e.g. from filename or user input)')
    file_name = models.CharField(max_length=255, help_text='Original filename of the CSV')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='admin_csv_uploads')
    data = models.JSONField(default=dict, help_text='Parsed CSV: headers and rows')
    row_count = models.PositiveIntegerField(default=0, help_text='Number of data rows (denormalized for list views without loading Data).')

    class Meta:
        db_table = 'AdminCsvUploads'
        verbose_name = 'Admin CSV Upload'
        verbose_name_plural = 'Admin CSV Uploads'
        ordering = ['-uploaded_at']

    def __str__(self):
        return f'{self.name} ({self.file_name})'

    def save(self, *args, **kwargs):
        if self.data:
            self.row_count = len(self.data.get('rows') or [])
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
    """
    Links an Editor to a Collection they are responsible for curating.
    Replaces the legacy UserLocationAssignment.
    """
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
    A postal facility that operated within a specific Region.
    (name, region) must be unique.

    model.md domain type: PostOffice
    """
    name = models.CharField(max_length=255, help_text='Normalized town name, e.g. Abingdon, Richmond')
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name='post_offices')

    class Meta:
        db_table = 'post_office'
        verbose_name = 'Post Office'
        verbose_name_plural = 'Post Offices'
        unique_together = [['name', 'region']]
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.region})'

class Lettering(TimestampedModel):
    """
    Editorial value table for textual styling assigned to a postal marking.

    model.md domain type: Lettering
    Seed values: Italic, Sans-serif, Script, Printed, Serif, Hollow, Thin, Block,
    Roman, Seriffed, Bold, Thick, Gothic, Other.
    """
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        verbose_name = 'Lettering'
        verbose_name_plural = 'Letterings'
        ordering = ['name']

    def __str__(self):
        return self.name

class Framing(TimestampedModel):
    """
    Value table of border treatment descriptors.

    model.md domain type: Framing
    Seed values: NOR, Single Line, Double Line, Dotted, Dashed, Cogwheel, Fancy, Ornate, Other.
    """
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=30, unique=True, null=True, blank=True, help_text='Editor-assigned reference identifier')

    class Meta:
        verbose_name = 'Framing'
        verbose_name_plural = 'Framings'
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

class DateObserved(TimestampedModel):
    """
    A single date point observed for a Postmark.

    model.md domain type: DateObserved
    """
    GRANULARITY_CHOICES = [('DAY', 'Day'), ('MONTH', 'Month'), ('YEAR', 'Year')]
    postmark = models.ForeignKey(Postmark, on_delete=models.CASCADE, related_name='dates_observed')
    date = models.DateField(help_text='Calendar date of the observed use')
    granularity = models.CharField(max_length=5, choices=GRANULARITY_CHOICES)

    class Meta:
        db_table = 'date_observed'
        verbose_name = 'Date Observed'
        verbose_name_plural = 'Dates Observed'
        ordering = ['postmark', 'date']
        indexes = [models.Index(fields=['postmark', 'date'], name='date_obs_pm_date_idx')]

    def __str__(self):
        return f'{self.postmark} -- {self.date} ({self.granularity})'

class Ratemark(TimestampedModel):
    """
    A postal rate marking device or manuscript rate marking.
    Classified by the same Shape/Lettering/Framing/Impression/isIrregular categories as Postmark.

    model.md domain type: Ratemark
    """
    IMPRESSION_CHOICES = [('Normal', 'Normal'), ('Stencil', 'Stencil'), ('Negative', 'Negative')]
    code = models.CharField(max_length=30, unique=True, null=True, blank=True, help_text='Editor-assigned reference identifier')
    inscription_txt = models.TextField(help_text='Text as physically inscribed on the rate marking')
    is_manuscript = models.BooleanField()
    shape = models.ForeignKey(Shape, on_delete=models.PROTECT, null=True, blank=True, related_name='ratemarks', help_text='Required when isManuscript is false')
    lettering = models.ForeignKey(Lettering, on_delete=models.PROTECT, null=True, blank=True, related_name='ratemarks', help_text='Must be null when isManuscript is true')
    color = models.ForeignKey(Color, on_delete=models.PROTECT, null=True, blank=True, related_name='ratemarks', help_text='Ink color of this marking; defaults to BLACK (id=1)')
    impression = models.CharField(max_length=10, choices=IMPRESSION_CHOICES, null=True, blank=True, help_text='Required when isManuscript is false; must be null when true')
    is_irreg = models.BooleanField(null=True, blank=True, help_text='Required when isManuscript is false; must be null when true')
    width = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='Horizontal dimension in millimeters')
    height = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='Vertical dimension in millimeters')
    rate_val = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text='Non-negative decimal representing rate amount in cents')

    class Meta:
        verbose_name = 'Ratemark'
        verbose_name_plural = 'Ratemarks'
        ordering = ['id']

    def __str__(self):
        return f'Ratemark #{self.pk} ({self.inscription_txt[:40]})'

class Auxmark(TimestampedModel):
    """
    An auxiliary or instructional marking (e.g. PAID, FREE) associated with a Postmark or Ratemark.
    Polymorphic via parentMarkType/parentMarkId.

    model.md domain type: Auxmark
    """
    PARENT_MARK_TYPE_CHOICES = [('POSTMARK', 'Postmark'), ('RATEMARK', 'Ratemark')]
    IMPRESSION_CHOICES = [('Normal', 'Normal'), ('Stencil', 'Stencil'), ('Negative', 'Negative')]
    code = models.CharField(max_length=30, unique=True, null=True, blank=True, help_text='Editor-assigned reference identifier')
    parent_mark_type = models.CharField(max_length=10, choices=PARENT_MARK_TYPE_CHOICES)
    parent_mark_id = models.PositiveIntegerField(help_text='PK of the associated Postmark or Ratemark')
    inscription_txt = models.TextField(help_text='Text as physically inscribed on the auxiliary marking')
    is_manuscript = models.BooleanField()
    shape = models.ForeignKey(Shape, on_delete=models.PROTECT, null=True, blank=True, related_name='auxmarks', help_text='Required when isManuscript is false; must be null when true')
    lettering = models.ForeignKey(Lettering, on_delete=models.PROTECT, null=True, blank=True, related_name='auxmarks', help_text='Must be null when isManuscript is true')
    color = models.ForeignKey(Color, on_delete=models.PROTECT, null=True, blank=True, related_name='auxmarks', help_text='Ink color of this marking; defaults to BLACK (id=1)')
    impression = models.CharField(max_length=10, choices=IMPRESSION_CHOICES, null=True, blank=True, help_text='Required when isManuscript is false; must be null when true')
    is_irreg = models.BooleanField(null=True, blank=True, help_text='Required when isManuscript is false; must be null when true')
    width = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='Horizontal dimension in millimeters')
    height = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='Vertical dimension in millimeters')

    class Meta:
        verbose_name = 'Auxmark'
        verbose_name_plural = 'Auxmarks'
        ordering = ['parent_mark_type', 'parent_mark_id']

    def __str__(self):
        return f'Auxmark #{self.pk} on {self.parent_mark_type} #{self.parent_mark_id}'

class CoverPostmark(TimestampedModel):
    """
    Junction linking a Cover to a Postmark.

    model.md domain type: CoverPostmark
    """
    cover = models.ForeignKey(Cover, on_delete=models.CASCADE, related_name='cover_postmarks')
    postmark = models.ForeignKey(Postmark, on_delete=models.CASCADE, related_name='cover_postmarks')
    is_backstamp = models.BooleanField(default=False, help_text='Whether this marking appears on the reverse of the cover')

    class Meta:
        db_table = 'cover_postmark'
        verbose_name = 'Cover Postmark'
        verbose_name_plural = 'Cover Postmarks'
        unique_together = [['cover', 'postmark']]

    def __str__(self):
        return f'Cover #{self.cover_id} <-> Postmark #{self.postmark_id}'

class PostmarkRatemark(TimestampedModel):
    """
    Junction linking a Postmark to a Ratemark.

    model.md domain type: PostmarkRatemark
    """
    PLACEMENT_TYPE_CHOICES = [('ATTACHED', 'Rate marking integral to townmark frame'), ('WITHIN', 'Rate appears within townmark frame'), ('SEPARATE', 'Rate struck separately from townmark')]
    postmark = models.ForeignKey(Postmark, on_delete=models.CASCADE, related_name='postmark_ratemarks')
    ratemark = models.ForeignKey(Ratemark, on_delete=models.CASCADE, related_name='postmark_ratemarks')
    placement_type = models.CharField(max_length=10, choices=PLACEMENT_TYPE_CHOICES, null=True, blank=True, help_text='Positional relationship of rate marking to townmark device')

    class Meta:
        db_table = 'postmark_ratemark'
        verbose_name = 'Postmark Ratemark'
        verbose_name_plural = 'Postmark Ratemarks'
        unique_together = [['postmark', 'ratemark']]

    def __str__(self):
        return f'Postmark #{self.postmark_id} <-> Ratemark #{self.ratemark_id}'

class MarkFraming(TimestampedModel):
    """
    Polymorphic junction linking a Postmark, Ratemark, or Auxmark to one or more Framings.

    model.md domain type: MarkFraming
    """
    PARENT_MARK_TYPE_CHOICES = [('POSTMARK', 'Postmark'), ('RATEMARK', 'Ratemark'), ('AUXMARK', 'Auxmark')]
    parent_mark_type = models.CharField(max_length=10, choices=PARENT_MARK_TYPE_CHOICES)
    parent_mark_id = models.PositiveIntegerField(help_text='PK of the associated Postmark, Ratemark, or Auxmark')
    framing = models.ForeignKey(Framing, on_delete=models.PROTECT, related_name='mark_framings')
    framing_pos = models.PositiveSmallIntegerField(null=True, blank=True, help_text='Ordinal border position from outside inward; null = order unknown')

    class Meta:
        db_table = 'mark_framing'
        verbose_name = 'Mark Framing'
        verbose_name_plural = 'Mark Framings'
        unique_together = [['parent_mark_type', 'parent_mark_id', 'framing']]

    def __str__(self):
        pos = f' pos={self.framing_pos}' if self.framing_pos is not None else ''
        return f'{self.parent_mark_type} #{self.parent_mark_id} -- {self.framing}{pos}'

class ReferenceWork(TimestampedModel):
    """
    A citable publication or source.

    model.md domain type: ReferenceWork
    """
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
        return f'{self.title} ({self.publication_year})'

class Citation(TimestampedModel):
    """
    Links a ReferenceWork to a Cover or Postmark.
    Polymorphic via subjectType/subjectId.

    model.md domain type: Citation
    """
    SUBJECT_TYPE_CHOICES = [('COVER', 'Cover'), ('POSTMARK', 'Postmark')]
    reference_work = models.ForeignKey(ReferenceWork, on_delete=models.PROTECT, related_name='citations')
    subject_type = models.CharField(max_length=20, choices=SUBJECT_TYPE_CHOICES)
    subject_id = models.PositiveIntegerField(help_text='PK of the referenced Cover or Postmark')
    citation_detail = models.CharField(max_length=500, help_text='Page, section, or URL within the reference work')

    class Meta:
        verbose_name = 'Citation'
        verbose_name_plural = 'Citations'
        ordering = ['reference_work', 'subject_type', 'subject_id']

    def __str__(self):
        return f'{self.reference_work} -> {self.subject_type} #{self.subject_id}'
