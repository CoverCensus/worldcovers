import hashlib
from django.db import models
from django.db.models import Q
from django.contrib.auth.models import Group
from django.contrib.sites.models import Site
from django.utils.translation import gettext_lazy as _
from django.conf import settings
from colorfield.fields import ColorField

class TimestampedModel(models.Model):
    """Abstract base model with creation and modification tracking"""
    created_date = models.DateTimeField(auto_now_add=True, db_column='CreatedDate')
    modified_date = models.DateTimeField(auto_now=True, db_column='ModifiedDate')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='%(class)s_created', db_column='CreatedByUserID')
    modified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='%(class)s_modified', db_column='ModifiedByUserID')

    class Meta:
        abstract = True

class PostalFacility(TimestampedModel):
    """
    Stable container for a postal facility.
    This is a pure pointer - all temporal data is in PostalFacilityIdentity.
    """
    postal_facility_id = models.AutoField(primary_key=True, db_column='PostalFacilityID')
    reference_code = models.CharField(max_length=50, unique=True, db_column='ReferenceCode', help_text="Stable identifier (e.g., 'US-VA-RICHMOND-001', 'TR-IST-001')")
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True, db_column='Latitude', help_text='Primary coordinates - if facility moved, use PostalFacilityIdentity override')
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True, db_column='Longitude', help_text='Primary coordinates - if facility moved, use PostalFacilityIdentity override')

    class Meta:
        db_table = 'PostalFacilities'
        verbose_name = 'Postal Facility'
        verbose_name_plural = 'Postal Facilities'
        indexes = [models.Index(fields=['reference_code'])]

    def get_current_identity(self):
        """Get currently active identity"""
        return self.identities.filter(effective_to_date__isnull=True).first()

    def get_identity_at_date(self, target_date):
        """Get identity at specific date"""
        return self.identities.filter(Q(effective_from_date__lte=target_date) & (Q(effective_to_date__isnull=True) | Q(effective_to_date__gt=target_date))).first()

    def __str__(self):
        current = self.get_current_identity()
        if current:
            return f'{current.facility_name} ({self.reference_code})'
        return self.reference_code

class PostalFacilityIdentity(TimestampedModel):
    """
    Temporal identity of a postal facility.
    Captures what it was called, its status, and optionally location during a specific period.
    """
    postal_facility_identity_id = models.AutoField(primary_key=True, db_column='PostalFacilityIdentityID')
    postal_facility = models.ForeignKey(PostalFacility, on_delete=models.PROTECT, related_name='identities', db_column='PostalFacilityID')
    effective_from_date = models.DateField(db_column='EffectiveFromDate')
    effective_to_date = models.DateField(null=True, blank=True, db_column='EffectiveToDate')
    facility_name = models.CharField(max_length=255, db_column='FacilityName', help_text='Name as it appeared on postmarks')
    facility_type = models.CharField(max_length=50, db_column='FacilityType', choices=[('POST_OFFICE', 'Post Office'), ('BRANCH', 'Branch Office'), ('STATION', 'Station'), ('SUB_STATION', 'Sub-Station'), ('CONTRACT_STATION', 'Contract Station'), ('RURAL_ROUTE', 'Rural Route'), ('DISCONTINUED', 'Discontinued')])
    is_operational = models.BooleanField(default=True, db_column='IsOperational')
    discontinuation_reason = models.CharField(max_length=100, blank=True, db_column='DiscontinuationReason')
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True, db_column='Latitude', help_text='Override location if facility moved during this period')
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True, db_column='Longitude', help_text='Override location if facility moved during this period')
    notes = models.TextField(blank=True, db_column='Notes')

    class Meta:
        db_table = 'PostalFacilityIdentities'
        verbose_name = 'Postal Facility Identity'
        verbose_name_plural = 'Postal Facility Identities'
        indexes = [models.Index(fields=['facility_name', 'effective_from_date']), models.Index(fields=['postal_facility', 'effective_from_date'])]
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
    administrative_unit_id = models.AutoField(primary_key=True, db_column='AdministrativeUnitID')
    reference_code = models.CharField(max_length=50, unique=True, db_column='ReferenceCode', help_text="Stable identifier (e.g., 'US-VA', 'RUS', 'DAK-TER')")

    class Meta:
        db_table = 'AdministrativeUnits'
        verbose_name = 'Location'
        verbose_name_plural = 'Locations'
        indexes = [models.Index(fields=['reference_code'])]

    def get_current_identity(self):
        """Get the currently active identity"""
        return self.identities.filter(effective_to_date__isnull=True).first()

    def get_identity_at_date(self, target_date):
        """Get the identity effective at a specific date"""
        return self.identities.filter(Q(effective_from_date__lte=target_date) & (Q(effective_to_date__isnull=True) | Q(effective_to_date__gt=target_date))).first()

    def __str__(self):
        current = self.get_current_identity()
        if current:
            return f'{current.unit_name} ({self.reference_code})'
        return self.reference_code

class AdministrativeUnitIdentity(TimestampedModel):
    """
    Temporal identity of an administrative unit during a specific period.
    Tracks name, abbreviation, type, hierarchy, and parent during this period.
    """
    administrative_unit_identity_id = models.AutoField(primary_key=True, db_column='AdministrativeUnitIdentityID')
    administrative_unit = models.ForeignKey('postmarks.Location', on_delete=models.CASCADE, related_name='identities', db_column='AdministrativeUnitID')
    parent_administrative_unit = models.ForeignKey('postmarks.Location', on_delete=models.PROTECT, null=True, blank=True, related_name='child_identities', db_column='ParentAdministrativeUnitID')
    effective_from_date = models.DateField(db_column='EffectiveFromDate')
    effective_to_date = models.DateField(null=True, blank=True, db_column='EffectiveToDate')
    unit_name = models.CharField(max_length=255, db_column='UnitName')
    unit_abbreviation = models.CharField(max_length=10, db_column='UnitAbbreviation')
    unit_type = models.CharField(max_length=20, db_column='UnitType', choices=[('COUNTRY', 'Country'), ('STATE', 'State'), ('PROVINCE', 'Province'), ('TERRITORY', 'Territory'), ('PREFECTURE', 'Prefecture'), ('COUNTY', 'County'), ('DISTRICT', 'District'), ('MUNICIPALITY', 'Municipality')])
    hierarchy_level = models.IntegerField(db_column='HierarchyLevel', help_text='1=Country, 2=State, 3=County, etc')
    change_reason = models.CharField(max_length=20, db_column='ChangeReason', choices=[('INITIAL', 'Initial Creation'), ('RENAMED', 'Renamed'), ('SPLIT', 'Split'), ('MERGED', 'Merged'), ('REORGANIZED', 'Reorganized'), ('INDEPENDENCE', 'Gained Independence'), ('ANNEXED', 'Annexed'), ('DISSOLVED', 'Dissolved')])

    class Meta:
        db_table = 'AdministrativeUnitIdentities'
        verbose_name = 'Location identity'
        verbose_name_plural = 'Location identities'
        indexes = [models.Index(fields=['administrative_unit', 'effective_from_date']), models.Index(fields=['effective_from_date', 'effective_to_date'])]
        ordering = ['administrative_unit', '-effective_from_date']

    def get_parent_identity_at_this_time(self):
        """Get the parent's identity during this child's time period"""
        if not self.parent_administrative_unit:
            return None
        return self.parent_administrative_unit.get_identity_at_date(self.effective_from_date)

    def __str__(self):
        return f"{self.unit_name} ({self.effective_from_date} - {self.effective_to_date or 'present'})"

class AdministrativeUnitResponsibility(TimestampedModel):
    """
    Assigns a Django Group as responsible for managing submissions
    related to a specific AdministrativeUnit.
    """
    administrative_unit_responsibility_id = models.AutoField(primary_key=True, db_column='AdministrativeUnitResponsibilityID')
    administrative_unit = models.ForeignKey('postmarks.Location', on_delete=models.CASCADE, related_name='responsibilities', db_column='AdministrativeUnitID', help_text='The location this group is responsible for')
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='administrative_responsibilities', db_column='GroupID', help_text='The Django group responsible for this region')
    is_active = models.BooleanField(default=True, db_column='IsActive', help_text='Whether this responsibility is currently active')
    notes = models.TextField(blank=True, db_column='Notes')

    class Meta:
        db_table = 'AdministrativeUnitResponsibilities'
        verbose_name = 'Location responsibility'
        verbose_name_plural = 'Location responsibilities'
        unique_together = [['administrative_unit', 'group']]
        indexes = [models.Index(fields=['administrative_unit', 'is_active']), models.Index(fields=['group', 'is_active'])]

    def __str__(self):
        unit_identity = self.administrative_unit.get_current_identity()
        unit_name = unit_identity.unit_name if unit_identity else self.administrative_unit.reference_code
        return f'{self.group.name} → {unit_name}'

class JurisdictionalAffiliation(TimestampedModel):
    """
    Temporal relationship between a postal facility and its governing jurisdiction.
    """
    jurisdictional_affiliation_id = models.AutoField(primary_key=True, db_column='JurisdictionalAffiliationID')
    postal_facility_identity = models.ForeignKey(PostalFacilityIdentity, on_delete=models.CASCADE, related_name='jurisdictions', db_column='PostalFacilityIdentityID')
    administrative_unit = models.ForeignKey('postmarks.Location', on_delete=models.PROTECT, related_name='governed_facilities', db_column='AdministrativeUnitID')
    effective_from_date = models.DateField(db_column='EffectiveFromDate')
    effective_to_date = models.DateField(null=True, blank=True, db_column='EffectiveToDate')
    affiliation_source = models.CharField(max_length=255, db_column='AffiliationSource', help_text='Treaty, Organic Act, Congressional Act, etc.')

    class Meta:
        db_table = 'JurisdictionalAffiliations'
        verbose_name = 'Jurisdictional Affiliation'
        verbose_name_plural = 'Jurisdictional Affiliations'
        indexes = [models.Index(fields=['postal_facility_identity', 'effective_from_date']), models.Index(fields=['administrative_unit', 'effective_from_date'])]

    def get_administrative_unit_identity(self):
        """Get the administrative unit's identity during this affiliation"""
        return self.administrative_unit.get_identity_at_date(self.effective_from_date)

    def __str__(self):
        facility = self.postal_facility_identity.facility_name
        admin_identity = self.get_administrative_unit_identity()
        admin_name = admin_identity.unit_name if admin_identity else 'Unknown'
        return f'{facility} in {admin_name} ({self.effective_from_date})'

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
    color_value = ColorField(default='#FFFFFF', db_column='ColorValue')

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

class Postmark(TimestampedModel):
    """Main postmark records with pure postmark data"""
    RATE_LOCATION_CHOICES = [('TOP', 'Top'), ('BOTTOM', 'Bottom'), ('LEFT', 'Left'), ('RIGHT', 'Right'), ('CENTER', 'Center'), ('NONE', 'None')]
    VISIBILITY_CHOICES = [('PUBLIC', 'Public'), ('DRAFT', 'Draft'), ('ARCHIVED', 'Archived')]
    CONTRIBUTION_APPROVAL_CHOICES = [('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('needs_revision', 'Needs revision')]
    postmark_id = models.AutoField(primary_key=True, db_column='PostmarkID')
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name='postmarks', db_column='SiteID', default=1, help_text='Owning site for this listing')
    postal_facility_identity = models.ForeignKey(PostalFacilityIdentity, on_delete=models.PROTECT, related_name='postmarks', db_column='PostalFacilityIdentityID', null=True, blank=True, help_text='The facility identity when this postmark was used')
    state = models.ForeignKey('postmarks.Location', on_delete=models.PROTECT, related_name='postmarks_by_state', db_column='StateID', null=True, blank=True, help_text='Location (state/region) this listing belongs to; from import nStateID or facility jurisdiction')
    postmark_shape = models.ForeignKey(PostmarkShape, on_delete=models.PROTECT, related_name='postmarks', db_column='PostmarkShapeID')
    lettering_style = models.ForeignKey(LetteringStyle, on_delete=models.PROTECT, related_name='postmarks', db_column='LetteringStyleID')
    framing_style = models.ForeignKey(FramingStyle, on_delete=models.PROTECT, related_name='postmarks', db_column='FramingStyleID')
    date_format = models.ForeignKey(DateFormat, on_delete=models.PROTECT, related_name='postmarks', db_column='DateFormatID')
    postmark_key = models.CharField(max_length=255, unique=True, db_column='PostmarkKey')
    raw_state_data_id = models.IntegerField(null=True, blank=True, unique=True, db_column='RawStateDataID', help_text='Original nRawStateDataID from CSV import')
    public_slug = models.SlugField(max_length=150, unique=True, null=True, blank=True, db_column='PublicSlug')
    visibility = models.CharField(max_length=10, choices=VISIBILITY_CHOICES, default='PUBLIC', db_column='Visibility')
    contribution_approval_status = models.CharField(max_length=20, choices=CONTRIBUTION_APPROVAL_CHOICES, null=True, blank=True, db_column='ContributionApprovalStatus', help_text="Approval status for user-contributed catalog entries. Only 'approved' appear in public search.")
    source_catalog = models.CharField(max_length=255, blank=True, default='ASCC 5th ed. (1997)', db_column='SourceCatalog')
    source_page = models.CharField(max_length=50, blank=True, db_column='SourcePage')
    last_public_update_at = models.DateTimeField(null=True, blank=True, db_column='LastPublicUpdateAt')
    raw_import_payload = models.JSONField(null=True, blank=True, db_column='RawImportPayload', help_text='Full raw CSV row payload for import/backfill')
    rate_location = models.CharField(max_length=10, choices=RATE_LOCATION_CHOICES, db_column='RateLocation')
    rate_value = models.CharField(max_length=50, db_column='RateValue', help_text='5c, 10c, Free, Paid, etc')
    is_manuscript = models.BooleanField(default=False, db_column='IsManuscript', help_text='Hand-written or hand-stamped vs printed')
    other_characteristics = models.TextField(blank=True, db_column='OtherCharacteristics')

    class Meta:
        db_table = 'Postmarks'
        verbose_name = 'Listing'
        verbose_name_plural = 'Listings'
        ordering = ['postmark_id']
        indexes = [models.Index(fields=['postal_facility_identity']), models.Index(fields=['postmark_key']), models.Index(fields=['state'])]

    def get_responsible_groups(self):
        """Get the groups responsible for this postmark's region.
        Uses prefetched jurisdictions/responsibilities when available to avoid N+1 queries.
        """
        if not self.postal_facility_identity:
            return []
        affiliations = self.postal_facility_identity.jurisdictions.filter(Q(effective_to_date__isnull=True) | Q(effective_to_date__gte=models.functions.Now()))
        admin_units = [aff.administrative_unit for aff in affiliations]
        seen_ids = set()
        result = []
        for unit in admin_units:
            for resp in unit.responsibilities.filter(is_active=True):
                g = resp.group
                if g.id not in seen_ids:
                    seen_ids.add(g.id)
                    result.append(g)
        return result

    def __str__(self):
        facility_name = self.postal_facility_identity.facility_name if self.postal_facility_identity else 'Unknown'
        return f'{self.postmark_key} - {facility_name}'
    DATE_TYPE_CHOICES = [('BISHOP MARK', 'Bishop Mark'), ('FRANKLIN MARK', 'Franklin Mark'), ('QUAKER DATE', 'Quaker Date')]
    DATE_FMT_CHOICES = [('MD', 'MD'), ('MDD', 'MDD'), ('YD', 'YD'), ('YMD', 'YMD'), ('YMDD', 'YMDD')]
    IMPRESSION_CHOICES = [('Normal', 'Normal'), ('Stencil', 'Stencil'), ('Negative', 'Negative')]
    code = models.CharField(max_length=30, null=True, blank=True, help_text='Editor-assigned reference identifier')
    catalog_txt = models.TextField(blank=True, help_text='Authoritative ASCC catalog entry text')
    inscription_txt = models.TextField(blank=True, help_text='Text as physically inscribed on the town marking device')
    post_office = models.ForeignKey('PostOffice', on_delete=models.PROTECT, related_name='postmarks', null=True, blank=True)
    shape = models.ForeignKey('Shape', on_delete=models.PROTECT, null=True, blank=True, related_name='postmarks', help_text='Required when isManuscript is false')
    lettering = models.ForeignKey('Lettering', on_delete=models.PROTECT, null=True, blank=True, related_name='postmarks', help_text='Must be null when isManuscript is true')
    color = models.ForeignKey(Color, on_delete=models.PROTECT, null=True, blank=True, related_name='postmarks', help_text='Ink color of this marking; defaults to BLACK (id=1)')
    impression = models.CharField(max_length=10, choices=IMPRESSION_CHOICES, null=True, blank=True, help_text='Required when isManuscript is false; must be null when true')
    is_irreg = models.BooleanField(null=True, blank=True, help_text='Required when isManuscript is false; must be null when true')
    width = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='Horizontal dimension in millimeters')
    height = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='Vertical dimension in millimeters')
    date_type = models.CharField(max_length=20, choices=DATE_TYPE_CHOICES, null=True, blank=True, help_text='Named date convention: BISHOP MARK, FRANKLIN MARK, QUAKER DATE')
    date_fmt = models.CharField(max_length=10, choices=DATE_FMT_CHOICES, null=True, blank=True, help_text='Arrangement of date components: MD, MDD, YD, YMD, YMDD')



class PostmarkV2(TimestampedModel):
    """
    V2 extension row for Postmark data.
    This avoids changing/overloading legacy Postmark reverse relations.
    """
    postmark = models.OneToOneField(Postmark, on_delete=models.CASCADE, related_name='v2_data')
    # Legacy app-layer compatibility fields (v2-scoped copy)
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name='postmarks_v2_site', db_column='V2SiteID', default=1)
    postal_facility_identity = models.ForeignKey(
        PostalFacilityIdentity,
        on_delete=models.PROTECT,
        related_name='postmarks_v2_facility',
        db_column='V2PostalFacilityIdentityID',
        null=True,
        blank=True,
    )
    state = models.ForeignKey(
        'postmarks.Location',
        on_delete=models.PROTECT,
        related_name='postmarks_v2_state',
        db_column='V2StateID',
        null=True,
        blank=True,
    )
    postmark_shape = models.ForeignKey(
        PostmarkShape,
        on_delete=models.PROTECT,
        related_name='postmarks_v2_shape',
        db_column='V2PostmarkShapeID',
        null=True,
        blank=True,
    )
    lettering_style = models.ForeignKey(
        LetteringStyle,
        on_delete=models.PROTECT,
        related_name='postmarks_v2_lettering_style',
        db_column='V2LetteringStyleID',
        null=True,
        blank=True,
    )
    framing_style = models.ForeignKey(
        FramingStyle,
        on_delete=models.PROTECT,
        related_name='postmarks_v2_framing_style',
        db_column='V2FramingStyleID',
        null=True,
        blank=True,
    )
    legacy_date_format = models.ForeignKey(
        DateFormat,
        on_delete=models.PROTECT,
        related_name='postmarks_v2_legacy_date_format',
        db_column='V2LegacyDateFormatID',
        null=True,
        blank=True,
    )
    postmark_key = models.CharField(max_length=255, unique=True, db_column='V2PostmarkKey', null=True, blank=True)
    raw_state_data_id = models.IntegerField(null=True, blank=True, unique=True, db_column='V2RawStateDataID')
    public_slug = models.SlugField(max_length=150, unique=True, null=True, blank=True, db_column='V2PublicSlug')
    visibility = models.CharField(max_length=10, choices=Postmark.VISIBILITY_CHOICES, default='PUBLIC', db_column='V2Visibility')
    contribution_approval_status = models.CharField(max_length=20, choices=Postmark.CONTRIBUTION_APPROVAL_CHOICES, null=True, blank=True, db_column='V2ContributionApprovalStatus')
    source_catalog = models.CharField(max_length=255, blank=True, default='ASCC 5th ed. (1997)', db_column='V2SourceCatalog')
    source_page = models.CharField(max_length=50, blank=True, db_column='V2SourcePage')
    last_public_update_at = models.DateTimeField(null=True, blank=True, db_column='V2LastPublicUpdateAt')
    raw_import_payload = models.JSONField(null=True, blank=True, db_column='V2RawImportPayload')
    rate_location = models.CharField(max_length=10, choices=Postmark.RATE_LOCATION_CHOICES, db_column='V2RateLocation', default='NONE')
    rate_value = models.CharField(max_length=50, db_column='V2RateValue', blank=True, default='')
    other_characteristics = models.TextField(blank=True, db_column='V2OtherCharacteristics')

    # model.md domain fields
    code = models.CharField(max_length=30, unique=True, null=True, blank=True)
    catalog_txt = models.TextField(blank=True)
    inscription_txt = models.TextField(blank=True)
    post_office = models.ForeignKey('PostOffice', on_delete=models.PROTECT, null=True, blank=True, related_name='postmark_v2_entries')
    shape = models.ForeignKey('Shape', on_delete=models.PROTECT, null=True, blank=True, related_name='postmark_v2_entries')
    lettering = models.ForeignKey('Lettering', on_delete=models.PROTECT, null=True, blank=True, related_name='postmark_v2_entries')
    color = models.ForeignKey(Color, on_delete=models.PROTECT, null=True, blank=True, related_name='postmark_v2_entries')
    is_manuscript = models.BooleanField(default=False)
    impression = models.CharField(max_length=10, choices=Postmark.IMPRESSION_CHOICES, null=True, blank=True)
    is_irreg = models.BooleanField(null=True, blank=True)
    width = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    height = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    date_type = models.CharField(max_length=20, choices=Postmark.DATE_TYPE_CHOICES, null=True, blank=True)
    date_fmt = models.CharField(max_length=10, choices=Postmark.DATE_FMT_CHOICES, null=True, blank=True)
    date_format = models.ForeignKey(DateFormat, on_delete=models.PROTECT, related_name='postmark_v2_entries', null=True, blank=True)

    class Meta:
        db_table = 'PostmarkV2'
        verbose_name = 'Postmark V2'
        verbose_name_plural = 'Postmark V2'

    def __str__(self):
        return f'PostmarkV2({self.postmark_id})'


class Contribution(models.Model):
    """
    Moderation ticket for catalog contributions.
    Submissions create a Contribution instead of directly updating the catalog.
    State Editors approve/reject; on approval, submitted_data is applied to Postmark.
    """
    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_NEEDS_REVISION = 'needs_revision'
    STATUS_CHOICES = [(STATUS_PENDING, 'Pending'), (STATUS_APPROVED, 'Approved'), (STATUS_REJECTED, 'Rejected'), (STATUS_NEEDS_REVISION, 'Needs revision')]
    id = models.AutoField(primary_key=True, db_column='ContributionID')
    contributor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='contributions', db_column='ContributorUserID')
    postmark = models.OneToOneField(Postmark, on_delete=models.CASCADE, related_name='contribution', db_column='PostmarkID', null=True, blank=True, help_text='Set when approved; Postmark created from submitted_data for new entries')
    submitted_data = models.JSONField(default=dict, blank=True, db_column='SubmittedData', help_text='Proposed changes (state, town, type, color, description, etc.)')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, db_column='Status')
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_contributions', db_column='ReviewerUserID')
    review_notes = models.TextField(blank=True, db_column='ReviewNotes')
    created_at = models.DateTimeField(auto_now_add=True, db_column='CreatedAt')
    updated_at = models.DateTimeField(auto_now=True, db_column='UpdatedAt')

    class Meta:
        db_table = 'Contributions'
        verbose_name = 'Contribution'
        verbose_name_plural = 'Contributions'
        ordering = ['-created_at']

    def __str__(self):
        return f'Contribution #{self.id} ({self.status})'

class PostmarkColor(TimestampedModel):
    """Many-to-many relationship between postmarks and colors"""
    postmark_color_id = models.AutoField(primary_key=True, db_column='PostmarkColorID')
    postmark = models.ForeignKey(Postmark, on_delete=models.CASCADE, related_name='postmark_colors', db_column='PostmarkID')
    color = models.ForeignKey(Color, on_delete=models.PROTECT, related_name='postmark_colors', db_column='ColorID')

    class Meta:
        db_table = 'PostmarkColors'
        verbose_name = 'Postmark Color'
        verbose_name_plural = 'Postmark Colors'
        unique_together = [['postmark', 'color']]

    def __str__(self):
        return f'{self.postmark} - {self.color}'

class PostmarkDatesSeen(TimestampedModel):
    """Date ranges when postmarks were observed"""
    postmark_dates_seen_id = models.AutoField(primary_key=True, db_column='PostmarkDatesSeenID')
    postmark = models.ForeignKey(Postmark, on_delete=models.CASCADE, related_name='dates_seen', db_column='PostmarkID')
    earliest_date_seen = models.DateField(db_column='EarliestDateSeen')
    latest_date_seen = models.DateField(db_column='LatestDateSeen')

    class Meta:
        db_table = 'PostmarkDatesSeen'
        verbose_name = 'Postmark Dates Seen'
        verbose_name_plural = 'Postmark Dates Seen'
        ordering = ['earliest_date_seen']

    def __str__(self):
        return f'{self.postmark} ({self.earliest_date_seen} - {self.latest_date_seen})'

class PostmarkSize(TimestampedModel):
    """Different size observations for postmarks"""
    postmark_size_id = models.AutoField(primary_key=True, db_column='PostmarkSizeID')
    postmark = models.ForeignKey(Postmark, on_delete=models.CASCADE, related_name='sizes', db_column='PostmarkID')
    width = models.DecimalField(max_digits=8, decimal_places=2, db_column='Width')
    height = models.DecimalField(max_digits=8, decimal_places=2, db_column='Height')
    size_notes = models.CharField(max_length=255, blank=True, db_column='SizeNotes')

    class Meta:
        db_table = 'PostmarkSizes'
        verbose_name = 'Postmark Size'
        verbose_name_plural = 'Postmark Sizes'

    def __str__(self):
        return f'{self.postmark} - {self.width}x{self.height}'

class PostmarkValuation(TimestampedModel):
    """Valuations for postmarks"""
    postmark_valuation_id = models.AutoField(primary_key=True, db_column='PostmarkValuationID')
    postmark = models.ForeignKey(Postmark, on_delete=models.CASCADE, related_name='valuations', db_column='PostmarkID')
    # V2 fields
    appraisal_pos = models.PositiveSmallIntegerField(default=0, help_text='Ordinal position within the postmark valuation sequence')
    amt = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text='Non-negative USD; null = unpriced entry')
    appraisal_date = models.DateField(null=True, blank=True, db_column='AppraisalDate')
    # Legacy/app-layer fields retained for compatibility
    valued_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='postmark_valuations_made',
        db_column='ValuedByUserID',
        null=True,
        blank=True,
    )
    estimated_value = models.DecimalField(max_digits=10, decimal_places=2, db_column='EstimatedValue', null=True, blank=True)
    valuation_date = models.DateField(db_column='ValuationDate', null=True, blank=True)

    class Meta:
        db_table = 'PostmarkValuations'
        verbose_name = 'Postmark Valuation'
        verbose_name_plural = 'Postmark Valuations'
        unique_together = [['postmark', 'appraisal_pos']]
        ordering = ['-appraisal_date', '-valuation_date']

    def __str__(self):
        return f'{self.postmark} - ${self.estimated_value} ({self.valuation_date})'

class PostmarkPublication(TimestampedModel):
    """Catalog of publications that reference postmarks"""
    PUBLICATION_TYPE_CHOICES = [('BOOK', 'Book'), ('CATALOG', 'Catalog'), ('JOURNAL', 'Journal'), ('WEBSITE', 'Website'), ('NEWSLETTER', 'Newsletter')]
    postmark_publication_id = models.AutoField(primary_key=True, db_column='PostmarkPublicationID')
    publication_title = models.CharField(max_length=500, db_column='PublicationTitle')
    author = models.CharField(max_length=255, db_column='Author')
    publisher = models.CharField(max_length=255, db_column='Publisher')
    publication_date = models.DateField(db_column='PublicationDate')
    isbn = models.CharField(max_length=20, blank=True, db_column='ISBN')
    edition = models.CharField(max_length=50, blank=True, db_column='Edition')
    publication_type = models.CharField(max_length=20, choices=PUBLICATION_TYPE_CHOICES, db_column='PublicationType')

    class Meta:
        db_table = 'PostmarkPublications'
        verbose_name = 'Postmark Publication'
        verbose_name_plural = 'Postmark Publications'
        ordering = ['-publication_date']

    def __str__(self):
        year = getattr(self.publication_date, 'year', 'Unknown') if self.publication_date else 'Unknown'
        return f'{self.publication_title} ({self.author}, {year})'

class PostmarkPublicationReference(TimestampedModel):
    """Many-to-many junction table for postmark publication references"""
    postmark_publication_reference_id = models.AutoField(primary_key=True, db_column='PostmarkPublicationReferenceID')
    postmark = models.ForeignKey(Postmark, on_delete=models.CASCADE, related_name='publication_references', db_column='PostmarkID')
    postmark_publication = models.ForeignKey(PostmarkPublication, on_delete=models.CASCADE, related_name='postmark_references', db_column='PostmarkPublicationID')
    published_id = models.CharField(max_length=100, db_column='PublishedID')
    reference_location = models.CharField(max_length=255, db_column='ReferenceLocation')

    class Meta:
        db_table = 'PostmarkPublicationReferences'
        verbose_name = 'Postmark Publication Reference'
        verbose_name_plural = 'Postmark Publication References'
        unique_together = [['postmark', 'postmark_publication', 'published_id']]

    def __str__(self):
        return f'{self.postmark} in {self.postmark_publication} (ID: {self.published_id})'

class PostmarkImage(TimestampedModel):
    """Images of postmarks with metadata"""
    IMAGE_VIEW_CHOICES = [('FULL', 'Full'), ('DETAIL', 'Detail'), ('COMPARISON', 'Comparison')]
    postmark_image_id = models.AutoField(primary_key=True, db_column='PostmarkImageID')
    postmark = models.ForeignKey(Postmark, on_delete=models.CASCADE, related_name='images', db_column='PostmarkID')
    original_filename = models.CharField(max_length=255, db_column='OriginalFileName')
    storage_filename = models.CharField(max_length=255, unique=True, db_column='StorageFileName')
    file_checksum = models.CharField(max_length=64, db_column='FileChecksum')
    mime_type = models.CharField(max_length=50, db_column='MimeType')
    image_width = models.IntegerField(db_column='ImageWidth')
    image_height = models.IntegerField(db_column='ImageHeight')
    file_size_bytes = models.BigIntegerField(db_column='FileSizeBytes')
    image_view = models.CharField(max_length=20, choices=IMAGE_VIEW_CHOICES, db_column='ImageView')
    image_description = models.TextField(blank=True, db_column='ImageDescription')
    display_order = models.IntegerField(default=0, db_column='DisplayOrder')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='postmark_images_uploaded', db_column='UploadedByUserID')

    class Meta:
        db_table = 'PostmarkImages'
        verbose_name = 'Listing Image'
        verbose_name_plural = 'Listing Images'
        ordering = ['postmark', 'display_order']
        indexes = [models.Index(fields=['postmark', 'display_order']), models.Index(fields=['file_checksum'])]

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
    postcover_id = models.AutoField(primary_key=True, db_column='PostcoverID')
    owner_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='postcovers_owned', db_column='OwnerUserID')
    postcover_key = models.CharField(max_length=100, unique=True, db_column='PostcoverKey')
    description = models.TextField(blank=True, db_column='Description')

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
    postcover_postmark_id = models.AutoField(primary_key=True, db_column='PostcoverPostmarkID')
    postcover = models.ForeignKey(Postcover, on_delete=models.CASCADE, related_name='postcover_postmarks', db_column='PostcoverID')
    postmark = models.ForeignKey(Postmark, on_delete=models.CASCADE, related_name='postcover_postmarks', db_column='PostmarkID')
    position_order = models.IntegerField(db_column='PositionOrder')
    postmark_location = models.CharField(max_length=20, choices=POSTMARK_LOCATION_CHOICES, db_column='PostmarkLocation')

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
    postcover_image_id = models.AutoField(primary_key=True, db_column='PostcoverImageID')
    postcover = models.ForeignKey(Postcover, on_delete=models.CASCADE, related_name='images', db_column='PostcoverID')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='postcover_images_uploaded', db_column='UploadedByUserID')
    original_filename = models.CharField(max_length=255, db_column='OriginalFileName')
    storage_filename = models.CharField(max_length=255, unique=True, db_column='StorageFileName')
    file_checksum = models.CharField(max_length=64, db_column='FileChecksum')
    mime_type = models.CharField(max_length=50, db_column='MimeType')
    image_width = models.IntegerField(db_column='ImageWidth')
    image_height = models.IntegerField(db_column='ImageHeight')
    file_size_bytes = models.BigIntegerField(db_column='FileSizeBytes')
    image_view = models.CharField(max_length=20, choices=IMAGE_VIEW_CHOICES, db_column='ImageView')
    image_description = models.TextField(blank=True, db_column='ImageDescription')
    display_order = models.IntegerField(default=0, db_column='DisplayOrder')

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
    id = models.AutoField(primary_key=True, db_column='AdminCsvUploadID')
    name = models.CharField(max_length=255, db_column='Name', help_text='Display name for this upload (e.g. from filename or user input)')
    file_name = models.CharField(max_length=255, db_column='FileName', help_text='Original filename of the CSV')
    uploaded_at = models.DateTimeField(auto_now_add=True, db_column='UploadedAt')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='admin_csv_uploads', db_column='UploadedByUserID')
    data = models.JSONField(default=dict, db_column='Data', help_text='Parsed CSV: headers and rows')
    row_count = models.PositiveIntegerField(default=0, db_column='RowCount', help_text='Number of data rows (denormalized for list views without loading Data).')

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

class UserLocationAssignment(models.Model):
    """
    Links a Django user account to one or more locations (AdministrativeUnit).
    Used in the admin user detail page so staff can see and manage which
    locations a user is associated with.
    """
    id = models.AutoField(primary_key=True, db_column='UserLocationAssignmentID')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='location_assignments', db_column='UserID')
    administrative_unit = models.ForeignKey(AdministrativeUnit, on_delete=models.CASCADE, related_name='user_location_assignments', db_column='AdministrativeUnitID', help_text='Location this user is associated with')

    class Meta:
        db_table = 'UserLocationAssignments'
        verbose_name = 'User location assignment'
        verbose_name_plural = 'User location assignments'
        unique_together = [['user', 'administrative_unit']]

    def __str__(self):
        return f'{self.user} → {self.administrative_unit}'

class FAQEntry(TimestampedModel):
    """
    Simple FAQ entry for the public site, managed in Django admin
    and exposed to the SPA via a read-only API.
    """
    faq_entry_id = models.AutoField(primary_key=True, db_column='FAQEntryID')
    question = models.CharField(max_length=500, db_column='Question')
    answer = models.TextField(db_column='Answer')
    is_active = models.BooleanField(default=True, db_column='IsActive')
    display_order = models.PositiveIntegerField(default=0, db_column='DisplayOrder', help_text='Lower numbers appear first.')

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

    def __str__(self):
        return f'{self.postmark} -- {self.date} ({self.granularity})'

class Ratemark(TimestampedModel):
    """
    A postal rate marking device or manuscript rate marking.
    Classified by the same Shape/Lettering/Framing/Impression/isIrregular categories as Postmark.

    model.md domain type: Ratemark
    """
    IMPRESSION_CHOICES = [('Normal', 'Normal'), ('Stencil', 'Stencil'), ('Negative', 'Negative')]
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
        return f'Ratemark #{self.pk} ({self.inscription_text[:40]})'

class Auxmark(TimestampedModel):
    """
    An auxiliary or instructional marking (e.g. PAID, FREE) associated with a Postmark or Ratemark.
    Polymorphic via parentMarkType/parentMarkId.

    model.md domain type: Auxmark
    """
    PARENT_MARK_TYPE_CHOICES = [('POSTMARK', 'Postmark'), ('RATEMARK', 'Ratemark')]
    IMPRESSION_CHOICES = [('Normal', 'Normal'), ('Stencil', 'Stencil'), ('Negative', 'Negative')]
    parent_mark_type = models.CharField(max_length=10, choices=PARENT_MARK_TYPE_CHOICES, db_column='ParentMarkType')
    parent_mark_id = models.PositiveIntegerField(db_column='ParentMarkID', help_text='PK of the associated Postmark or Ratemark')
    inscription_text = models.TextField(db_column='InscriptionText', help_text='Text as physically inscribed on the auxiliary marking')
    is_manuscript = models.BooleanField(db_column='IsManuscript')
    shape = models.ForeignKey(Shape, on_delete=models.PROTECT, null=True, blank=True, related_name='auxmarks', db_column='ShapeID', help_text='Required when isManuscript is false; must be null when true')
    lettering = models.ForeignKey(Lettering, on_delete=models.PROTECT, null=True, blank=True, related_name='auxmarks', db_column='LetteringID', help_text='Must be null when isManuscript is true')
    color = models.ForeignKey(Color, on_delete=models.PROTECT, null=True, blank=True, related_name='auxmarks', db_column='ColorID', help_text='Ink color of this marking; defaults to BLACK (id=1)')
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
        pos = f' pos={self.framing_position}' if self.framing_position is not None else ''
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
