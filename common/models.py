###################################################################################################
## WoCo Commons - Common Data Model
## MPC: 2025/10/24
###################################################################################################
import hashlib

from django.db import models
from django.db.models import Q

from django.contrib.auth.models import Group

from django.utils.translation import gettext_lazy as _

from django.conf import settings

from colorfield.fields import ColorField



# ========== BASE ABSTRACT MODELS ==========

class TimestampedModel(models.Model):
    """Abstract base model with creation and modification tracking"""
    created_date = models.DateTimeField(auto_now_add=True, db_column='CreatedDate')
    modified_date = models.DateTimeField(auto_now=True, db_column='ModifiedDate')
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


# ========== GEOGRAPHIC HIERARCHY MODELS (NEW PURE POINTER PATTERN) ==========

class PostalFacility(TimestampedModel):
    """
    Stable container for a postal facility.
    This is a pure pointer - all temporal data is in PostalFacilityIdentity.
    """
    postal_facility_id = models.AutoField(primary_key=True, db_column='PostalFacilityID')
    reference_code = models.CharField(
        max_length=50,
        unique=True,
        db_column='ReferenceCode',
        help_text="Stable identifier (e.g., 'US-VA-RICHMOND-001', 'TR-IST-001')"
    )
    latitude = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
        db_column='Latitude',
        help_text="Primary coordinates - if facility moved, use PostalFacilityIdentity override"
    )
    longitude = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
        db_column='Longitude',
        help_text="Primary coordinates - if facility moved, use PostalFacilityIdentity override"
    )

    class Meta:
        db_table = 'PostalFacilities'
        verbose_name = 'Postal Facility'
        verbose_name_plural = 'Postal Facilities'
        indexes = [
            models.Index(fields=['reference_code']),
        ]

    def get_current_identity(self):
        """Get currently active identity"""
        return self.identities.filter(effective_to_date__isnull=True).first()

    def get_identity_at_date(self, target_date):
        """Get identity at specific date"""
        return self.identities.filter(
            Q(effective_from_date__lte=target_date) &
            (Q(effective_to_date__isnull=True) | Q(effective_to_date__gt=target_date))
        ).first()

    def __str__(self):
        current = self.get_current_identity()
        if current:
            return f"{current.facility_name} ({self.reference_code})"
        return self.reference_code


class PostalFacilityIdentity(TimestampedModel):
    """
    Temporal identity of a postal facility.
    Captures what it was called, its status, and optionally location during a specific period.
    """
    postal_facility_identity_id = models.AutoField(
        primary_key=True,
        db_column='PostalFacilityIdentityID'
    )
    postal_facility = models.ForeignKey(
        PostalFacility,
        on_delete=models.PROTECT,
        related_name='identities',
        db_column='PostalFacilityID'
    )
    effective_from_date = models.DateField(db_column='EffectiveFromDate')
    effective_to_date = models.DateField(
        null=True,
        blank=True,
        db_column='EffectiveToDate'
    )
    facility_name = models.CharField(
        max_length=255,
        db_column='FacilityName',
        help_text="Name as it appeared on postmarks"
    )
    facility_type = models.CharField(
        max_length=50,
        db_column='FacilityType',
        choices=[
            ('POST_OFFICE', 'Post Office'),
            ('BRANCH', 'Branch Office'),
            ('STATION', 'Station'),
            ('SUB_STATION', 'Sub-Station'),
            ('CONTRACT_STATION', 'Contract Station'),
            ('RURAL_ROUTE', 'Rural Route'),
            ('DISCONTINUED', 'Discontinued'),
        ]
    )
    is_operational = models.BooleanField(default=True, db_column='IsOperational')
    discontinuation_reason = models.CharField(
        max_length=100,
        blank=True,
        db_column='DiscontinuationReason'
    )
    latitude = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
        db_column='Latitude',
        help_text="Override location if facility moved during this period"
    )
    longitude = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
        db_column='Longitude',
        help_text="Override location if facility moved during this period"
    )
    notes = models.TextField(blank=True, db_column='Notes')

    class Meta:
        db_table = 'PostalFacilityIdentities'
        verbose_name = 'Postal Facility Identity'
        verbose_name_plural = 'Postal Facility Identities'
        indexes = [
            models.Index(fields=['facility_name', 'effective_from_date']),
            models.Index(fields=['postal_facility', 'effective_from_date']),
        ]
        ordering = ['postal_facility', 'effective_from_date']

    def get_coordinates(self):
        """Get coordinates, using override if present, otherwise from facility"""
        if self.latitude and self.longitude:
            return (self.latitude, self.longitude)
        return (self.postal_facility.latitude, self.postal_facility.longitude)

    def __str__(self):
        return f"{self.facility_name} ({self.effective_from_date} - {self.effective_to_date or 'present'})"


class AdministrativeUnit(TimestampedModel):
    """
    Stable container for an administrative jurisdiction.
    This is a pure pointer - all temporal data is in AdministrativeUnitIdentity.
    """
    administrative_unit_id = models.AutoField(
        primary_key=True,
        db_column='AdministrativeUnitID'
    )
    reference_code = models.CharField(
        max_length=50,
        unique=True,
        db_column='ReferenceCode',
        help_text="Stable identifier (e.g., 'US-VA', 'RUS', 'DAK-TER')"
    )

    class Meta:
        db_table = 'AdministrativeUnits'
        verbose_name = 'Administrative Unit'
        verbose_name_plural = 'Administrative Units'
        indexes = [
            models.Index(fields=['reference_code']),
        ]

    def get_current_identity(self):
        """Get the currently active identity"""
        return self.identities.filter(effective_to_date__isnull=True).first()

    def get_identity_at_date(self, target_date):
        """Get the identity effective at a specific date"""
        return self.identities.filter(
            Q(effective_from_date__lte=target_date) &
            (Q(effective_to_date__isnull=True) | Q(effective_to_date__gt=target_date))
        ).first()

    def __str__(self):
        current = self.get_current_identity()
        if current:
            return f"{current.unit_name} ({self.reference_code})"
        return self.reference_code


class AdministrativeUnitIdentity(TimestampedModel):
    """
    Temporal identity of an administrative unit during a specific period.
    Tracks name, abbreviation, type, hierarchy, and parent during this period.
    """
    administrative_unit_identity_id = models.AutoField(
        primary_key=True,
        db_column='AdministrativeUnitIdentityID'
    )
    administrative_unit = models.ForeignKey(
        AdministrativeUnit,
        on_delete=models.CASCADE,
        related_name='identities',
        db_column='AdministrativeUnitID'
    )
    parent_administrative_unit = models.ForeignKey(
        AdministrativeUnit,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='child_identities',
        db_column='ParentAdministrativeUnitID'
    )
    effective_from_date = models.DateField(db_column='EffectiveFromDate')
    effective_to_date = models.DateField(
        null=True,
        blank=True,
        db_column='EffectiveToDate'
    )
    unit_name = models.CharField(max_length=255, db_column='UnitName')
    unit_abbreviation = models.CharField(max_length=10, db_column='UnitAbbreviation')
    unit_type = models.CharField(
        max_length=20,
        db_column='UnitType',
        choices=[
            ('COUNTRY', 'Country'),
            ('STATE', 'State'),
            ('PROVINCE', 'Province'),
            ('TERRITORY', 'Territory'),
            ('PREFECTURE', 'Prefecture'),
            ('COUNTY', 'County'),
            ('DISTRICT', 'District'),
            ('MUNICIPALITY', 'Municipality')
        ]
    )
    hierarchy_level = models.IntegerField(
        db_column='HierarchyLevel',
        help_text="1=Country, 2=State, 3=County, etc"
    )
    change_reason = models.CharField(
        max_length=20,
        db_column='ChangeReason',
        choices=[
            ('INITIAL', 'Initial Creation'),
            ('RENAMED', 'Renamed'),
            ('SPLIT', 'Split'),
            ('MERGED', 'Merged'),
            ('REORGANIZED', 'Reorganized'),
            ('INDEPENDENCE', 'Gained Independence'),
            ('ANNEXED', 'Annexed'),
            ('DISSOLVED', 'Dissolved'),
        ]
    )

    class Meta:
        db_table = 'AdministrativeUnitIdentities'
        verbose_name = 'Administrative Unit Identity'
        verbose_name_plural = 'Administrative Unit Identities'
        indexes = [
            models.Index(fields=['administrative_unit', 'effective_from_date']),
            models.Index(fields=['effective_from_date', 'effective_to_date']),
        ]
        ordering = ['administrative_unit', '-effective_from_date']

    def get_parent_identity_at_this_time(self):
        """Get the parent's identity during this child's time period"""
        if not self.parent_administrative_unit:
            return None
        return self.parent_administrative_unit.get_identity_at_date(
            self.effective_from_date
        )

    def __str__(self):
        return f"{self.unit_name} ({self.effective_from_date} - {self.effective_to_date or 'present'})"


class AdministrativeUnitResponsibility(TimestampedModel):
    """
    Assigns a Django Group as responsible for managing submissions
    related to a specific AdministrativeUnit.
    """
    administrative_unit_responsibility_id = models.AutoField(
        primary_key=True,
        db_column='AdministrativeUnitResponsibilityID'
    )
    administrative_unit = models.ForeignKey(
        AdministrativeUnit,
        on_delete=models.CASCADE,
        related_name='responsibilities',
        db_column='AdministrativeUnitID',
        help_text="The administrative unit this group is responsible for"
    )
    group = models.ForeignKey(
        Group,
        on_delete=models.CASCADE,
        related_name='administrative_responsibilities',
        db_column='GroupID',
        help_text="The Django group responsible for this region"
    )
    is_active = models.BooleanField(
        default=True,
        db_column='IsActive',
        help_text="Whether this responsibility is currently active"
    )
    notes = models.TextField(blank=True, db_column='Notes')

    class Meta:
        db_table = 'AdministrativeUnitResponsibilities'
        verbose_name = 'Administrative Unit Responsibility'
        verbose_name_plural = 'Administrative Unit Responsibilities'
        unique_together = [['administrative_unit', 'group']]
        indexes = [
            models.Index(fields=['administrative_unit', 'is_active']),
            models.Index(fields=['group', 'is_active']),
        ]

    def __str__(self):
        unit_identity = self.administrative_unit.get_current_identity()
        unit_name = unit_identity.unit_name if unit_identity else self.administrative_unit.reference_code
        return f"{self.group.name} → {unit_name}"


class JurisdictionalAffiliation(TimestampedModel):
    """
    Temporal relationship between a postal facility and its governing jurisdiction.
    """
    jurisdictional_affiliation_id = models.AutoField(
        primary_key=True,
        db_column='JurisdictionalAffiliationID'
    )
    postal_facility_identity = models.ForeignKey(
        PostalFacilityIdentity,
        on_delete=models.CASCADE,
        related_name='jurisdictions',
        db_column='PostalFacilityIdentityID'
    )
    administrative_unit = models.ForeignKey(
        AdministrativeUnit,
        on_delete=models.PROTECT,
        related_name='governed_facilities',
        db_column='AdministrativeUnitID'
    )
    effective_from_date = models.DateField(db_column='EffectiveFromDate')
    effective_to_date = models.DateField(
        null=True,
        blank=True,
        db_column='EffectiveToDate'
    )
    affiliation_source = models.CharField(
        max_length=255,
        db_column='AffiliationSource',
        help_text="Treaty, Organic Act, Congressional Act, etc."
    )

    class Meta:
        db_table = 'JurisdictionalAffiliations'
        verbose_name = 'Jurisdictional Affiliation'
        verbose_name_plural = 'Jurisdictional Affiliations'
        indexes = [
            models.Index(fields=['postal_facility_identity', 'effective_from_date']),
            models.Index(fields=['administrative_unit', 'effective_from_date']),
        ]

    def get_administrative_unit_identity(self):
        """Get the administrative unit's identity during this affiliation"""
        return self.administrative_unit.get_identity_at_date(self.effective_from_date)

    def __str__(self):
        facility = self.postal_facility_identity.facility_name
        admin_identity = self.get_administrative_unit_identity()
        admin_name = admin_identity.unit_name if admin_identity else "Unknown"
        return f"{facility} in {admin_name} ({self.effective_from_date})"


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

    postmark_id = models.AutoField(primary_key=True, db_column='PostmarkID')
    postal_facility_identity = models.ForeignKey(
        PostalFacilityIdentity,
        on_delete=models.PROTECT,
        related_name='postmarks',
        db_column='PostalFacilityIdentityID',
        help_text="The facility identity when this postmark was used"
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
        DateFormat,
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
        db_column='RateLocation'
    )
    rate_value = models.CharField(
        max_length=50,
        db_column='RateValue',
        help_text="5c, 10c, Free, Paid, etc"
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
            models.Index(fields=['postal_facility_identity']),
            models.Index(fields=['postmark_key']),
        ]

    def get_responsible_groups(self):
        """Get the groups responsible for this postmark's region"""
        # Get current jurisdictions for this facility
        affiliations = self.postal_facility_identity.jurisdictions.filter(
            Q(effective_to_date__isnull=True) | Q(effective_to_date__gte=models.functions.Now())
        )
        
        # Get all administrative units this facility belongs to
        admin_units = [aff.administrative_unit for aff in affiliations]
        
        # Get responsibilities for these units
        responsibilities = AdministrativeUnitResponsibility.objects.filter(
            administrative_unit__in=admin_units,
            is_active=True
        )
        
        return [resp.group for resp in responsibilities]

    def __str__(self):
        return f"{self.postmark_key} - {self.postal_facility_identity.facility_name}"


class PostmarkColor(TimestampedModel):
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

    class Meta:
        db_table = 'PostmarkColors'
        verbose_name = 'Postmark Color'
        verbose_name_plural = 'Postmark Colors'
        unique_together = [['postmark', 'color']]

    def __str__(self):
        return f"{self.postmark} - {self.color}"


class PostmarkDatesSeen(TimestampedModel):
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

    class Meta:
        db_table = 'PostmarkDatesSeen'
        verbose_name = 'Postmark Dates Seen'
        verbose_name_plural = 'Postmark Dates Seen'
        ordering = ['earliest_date_seen']

    def __str__(self):
        return f"{self.postmark} ({self.earliest_date_seen} - {self.latest_date_seen})"


class PostmarkSize(TimestampedModel):
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
        db_column='SizeNotes'
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


class PostmarkPublicationReference(TimestampedModel):
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
        db_column='PublishedID'
    )
    reference_location = models.CharField(
        max_length=255,
        db_column='ReferenceLocation'
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
        db_column='FileChecksum'
    )
    mime_type = models.CharField(
        max_length=50,
        db_column='MimeType'
    )
    image_width = models.IntegerField(db_column='ImageWidth')
    image_height = models.IntegerField(db_column='ImageHeight')
    file_size_bytes = models.BigIntegerField(db_column='FileSizeBytes')
    image_view = models.CharField(
        max_length=20,
        choices=IMAGE_VIEW_CHOICES,
        db_column='ImageView'
    )
    image_description = models.TextField(blank=True, db_column='ImageDescription')
    display_order = models.IntegerField(
        default=0,
        db_column='DisplayOrder'
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='postmark_images_uploaded',
        db_column='UploadedByUserID'
    )

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
            self.file_checksum = self.generate_checksum(self.file_object)
        super().save(*args, **kwargs)

    @staticmethod
    def generate_checksum(file_object):
        """Generate SHA-256 checksum for file"""
        sha256_hash = hashlib.sha256()
        for byte_block in iter(lambda: file_object.read(4096), b""):
            sha256_hash.update(byte_block)
        file_object.seek(0)
        return sha256_hash.hexdigest()


# ========== POSTCOVER MODELS (COLLECTING) ==========

class Postcover(TimestampedModel):
    """Physical postal covers/envelopes that collectors own"""
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


class PostcoverPostmark(TimestampedModel):
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
    position_order = models.IntegerField(db_column='PositionOrder')
    postmark_location = models.CharField(
        max_length=20,
        choices=POSTMARK_LOCATION_CHOICES,
        db_column='PostmarkLocation'
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
    uploaded_by = models.ForeignKey(
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
        db_column='FileChecksum'
    )
    mime_type = models.CharField(
        max_length=50,
        db_column='MimeType'
    )
    image_width = models.IntegerField(db_column='ImageWidth')
    image_height = models.IntegerField(db_column='ImageHeight')
    file_size_bytes = models.BigIntegerField(db_column='FileSizeBytes')
    image_view = models.CharField(
        max_length=20,
        choices=IMAGE_VIEW_CHOICES,
        db_column='ImageView'
    )
    image_description = models.TextField(blank=True, db_column='ImageDescription')
    display_order = models.IntegerField(
        default=0,
        db_column='DisplayOrder'
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
            self.file_checksum = PostmarkImage.generate_checksum(self.file_object)
        super().save(*args, **kwargs)

###################################################################################################
