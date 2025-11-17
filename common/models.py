###################################################################################################
## WoCo Project - Configuration
## MPC: 2025/10/24
###################################################################################################
import hashlib

from django.db import models

from django.contrib.auth import get_user_model

from django.core.validators import MinValueValidator, MaxValueValidator

from django.utils.translation import gettext_lazy as _

from django.conf import settings

from colorfield.fields import ColorField



# ========== BASE ABSTRACT MODELS ==========

class TimestampedModel(models.Model):
    """Abstract base model with creation and modification tracking"""
    created_date = models.DateTimeField(auto_now_add=True)
    modified_date = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='%(class)s_created',
        db_column='CreatedByUserID'
    )
    modified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='%(class)s_modified',
        db_column='ModifiedByUserID'
    )

    class Meta:
        abstract = True


# ========== GEOGRAPHIC HIERARCHY MODELS ==========

class GeographicLocation(TimestampedModel):
    """Physical locations that don't move (towns, cities, post offices)"""
    
    LOCATION_TYPE_CHOICES = [
        ('TOWN', 'Town'),
        ('CITY', 'City'),
        ('VILLAGE', 'Village'),
        ('POST_OFFICE', 'Post Office'),
        ('SETTLEMENT', 'Settlement'),
    ]
    
    geographic_location_id = models.AutoField(primary_key=True, db_column='GeographicLocationID')
    location_name = models.CharField(max_length=255, db_column='LocationName')
    location_type = models.CharField(
        max_length=20,
        choices=LOCATION_TYPE_CHOICES,
        db_column='LocationType'
    )
    latitude = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
        db_column='Latitude',
        help_text="Nullable - for towns/cities, optional for regions"
    )
    longitude = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
        db_column='Longitude',
        help_text="Nullable - for towns/cities, optional for regions"
    )

    class Meta:
        db_table = 'GeographicLocations'
        verbose_name = 'Geographic Location'
        verbose_name_plural = 'Geographic Locations'
        indexes = [
            models.Index(fields=['location_name', 'location_type']),
        ]

    def __str__(self):
        return f"{self.location_name} ({self.get_location_type_display()})"


class AdministrativeUnit(TimestampedModel):
    """Administrative/Political units with boundaries that change over time"""
    
    UNIT_TYPE_CHOICES = [
        ('COUNTRY', 'Country'),
        ('STATE', 'State'),
        ('PROVINCE', 'Province'),
        ('TERRITORY', 'Territory'),
        ('PREFECTURE', 'Prefecture'),
        ('COUNTY', 'County'),
    ]
    
    administrative_unit_id = models.AutoField(primary_key=True, db_column='AdministrativeUnitID')
    parent_administrative_unit = models.ForeignKey(
        'self',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='child_units',
        db_column='ParentAdministrativeUnitID',
        help_text="Self-referencing for hierarchy"
    )
    unit_name = models.CharField(max_length=255, db_column='UnitName')
    unit_abbreviation = models.CharField(max_length=10, db_column='UnitAbbreviation')
    unit_type = models.CharField(
        max_length=20,
        choices=UNIT_TYPE_CHOICES,
        db_column='UnitType'
    )
    hierarchy_level = models.IntegerField(
        db_column='HierarchyLevel',
        validators=[MinValueValidator(1)],
        help_text="1=Country, 2=State/Province, 3=County, etc"
    )
    is_active = models.BooleanField(default=True, db_column='IsActive')

    class Meta:
        db_table = 'AdministrativeUnits'
        verbose_name = 'Administrative Unit'
        verbose_name_plural = 'Administrative Units'
        indexes = [
            models.Index(fields=['unit_type', 'hierarchy_level']),
            models.Index(fields=['unit_abbreviation']),
        ]

    def __str__(self):
        return f"{self.unit_name} ({self.unit_abbreviation})"


class GeographicAffiliation(TimestampedModel):
    """Temporal relationship between locations and administrative units"""
    
    geographic_affiliation_id = models.AutoField(primary_key=True, db_column='GeographicAffiliationID')
    geographic_location = models.ForeignKey(
        GeographicLocation,
        on_delete=models.CASCADE,
        related_name='affiliations',
        db_column='GeographicLocationID'
    )
    administrative_unit = models.ForeignKey(
        AdministrativeUnit,
        on_delete=models.CASCADE,
        related_name='governed_locations',
        db_column='AdministrativeUnitID'
    )
    effective_from_date = models.DateField(
        db_column='EffectiveFromDate',
        help_text="When this affiliation began"
    )
    effective_to_date = models.DateField(
        null=True,
        blank=True,
        db_column='EffectiveToDate',
        help_text="When ended, NULL if current"
    )
    affiliation_source = models.CharField(
        max_length=255,
        db_column='AffiliationSource',
        help_text="Treaty, Act, Historical Record, etc"
    )

    class Meta:
        db_table = 'GeographicAffiliations'
        verbose_name = 'Geographic Affiliation'
        verbose_name_plural = 'Geographic Affiliations'
        indexes = [
            models.Index(fields=['geographic_location', 'effective_from_date']),
            models.Index(fields=['administrative_unit', 'effective_from_date']),
        ]

    def __str__(self):
        return f"{self.geographic_location} in {self.administrative_unit} ({self.effective_from_date})"


class AdministrativeUnitNameHistory(models.Model):
    """Historical names for administrative units (for name changes)"""
    
    administrative_unit_name_history_id = models.AutoField(
        primary_key=True,
        db_column='AdministrativeUnitNameHistoryID'
    )
    administrative_unit = models.ForeignKey(
        AdministrativeUnit,
        on_delete=models.CASCADE,
        related_name='name_history',
        db_column='AdministrativeUnitID'
    )
    historical_name = models.CharField(max_length=255, db_column='HistoricalName')
    historical_abbreviation = models.CharField(max_length=10, db_column='HistoricalAbbreviation')
    effective_from_date = models.DateField(db_column='EffectiveFromDate')
    effective_to_date = models.DateField(null=True, blank=True, db_column='EffectiveToDate')
    created_date = models.DateTimeField(auto_now_add=True, db_column='CreatedDate')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='administrative_unit_name_history_created',
        db_column='CreatedByUserID'
    )

    class Meta:
        db_table = 'AdministrativeUnitNameHistory'
        verbose_name = 'Administrative Unit Name History'
        verbose_name_plural = 'Administrative Unit Name Histories'
        ordering = ['-effective_from_date']

    def __str__(self):
        return f"{self.historical_name} ({self.effective_from_date})"


class AdministrativeUnitHistory(models.Model):
    """Administrative unit versioning (boundaries, status, hierarchy changes)"""
    
    CHANGE_REASON_CHOICES = [
        ('SPLIT', 'Split'),
        ('MERGED', 'Merged'),
        ('RENAMED', 'Renamed'),
        ('INDEPENDENCE', 'Independence'),
        ('ANNEXED', 'Annexed'),
        ('REORGANIZED', 'Reorganized'),
    ]
    
    administrative_unit_history_id = models.AutoField(
        primary_key=True,
        db_column='AdministrativeUnitHistoryID'
    )
    administrative_unit = models.ForeignKey(
        AdministrativeUnit,
        on_delete=models.CASCADE,
        related_name='version_history',
        db_column='AdministrativeUnitID'
    )
    parent_administrative_unit = models.ForeignKey(
        AdministrativeUnit,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='historical_children',
        db_column='ParentAdministrativeUnitID',
        help_text="Which unit this belonged to at this time"
    )
    unit_name = models.CharField(max_length=255, db_column='UnitName')
    unit_abbreviation = models.CharField(max_length=10, db_column='UnitAbbreviation')
    unit_type = models.CharField(max_length=20, db_column='UnitType')
    hierarchy_level = models.IntegerField(db_column='HierarchyLevel')
    is_active = models.BooleanField(
        db_column='IsActive',
        help_text="Was this unit active during this period?"
    )
    effective_from_date = models.DateField(db_column='EffectiveFromDate')
    effective_to_date = models.DateField(
        null=True,
        blank=True,
        db_column='EffectiveToDate',
        help_text="NULL if current version"
    )
    change_reason = models.CharField(
        max_length=20,
        choices=CHANGE_REASON_CHOICES,
        db_column='ChangeReason'
    )
    created_date = models.DateTimeField(auto_now_add=True, db_column='CreatedDate')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='administrative_unit_history_created',
        db_column='CreatedByUserID'
    )

    class Meta:
        db_table = 'AdministrativeUnitHistory'
        verbose_name = 'Administrative Unit History'
        verbose_name_plural = 'Administrative Unit Histories'
        ordering = ['-effective_from_date']

    def __str__(self):
        return f"{self.unit_name} - {self.change_reason} ({self.effective_from_date})"


# ========== PHYSICAL CHARACTERISTICS MODELS ==========

class PostmarkShape(TimestampedModel):
    """Physical shapes of postmarks"""
    
    postmark_shape_id = models.AutoField(primary_key=True, db_column='PostmarkShapeID')
    shape_name = models.CharField(max_length=100, unique=True, db_column='ShapeName')
    shape_description = models.TextField(blank=True, db_column='ShapeDescription')

    class Meta:
        db_table = 'PostmarkShapes'
        verbose_name = 'Postmark Shape'
        verbose_name_plural = 'Postmark Shapes'
        ordering = ['shape_name']

    def __str__(self):
        return self.shape_name


class LetteringStyle(TimestampedModel):
    """Lettering styles used in postmarks"""
    
    lettering_style_id = models.AutoField(primary_key=True, db_column='LetteringStyleID')
    lettering_style_name = models.CharField(max_length=100, unique=True, db_column='LetteringStyleName')
    lettering_description = models.TextField(blank=True, db_column='LetteringDescription')

    class Meta:
        db_table = 'LetteringStyles'
        verbose_name = 'Lettering Style'
        verbose_name_plural = 'Lettering Styles'
        ordering = ['lettering_style_name']

    def __str__(self):
        return self.lettering_style_name


class FramingStyle(TimestampedModel):
    """Framing styles for postmarks"""
    
    framing_style_id = models.AutoField(primary_key=True, db_column='FramingStyleID')
    framing_style_name = models.CharField(max_length=100, unique=True, db_column='FramingStyleName')
    framing_description = models.TextField(blank=True, db_column='FramingDescription')

    class Meta:
        db_table = 'FramingStyles'
        verbose_name = 'Framing Style'
        verbose_name_plural = 'Framing Styles'
        ordering = ['framing_style_name']

    def __str__(self):
        return self.framing_style_name


class Color(TimestampedModel):
    """Colors used in postmarks"""
    
    color_id = models.AutoField(primary_key=True, db_column='ColorID')
    color_name = models.CharField(max_length=50, unique=True, db_column='ColorName')
    color_value = ColorField(default="#FFFFFF", db_column='ColorValue')

    class Meta:
        db_table = 'Colors'
        verbose_name = 'Color'
        verbose_name_plural = 'Colors'
        ordering = ['color_name']

    def __str__(self):
        return self.color_name


# ========== CORE POSTMARK MODELS ==========

class Postmark(TimestampedModel):
    """Main postmark records with pure postmark data"""
    
    RATE_LOCATION_CHOICES = [
        ('TOP', 'Top'),
        ('BOTTOM', 'Bottom'),
        ('LEFT', 'Left'),
        ('RIGHT', 'Right'),
        ('CENTER', 'Center'),
        ('NONE', 'None'),
    ]
    
    CONDITION_CHOICES = [
        ('VERY_FINE', 'Very Fine'),
        ('FINE', 'Fine'),
        ('VERY_GOOD', 'Very Good'),
        ('POOR', 'Poor'),
    ]
    
    postmark_id = models.AutoField(primary_key=True, db_column='PostmarkID')
    geographic_location = models.ForeignKey(
        GeographicLocation,
        on_delete=models.PROTECT,
        related_name='postmarks',
        db_column='GeographicLocationID',
        help_text="The physical location where postmark was used"
    )
    postmark_shape = models.ForeignKey(
        PostmarkShape,
        on_delete=models.PROTECT,
        related_name='postmarks',
        db_column='PostmarkShapeID'
    )
    lettering_style = models.ForeignKey(
        LetteringStyle,
        on_delete=models.PROTECT,
        related_name='postmarks',
        db_column='LetteringStyleID'
    )
    framing_style = models.ForeignKey(
        FramingStyle,
        on_delete=models.PROTECT,
        related_name='postmarks',
        db_column='FramingStyleID'
    )
    date_format = models.ForeignKey(
        'DateFormat',
        on_delete=models.PROTECT,
        related_name='postmarks',
        db_column='DateFormatID'
    )
    postmark_key = models.CharField(
        max_length=100,
        unique=True,
        db_column='PostmarkKey'
    )
    rate_location = models.CharField(
        max_length=10,
        choices=RATE_LOCATION_CHOICES,
        db_column='RateLocation',
        help_text="Top/Bottom/Left/Right/Center/None"
    )
    rate_value = models.CharField(
        max_length=50,
        db_column='RateValue',
        help_text="5c, 10c, Free, Paid, etc"
    )
    condition = models.CharField(
        max_length=20,
        choices=CONDITION_CHOICES,
        null=True,
        blank=True,
        db_column='Condition',
        help_text="Physical condition of the postmark"
    )
    is_manuscript = models.BooleanField(
        default=False,
        db_column='IsManuscript',
        help_text="Hand-written or hand-stamped vs printed"
    )
    other_characteristics = models.TextField(
        blank=True,
        db_column='OtherCharacteristics'
    )

    class Meta:
        db_table = 'Postmarks'
        verbose_name = 'Postmark'
        verbose_name_plural = 'Postmarks'
        indexes = [
            models.Index(fields=['geographic_location']),
            models.Index(fields=['postmark_key']),
        ]

    def __str__(self):
        return f"{self.postmark_key} - {self.geographic_location}"


class DateFormat(TimestampedModel):
    """Date formats used in postmarks"""
    
    date_format_id = models.AutoField(primary_key=True, db_column='DateFormatID')
    format_name = models.CharField(max_length=100, unique=True, db_column='FormatName')
    format_description = models.TextField(blank=True, db_column='FormatDescription')

    class Meta:
        db_table = 'DateFormats'
        verbose_name = 'Date Format'
        verbose_name_plural = 'Date Formats'
        ordering = ['format_name']

    def __str__(self):
        return self.format_name


class PostmarkColor(models.Model):
    """Many-to-many relationship between postmarks and colors"""
    
    postmark_color_id = models.AutoField(primary_key=True, db_column='PostmarkColorID')
    postmark = models.ForeignKey(
        Postmark,
        on_delete=models.CASCADE,
        related_name='postmark_colors',
        db_column='PostmarkID'
    )
    color = models.ForeignKey(
        Color,
        on_delete=models.PROTECT,
        related_name='postmark_colors',
        db_column='ColorID'
    )
    created_date = models.DateTimeField(auto_now_add=True, db_column='CreatedDate')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='postmark_colors_created',
        db_column='CreatedByUserID'
    )

    class Meta:
        db_table = 'PostmarkColors'
        verbose_name = 'Postmark Color'
        verbose_name_plural = 'Postmark Colors'
        unique_together = [['postmark', 'color']]

    def __str__(self):
        return f"{self.postmark} - {self.color}"


class PostmarkDatesSeen(models.Model):
    """Date ranges when postmarks were observed"""
    
    postmark_dates_seen_id = models.AutoField(primary_key=True, db_column='PostmarkDatesSeenID')
    postmark = models.ForeignKey(
        Postmark,
        on_delete=models.CASCADE,
        related_name='dates_seen',
        db_column='PostmarkID'
    )
    earliest_date_seen = models.DateField(db_column='EarliestDateSeen')
    latest_date_seen = models.DateField(db_column='LatestDateSeen')
    created_date = models.DateTimeField(auto_now_add=True, db_column='CreatedDate')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='postmark_dates_seen_created',
        db_column='CreatedByUserID'
    )

    class Meta:
        db_table = 'PostmarkDatesSeen'
        verbose_name = 'Postmark Dates Seen'
        verbose_name_plural = 'Postmark Dates Seen'
        ordering = ['earliest_date_seen']

    def __str__(self):
        return f"{self.postmark} ({self.earliest_date_seen} - {self.latest_date_seen})"


class PostmarkSize(models.Model):
    """Different size observations for postmarks"""
    
    postmark_size_id = models.AutoField(primary_key=True, db_column='PostmarkSizeID')
    postmark = models.ForeignKey(
        Postmark,
        on_delete=models.CASCADE,
        related_name='sizes',
        db_column='PostmarkID'
    )
    width = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        db_column='Width'
    )
    height = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        db_column='Height'
    )
    size_notes = models.CharField(
        max_length=255,
        blank=True,
        db_column='SizeNotes',
        help_text="e.g., Blown up, Scaled, Standard"
    )
    created_date = models.DateTimeField(auto_now_add=True, db_column='CreatedDate')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='postmark_sizes_created',
        db_column='CreatedByUserID'
    )

    class Meta:
        db_table = 'PostmarkSizes'
        verbose_name = 'Postmark Size'
        verbose_name_plural = 'Postmark Sizes'

    def __str__(self):
        return f"{self.postmark} - {self.width}x{self.height}"


class PostmarkValuation(TimestampedModel):
    """Valuations for postmarks"""
    
    postmark_valuation_id = models.AutoField(primary_key=True, db_column='PostmarkValuationID')
    postmark = models.ForeignKey(
        Postmark,
        on_delete=models.CASCADE,
        related_name='valuations',
        db_column='PostmarkID'
    )
    valued_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='postmark_valuations_made',
        db_column='ValuedByUserID'
    )
    estimated_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        db_column='EstimatedValue'
    )
    valuation_date = models.DateField(db_column='ValuationDate')

    class Meta:
        db_table = 'PostmarkValuations'
        verbose_name = 'Postmark Valuation'
        verbose_name_plural = 'Postmark Valuations'
        ordering = ['-valuation_date']

    def __str__(self):
        return f"{self.postmark} - ${self.estimated_value} ({self.valuation_date})"


# ========== PUBLICATION MODELS ==========

class PostmarkPublication(TimestampedModel):
    """Catalog of publications that reference postmarks"""
    
    PUBLICATION_TYPE_CHOICES = [
        ('BOOK', 'Book'),
        ('CATALOG', 'Catalog'),
        ('JOURNAL', 'Journal'),
        ('WEBSITE', 'Website'),
        ('NEWSLETTER', 'Newsletter'),
    ]
    
    postmark_publication_id = models.AutoField(primary_key=True, db_column='PostmarkPublicationID')
    publication_title = models.CharField(max_length=500, db_column='PublicationTitle')
    author = models.CharField(max_length=255, db_column='Author')
    publisher = models.CharField(max_length=255, db_column='Publisher')
    publication_date = models.DateField(db_column='PublicationDate')
    isbn = models.CharField(max_length=20, blank=True, db_column='ISBN')
    edition = models.CharField(max_length=50, blank=True, db_column='Edition')
    publication_type = models.CharField(
        max_length=20,
        choices=PUBLICATION_TYPE_CHOICES,
        db_column='PublicationType'
    )

    class Meta:
        db_table = 'PostmarkPublications'
        verbose_name = 'Postmark Publication'
        verbose_name_plural = 'Postmark Publications'
        ordering = ['-publication_date']

    def __str__(self):
        year = getattr(self.publication_date, 'year', 'Unknown') if self.publication_date else 'Unknown'
        return f"{self.publication_title} ({self.author}, {year})"


class PostmarkPublicationReference(models.Model):
    """Many-to-many junction table for postmark publication references"""
    
    postmark_publication_reference_id = models.AutoField(
        primary_key=True,
        db_column='PostmarkPublicationReferenceID'
    )
    postmark = models.ForeignKey(
        Postmark,
        on_delete=models.CASCADE,
        related_name='publication_references',
        db_column='PostmarkID'
    )
    postmark_publication = models.ForeignKey(
        PostmarkPublication,
        on_delete=models.CASCADE,
        related_name='postmark_references',
        db_column='PostmarkPublicationID'
    )
    published_id = models.CharField(
        max_length=100,
        db_column='PublishedID',
        help_text="Reference ID/number in the publication"
    )
    reference_location = models.CharField(
        max_length=255,
        db_column='ReferenceLocation',
        help_text="Page number (p. 45) or URL for websites"
    )
    created_date = models.DateTimeField(auto_now_add=True, db_column='CreatedDate')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='postmark_publication_references_created',
        db_column='CreatedByUserID'
    )

    class Meta:
        db_table = 'PostmarkPublicationReferences'
        verbose_name = 'Postmark Publication Reference'
        verbose_name_plural = 'Postmark Publication References'
        unique_together = [['postmark', 'postmark_publication', 'published_id']]

    def __str__(self):
        return f"{self.postmark} in {self.postmark_publication} (ID: {self.published_id})"


# ========== IMAGE MODELS ==========

class PostmarkImage(TimestampedModel):
    """Images of postmarks with metadata"""
    
    IMAGE_VIEW_CHOICES = [
        ('FULL', 'Full'),
        ('DETAIL', 'Detail'),
        ('COMPARISON', 'Comparison'),
    ]
    
    IMAGE_STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]
    
    postmark_image_id = models.AutoField(primary_key=True, db_column='PostmarkImageID')
    postmark = models.ForeignKey(
        Postmark,
        on_delete=models.CASCADE,
        related_name='images',
        db_column='PostmarkID'
    )
    original_filename = models.CharField(max_length=255, db_column='OriginalFileName')
    storage_filename = models.CharField(
        max_length=255,
        unique=True,
        db_column='StorageFileName'
    )
    file_checksum = models.CharField(
        max_length=64,
        db_column='FileChecksum',
        help_text="SHA-256 or MD5 hash for deduplication"
    )
    mime_type = models.CharField(
        max_length=50,
        db_column='MimeType',
        help_text="image/jpeg, image/png, image/tiff, etc"
    )
    image_width = models.IntegerField(
        db_column='ImageWidth',
        help_text="Width in pixels"
    )
    image_height = models.IntegerField(
        db_column='ImageHeight',
        help_text="Height in pixels"
    )
    file_size_bytes = models.BigIntegerField(db_column='FileSizeBytes')
    image_view = models.CharField(
        max_length=20,
        choices=IMAGE_VIEW_CHOICES,
        db_column='ImageView'
    )
    image_description = models.TextField(blank=True, db_column='ImageDescription')
    display_order = models.IntegerField(
        default=0,
        db_column='DisplayOrder',
        help_text="0 = main image, 1+ = additional images"
    )
    image_status = models.CharField(
        max_length=20,
        choices=IMAGE_STATUS_CHOICES,
        default='PENDING',
        db_column='ImageStatus'
    )
    submitter_name = models.CharField(max_length=255, blank=True, db_column='SubmitterName')
    submitter_email = models.EmailField(blank=True, db_column='SubmitterEmail')

    class Meta:
        db_table = 'PostmarkImages'
        verbose_name = 'Postmark Image'
        verbose_name_plural = 'Postmark Images'
        ordering = ['postmark', 'display_order']
        indexes = [
            models.Index(fields=['postmark', 'display_order']),
            models.Index(fields=['file_checksum']),
        ]

    def __str__(self):
        return f"{self.postmark} - {self.original_filename}"

    def save(self, *args, **kwargs):
        """Generate file checksum if not provided"""
        if not self.file_checksum and hasattr(self, 'file_object'):
            self.file_checksum = self._generate_checksum(self.file_object)
        super().save(*args, **kwargs)

    @staticmethod
    def _generate_checksum(file_object):
        """Generate SHA-256 checksum for file"""
        sha256_hash = hashlib.sha256()
        for byte_block in iter(lambda: file_object.read(4096), b""):
            sha256_hash.update(byte_block)
        file_object.seek(0)  # Reset file pointer
        return sha256_hash.hexdigest()


# ========== POSTCOVER MODELS (COLLECTING) ==========

class Postcover(TimestampedModel):
    """Physical postal covers/envelopes that collectors own"""
    
    CONDITION_CHOICES = [
        ('VERY_FINE', 'Very Fine'),
        ('FINE', 'Fine'),
        ('VERY_GOOD', 'Very Good'),
        ('POOR', 'Poor'),
    ]
    
    postcover_id = models.AutoField(primary_key=True, db_column='PostcoverID')
    owner_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='postcovers_owned',
        db_column='OwnerUserID'
    )
    postcover_key = models.CharField(
        max_length=100,
        unique=True,
        db_column='PostcoverKey'
    )
    description = models.TextField(blank=True, db_column='Description')
    condition = models.CharField(
        max_length=20,
        choices=CONDITION_CHOICES,
        blank=True,
        null=True,
        db_column='Condition',
        help_text="Physical condition of the postcover"
    )

    class Meta:
        db_table = 'Postcovers'
        verbose_name = 'Postcover'
        verbose_name_plural = 'Postcovers'
        indexes = [
            models.Index(fields=['owner_user']),
            models.Index(fields=['postcover_key']),
        ]

    def __str__(self):
        return f"{self.postcover_key} (Owner: {self.owner_user})"


class PostcoverPostmark(models.Model):
    """Many-to-many relationship: Postcovers contain Postmarks"""
    
    POSTMARK_LOCATION_CHOICES = [
        ('FRONT', 'Front'),
        ('BACK', 'Back'),
        ('FRONT_UPPER_RIGHT', 'Front Upper Right'),
        ('FRONT_UPPER_LEFT', 'Front Upper Left'),
        ('BACK_UPPER_RIGHT', 'Back Upper Right'),
        ('BACK_UPPER_LEFT', 'Back Upper Left'),
        ('BACK_LOWER_LEFT', 'Back Lower Left'),
        ('BACK_LOWER_RIGHT', 'Back Lower Right'),
    ]
    
    postcover_postmark_id = models.AutoField(primary_key=True, db_column='PostcoverPostmarkID')
    postcover = models.ForeignKey(
        Postcover,
        on_delete=models.CASCADE,
        related_name='postcover_postmarks',
        db_column='PostcoverID'
    )
    postmark = models.ForeignKey(
        Postmark,
        on_delete=models.CASCADE,
        related_name='postcover_postmarks',
        db_column='PostmarkID'
    )
    position_order = models.IntegerField(
        db_column='PositionOrder',
        help_text="Order of postmarks on cover (1st, 2nd, etc)"
    )
    postmark_location = models.CharField(
        max_length=20,
        choices=POSTMARK_LOCATION_CHOICES,
        db_column='PostmarkLocation'
    )
    created_date = models.DateTimeField(auto_now_add=True, db_column='CreatedDate')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='postcover_postmarks_created',
        db_column='CreatedByUserID'
    )

    class Meta:
        db_table = 'PostcoverPostmarks'
        verbose_name = 'Postcover Postmark'
        verbose_name_plural = 'Postcover Postmarks'
        unique_together = [['postcover', 'postmark', 'position_order']]
        ordering = ['postcover', 'position_order']

    def __str__(self):
        return f"{self.postcover} - {self.postmark} (Position {self.position_order})"


class PostcoverImage(TimestampedModel):
    """Images of physical postal covers"""
    
    IMAGE_VIEW_CHOICES = [
        ('FRONT', 'Front'),
        ('BACK', 'Back'),
        ('INTERIOR', 'Interior'),
        ('DETAIL', 'Detail'),
    ]
    
    postcover_image_id = models.AutoField(primary_key=True, db_column='PostcoverImageID')
    postcover = models.ForeignKey(
        Postcover,
        on_delete=models.CASCADE,
        related_name='images',
        db_column='PostcoverID'
    )
    uploaded_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='postcover_images_uploaded',
        db_column='UploadedByUserID'
    )
    original_filename = models.CharField(max_length=255, db_column='OriginalFileName')
    storage_filename = models.CharField(
        max_length=255,
        unique=True,
        db_column='StorageFileName'
    )
    file_checksum = models.CharField(
        max_length=64,
        db_column='FileChecksum',
        help_text="SHA-256 or MD5 hash for deduplication"
    )
    mime_type = models.CharField(
        max_length=50,
        db_column='MimeType',
        help_text="image/jpeg, image/png, image/tiff, etc"
    )
    image_width = models.IntegerField(
        db_column='ImageWidth',
        help_text="Width in pixels"
    )
    image_height = models.IntegerField(
        db_column='ImageHeight',
        help_text="Height in pixels"
    )
    file_size_bytes = models.BigIntegerField(db_column='FileSizeBytes')
    image_view = models.CharField(
        max_length=20,
        choices=IMAGE_VIEW_CHOICES,
        db_column='ImageView'
    )
    image_description = models.TextField(blank=True, db_column='ImageDescription')
    display_order = models.IntegerField(
        default=0,
        db_column='DisplayOrder',
        help_text="0 = main image, 1+ = additional images"
    )

    class Meta:
        db_table = 'PostcoverImages'
        verbose_name = 'Postcover Image'
        verbose_name_plural = 'Postcover Images'
        ordering = ['postcover', 'display_order']
        indexes = [
            models.Index(fields=['postcover', 'display_order']),
            models.Index(fields=['file_checksum']),
        ]

    def __str__(self):
        return f"{self.postcover} - {self.original_filename}"

    def save(self, *args, **kwargs):
        """Generate file checksum if not provided"""
        if not self.file_checksum and hasattr(self, 'file_object'):
            self.file_checksum = PostmarkImage._generate_checksum(self.file_object)
        super().save(*args, **kwargs)

###################################################################################################
