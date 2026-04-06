###################################################################################################
## WoCo Commons - Model Serialization
## MPC: 2025/11/15
###################################################################################################
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from common.models import (
    Region, PostOffice, Lettering, Framing, Shape, Cover, DateObserved,
    Ratemark, Auxmark, CoverPostmark, PostmarkRatemark, MarkFraming,
    ReferenceWork, Citation,
    PostalFacility, PostalFacilityIdentity,
    AdministrativeUnit, AdministrativeUnitIdentity, AdministrativeUnitResponsibility,
    JurisdictionalAffiliation,
    PostmarkShape, LetteringStyle, FramingStyle, Color, DateFormat,
    Postmark, PostmarkV2, PostmarkColor, PostmarkDatesSeen, PostmarkSize,
    PostmarkValuation, PostmarkPublication, PostmarkPublicationReference,
    PostmarkImage, Postcover, PostcoverPostmark, PostcoverImage,
    AdminCsvUpload, Contribution, FAQEntry,
)

User = get_user_model()


# ========== USER AND GROUP SERIALIZERS ==========

class UserSerializer(serializers.ModelSerializer):
    """Basic user serializer for nested representations"""
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']
        read_only_fields = ['id']


class GroupSerializer(serializers.ModelSerializer):
    """Group serializer for responsibility assignments"""
    class Meta:
        model = Group
        fields = ['id', 'name']
        read_only_fields = ['id']


class LoginRequestSerializer(serializers.Serializer):
    """Validates login access request (email, first_name, last_name). Creates User directly."""
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)

    def validate_email(self, value):
        value = (value or '').strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "A user with this email already exists."
            )
        return value


class FAQEntrySerializer(serializers.ModelSerializer):
    """Public FAQ entry serializer for the SPA (shared with v1)."""

    class Meta:
        model = FAQEntry
        fields = ["faq_entry_id", "question", "answer", "is_active", "display_order"]
        read_only_fields = ["faq_entry_id", "is_active", "display_order"]


# ========== GEOGRAPHIC HIERARCHY SERIALIZERS ==========

class RegionSerializer(serializers.ModelSerializer):
    """Serializer for v2 Region model."""

    class Meta:
        model = Region
        fields = "__all__"
        read_only_fields = ["id", "created_at", "modified_at"]


class PostOfficeSerializer(serializers.ModelSerializer):
    """Serializer for v2 PostOffice model."""
    region_name = serializers.CharField(source="region.name", read_only=True)

    class Meta:
        model = PostOffice
        fields = "__all__"
        read_only_fields = ["id", "created_at", "modified_at"]


class LetteringSerializer(serializers.ModelSerializer):
    """Serializer for v2 Lettering model."""

    class Meta:
        model = Lettering
        fields = "__all__"
        read_only_fields = ["id", "created_at", "modified_at"]


class FramingSerializer(serializers.ModelSerializer):
    """Serializer for v2 Framing model."""

    class Meta:
        model = Framing
        fields = "__all__"
        read_only_fields = ["id", "created_at", "modified_at"]


class ShapeSerializer(serializers.ModelSerializer):
    """Serializer for v2 Shape model."""

    class Meta:
        model = Shape
        fields = "__all__"
        read_only_fields = ["id", "created_at", "modified_at"]


class CoverSerializer(serializers.ModelSerializer):
    """Serializer for v2 Cover model."""
    color_name = serializers.CharField(source="color.color_name", read_only=True)

    class Meta:
        model = Cover
        fields = "__all__"
        read_only_fields = ["id", "created_at", "modified_at"]


class DateObservedSerializer(serializers.ModelSerializer):
    """Serializer for v2 DateObserved model."""

    class Meta:
        model = DateObserved
        fields = "__all__"
        read_only_fields = ["id", "created_at", "modified_at"]


class RatemarkSerializer(serializers.ModelSerializer):
    """Serializer for v2 Ratemark model."""

    class Meta:
        model = Ratemark
        fields = "__all__"
        read_only_fields = ["id", "created_at", "modified_at"]


class AuxmarkSerializer(serializers.ModelSerializer):
    """Serializer for v2 Auxmark model."""

    class Meta:
        model = Auxmark
        fields = "__all__"
        read_only_fields = ["id", "created_at", "modified_at"]


class CoverPostmarkSerializer(serializers.ModelSerializer):
    """Serializer for v2 CoverPostmark model."""

    class Meta:
        model = CoverPostmark
        fields = "__all__"
        read_only_fields = ["id", "created_at", "modified_at"]


class PostmarkRatemarkSerializer(serializers.ModelSerializer):
    """Serializer for v2 PostmarkRatemark model."""

    class Meta:
        model = PostmarkRatemark
        fields = "__all__"
        read_only_fields = ["id", "created_at", "modified_at"]


class MarkFramingSerializer(serializers.ModelSerializer):
    """Serializer for v2 MarkFraming model."""

    class Meta:
        model = MarkFraming
        fields = "__all__"
        read_only_fields = ["id", "created_at", "modified_at"]


class ReferenceWorkSerializer(serializers.ModelSerializer):
    """Serializer for v2 ReferenceWork model."""

    class Meta:
        model = ReferenceWork
        fields = "__all__"
        read_only_fields = ["id", "created_at", "modified_at"]


class CitationSerializer(serializers.ModelSerializer):
    """Serializer for v2 Citation model."""

    class Meta:
        model = Citation
        fields = "__all__"
        read_only_fields = ["id", "created_at", "modified_at"]


class AdministrativeUnitListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for lists"""
    current_name = serializers.SerializerMethodField()
    current_type = serializers.SerializerMethodField()
    
    class Meta:
        model = AdministrativeUnit
        fields = ['administrative_unit_id', 'reference_code', 'current_name', 'current_type']
    
    def get_current_name(self, obj):
        identity = obj.get_current_identity()
        return identity.unit_name if identity else None
    
    def get_current_type(self, obj):
        identity = obj.get_current_identity()
        return identity.unit_type if identity else None


class AdministrativeUnitIdentitySerializer(serializers.ModelSerializer):
    """Serializer for administrative unit identities"""
    parent_name = serializers.SerializerMethodField()
    created_by = UserSerializer(read_only=True)
    
    class Meta:
        model = AdministrativeUnitIdentity
        fields = '__all__'
        read_only_fields = ['administrative_unit_identity_id', 'created_at']
    
    def get_parent_name(self, obj):
        if obj.parent_administrative_unit:
            parent_identity = obj.get_parent_identity_at_this_time()
            return parent_identity.unit_name if parent_identity else None
        return None


class AdministrativeUnitResponsibilitySerializer(serializers.ModelSerializer):
    """Serializer for group responsibilities"""
    group = GroupSerializer(read_only=True)
    group_id = serializers.PrimaryKeyRelatedField(
        queryset=Group.objects.all(),
        source='group',
        write_only=True
    )
    administrative_unit_name = serializers.SerializerMethodField()
    created_by = UserSerializer(read_only=True)
    modified_by = UserSerializer(read_only=True)
    
    class Meta:
        model = AdministrativeUnitResponsibility
        fields = '__all__'
        read_only_fields = ['administrative_unit_responsibility_id', 'created_at', 'modified_at']
    
    def get_administrative_unit_name(self, obj):
        identity = obj.administrative_unit.get_current_identity()
        return identity.unit_name if identity else obj.administrative_unit.reference_code


class AdministrativeUnitSerializer(serializers.ModelSerializer):
    """Full serializer with nested identities and responsibilities"""
    identities = AdministrativeUnitIdentitySerializer(many=True, read_only=True)
    responsibilities = AdministrativeUnitResponsibilitySerializer(many=True, read_only=True)
    current_identity = serializers.SerializerMethodField()
    created_by = UserSerializer(read_only=True)
    modified_by = UserSerializer(read_only=True)
    
    class Meta:
        model = AdministrativeUnit
        fields = '__all__'
        read_only_fields = ['administrative_unit_id', 'created_at', 'modified_at']
    
    def get_current_identity(self, obj):
        identity = obj.get_current_identity()
        return AdministrativeUnitIdentitySerializer(identity).data if identity else None


class PostalFacilityListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for lists"""
    current_name = serializers.SerializerMethodField()
    current_type = serializers.SerializerMethodField()
    
    class Meta:
        model = PostalFacility
        fields = ['postal_facility_id', 'reference_code', 'current_name', 'current_type', 
                  'latitude', 'longitude']
    
    def get_current_name(self, obj):
        identity = obj.get_current_identity()
        return identity.facility_name if identity else None
    
    def get_current_type(self, obj):
        identity = obj.get_current_identity()
        return identity.facility_type if identity else None


class PostalFacilityIdentitySerializer(serializers.ModelSerializer):
    """Serializer for postal facility identities"""
    coordinates = serializers.SerializerMethodField()
    created_by = UserSerializer(read_only=True)
    modified_by = UserSerializer(read_only=True)
    
    class Meta:
        model = PostalFacilityIdentity
        fields = '__all__'
        read_only_fields = ['postal_facility_identity_id', 'created_at', 'modified_at']
    
    def get_coordinates(self, obj):
        coords = obj.get_coordinates()
        if coords and coords[0] and coords[1]:
            return {'latitude': coords[0], 'longitude': coords[1]}
        return None


class JurisdictionalAffiliationSerializer(serializers.ModelSerializer):
    """Serializer for jurisdictional affiliations"""
    facility_name = serializers.CharField(
        source='postal_facility_identity.facility_name',
        read_only=True
    )
    administrative_unit_name = serializers.SerializerMethodField()
    created_by = UserSerializer(read_only=True)
    modified_by = UserSerializer(read_only=True)
    
    class Meta:
        model = JurisdictionalAffiliation
        fields = '__all__'
        read_only_fields = ['jurisdictional_affiliation_id', 'created_at', 'modified_at']
    
    def get_administrative_unit_name(self, obj):
        identity = obj.get_administrative_unit_identity()
        return identity.unit_name if identity else None


class PostalFacilitySerializer(serializers.ModelSerializer):
    """Full serializer with nested identities"""
    identities = PostalFacilityIdentitySerializer(many=True, read_only=True)
    current_identity = serializers.SerializerMethodField()
    created_by = UserSerializer(read_only=True)
    modified_by = UserSerializer(read_only=True)
    
    class Meta:
        model = PostalFacility
        fields = '__all__'
        read_only_fields = ['postal_facility_id', 'created_at', 'modified_at']
    
    def get_current_identity(self, obj):
        identity = obj.get_current_identity()
        return PostalFacilityIdentitySerializer(identity).data if identity else None


# ========== PHYSICAL CHARACTERISTICS SERIALIZERS ==========

class PostmarkShapeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostmarkShape
        fields = '__all__'
        read_only_fields = ['postmark_shape_id', 'created_at', 'modified_at']


class LetteringStyleSerializer(serializers.ModelSerializer):
    class Meta:
        model = LetteringStyle
        fields = '__all__'
        read_only_fields = ['lettering_style_id', 'created_at', 'modified_at']


class FramingStyleSerializer(serializers.ModelSerializer):
    class Meta:
        model = FramingStyle
        fields = '__all__'
        read_only_fields = ['framing_style_id', 'created_at', 'modified_at']


class ColorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Color
        fields = '__all__'
        read_only_fields = ['color_id', 'created_at', 'modified_at']


class DateFormatSerializer(serializers.ModelSerializer):
    class Meta:
        model = DateFormat
        fields = '__all__'
        read_only_fields = ['date_format_id', 'created_at', 'modified_at']


# ========== POSTMARK SERIALIZERS ==========

class PostmarkColorSerializer(serializers.ModelSerializer):
    """Postmark color relationship"""
    color_name = serializers.CharField(source='color.color_name', read_only=True)
    color_id = serializers.PrimaryKeyRelatedField(
        queryset=Color.objects.all(),
        source='color',
        write_only=True
    )
    
    class Meta:
        model = PostmarkColor
        fields = ['postmark_color_id', 'color_id', 'color_name', 'created_at']
        read_only_fields = ['postmark_color_id', 'created_at']


class PostmarkDatesSeenSerializer(serializers.ModelSerializer):
    """Date ranges when postmarks were observed"""
    class Meta:
        model = PostmarkDatesSeen
        fields = ['postmark_dates_seen_id', 'earliest_date_seen', 'latest_date_seen', 'created_at']
        read_only_fields = ['postmark_dates_seen_id', 'created_at']


class PostmarkSizeSerializer(serializers.ModelSerializer):
    """Postmark size observations"""
    class Meta:
        model = PostmarkSize
        fields = ['postmark_size_id', 'width', 'height', 'size_notes', 'created_at']
        read_only_fields = ['postmark_size_id', 'created_at']


class PostmarkValuationSerializer(serializers.ModelSerializer):
    """Postmark valuations"""
    valued_by = UserSerializer(source='valued_by_user', read_only=True)
    
    class Meta:
        model = PostmarkValuation
        fields = [
            'postmark_valuation_id',
            'valued_by',
            'estimated_value',
            'valuation_date',
            'appraisal_pos',
            'amt',
            'appraisal_date',
            'created_at',
        ]
        read_only_fields = ['postmark_valuation_id', 'created_at', 'modified_at']


class PostmarkV2Serializer(serializers.ModelSerializer):
    """V2 extension values linked to a Postmark."""

    class Meta:
        model = PostmarkV2
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'modified_at']


class PostmarkImageSerializer(serializers.ModelSerializer):
    """Postmark images"""
    image_url = serializers.SerializerMethodField()
    
    class Meta:
        model = PostmarkImage
        fields = ['postmark_image_id', 'original_filename', 'storage_filename',
                  'image_url', 'mime_type', 'image_width', 'image_height',
                  'file_size_bytes', 'image_view', 'image_description',
                  'display_order', 'uploaded_by', 'created_at']
        read_only_fields = ['postmark_image_id', 'file_checksum', 'created_at', 'modified_at']
    
    def get_image_url(self, obj):
        """
        Generate image URL.
        - Legacy catalog images use storage_filename like 'iowa/Marking-....jpg'
          and live directly under MEDIA_ROOT/<state>/..., so their public URL
          should be `${MEDIA_URL}${storage_filename}` → `/media/iowa/...`.
        - New contributor images are saved under MEDIA_ROOT/postmarks/contributions/...
          with storage_filename like 'contributions/<uuid>.ext', so their public
          URL should be `${MEDIA_URL}postmarks/${storage_filename}`.
        """
        storage = (obj.storage_filename or "").lstrip("/")
        if not storage:
            return None

        request = self.context.get("request")
        if not request:
            return None

        from django.conf import settings

        # Heuristic: treat 'contributions/...' (and any future explicit
        # postmarks subpaths) as living under MEDIA_ROOT/postmarks/.
        if storage.startswith("contributions/") or storage.startswith("postmarks/"):
            path = f"{settings.MEDIA_URL.rstrip('/')}/postmarks/{storage}"
        else:
            # Legacy images already include their state/dir prefix and live
            # directly under MEDIA_ROOT, so don't insert 'postmarks/'.
            path = f"{settings.MEDIA_URL.rstrip('/')}/{storage}"

        return request.build_absolute_uri(path)


class PostmarkListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for postmark lists (search/catalog)"""
    postmark_key = serializers.SerializerMethodField()
    facility_name = serializers.SerializerMethodField()
    shape_name = serializers.SerializerMethodField()
    main_image = serializers.SerializerMethodField()
    responsible_groups = serializers.SerializerMethodField()
    state = serializers.SerializerMethodField()
    town = serializers.SerializerMethodField()
    colors_display = serializers.SerializerMethodField()
    valuation_display = serializers.SerializerMethodField()
    size_display = serializers.SerializerMethodField()
    is_manuscript = serializers.SerializerMethodField()
    catalog_txt = serializers.SerializerMethodField()
    inscription_txt = serializers.SerializerMethodField()
    lettering_style_name = serializers.SerializerMethodField()
    framing_style_name = serializers.SerializerMethodField()
    earliest_use = serializers.SerializerMethodField()
    latest_use = serializers.SerializerMethodField()

    class Meta:
        model = Postmark
        fields = [
            'postmark_id',
            'postmark_key',
            'facility_name',
            'shape_name',
            'rate_location',
            'rate_value',
            'is_manuscript',
            'main_image',
            'responsible_groups',
            'state',
            'state_id',
            'town',
            'size_display',
            'colors_display',
            'valuation_display',
            'contribution_approval_status',
            'created_date',
            'catalog_txt',
            'inscription_txt',
            'lettering_style_name',
            'framing_style_name',
            'earliest_use',
            'latest_use',
        ]

    def _v2(self, obj):
        """Get the PostmarkV2 row, or None."""
        return getattr(obj, 'v2_data', None)

    def get_postmark_key(self, obj):
        """PostmarkV2.V2PostmarkKey"""
        v2 = self._v2(obj)
        return v2.postmark_key if v2 else ''

    # -- Town / State: V2 post_office --

    def get_facility_name(self, obj):
        """PostmarkV2.post_office_id → post_office.name"""
        return self.get_town(obj)

    def get_town(self, obj):
        """PostmarkV2.post_office_id → post_office.name"""
        v2 = self._v2(obj)
        po = getattr(v2, 'post_office', None) if v2 else None
        return getattr(po, 'name', '') or ''

    def get_state(self, obj):
        """PostmarkV2.post_office_id → post_office.region_id → Region.name"""
        v2 = self._v2(obj)
        po = getattr(v2, 'post_office', None) if v2 else None
        if not po:
            return ''
        region = getattr(po, 'region', None)
        return getattr(region, 'name', '') or ''

    # -- Shape --

    def get_shape_name(self, obj):
        """PostmarkV2.shape_id → common_shape.name"""
        v2 = self._v2(obj)
        shape = getattr(v2, 'shape', None) if v2 else None
        return getattr(shape, 'name', '') or ''

    # -- Manuscript, catalog text, inscription text: direct columns on PostmarkV2 --

    def get_is_manuscript(self, obj):
        """PostmarkV2.is_manuscript"""
        v2 = self._v2(obj)
        return v2.is_manuscript if v2 else False

    def get_catalog_txt(self, obj):
        """PostmarkV2.catalog_txt"""
        v2 = self._v2(obj)
        return v2.catalog_txt or '' if v2 else ''

    def get_inscription_txt(self, obj):
        """PostmarkV2.inscription_txt"""
        v2 = self._v2(obj)
        return v2.inscription_txt or '' if v2 else ''

    # -- Lettering / Framing --

    def get_lettering_style_name(self, obj):
        """PostmarkV2.lettering_id → common_lettering.name"""
        v2 = self._v2(obj)
        lettering = getattr(v2, 'lettering', None) if v2 else None
        return getattr(lettering, 'name', '') or ''

    def get_framing_style_name(self, obj):
        """mark_framing (parent_mark_type=POSTMARK, parent_mark_id=PK) → common_framing.name"""
        framings = MarkFraming.objects.filter(
            parent_mark_type='POSTMARK',
            parent_mark_id=obj.postmark_id,
        ).select_related('framing').order_by('framing_pos')
        names = [mf.framing.name for mf in framings if mf.framing]
        return ', '.join(names) if names else ''

    # -- Dimensions: V2 width/height --

    def get_size_display(self, obj):
        """PostmarkV2.width / PostmarkV2.height"""
        v2 = self._v2(obj)
        if not v2:
            return None
        fmt = lambda v: f"{float(v):g}" if v else None
        w = fmt(v2.width)
        h = fmt(v2.height)
        if w and h:
            return f"{w}×{h}"
        if w:
            return w
        if h:
            return h
        return None

    # -- Color: V2 FK into Colors --

    def get_colors_display(self, obj):
        """PostmarkV2.color_id → Colors.color_name"""
        v2 = self._v2(obj)
        color = getattr(v2, 'color', None) if v2 else None
        return getattr(color, 'color_name', '') or ''

    # -- Dates: from date_observed (V2) --

    def get_earliest_use(self, obj):
        """min(date_observed.date) where postmark_id = PK"""
        dates = list(obj.dates_observed.all())
        if not dates:
            return None
        earliest = min((d.date for d in dates if d.date), default=None)
        return earliest.isoformat() if earliest else None

    def get_latest_use(self, obj):
        """max(date_observed.date) where postmark_id = PK"""
        dates = list(obj.dates_observed.all())
        if not dates:
            return None
        latest = max((d.date for d in dates if d.date), default=None)
        return latest.isoformat() if latest else None

    # -- Image, groups, valuation: unchanged (no V2 equivalent) --

    def get_main_image(self, obj):
        """PostmarkImages where display_order=0"""
        main_img = obj.images.filter(display_order=0).first()
        if main_img:
            return PostmarkImageSerializer(main_img, context=self.context).data
        return None

    def get_responsible_groups(self, obj):
        groups = obj.get_responsible_groups()
        return [{'id': g.id, 'name': g.name} for g in groups]

    def get_valuation_display(self, obj):
        """Latest PostmarkValuations.EstimatedValue"""
        val = obj.valuations.order_by('-valuation_date').first()
        if not val:
            return None
        return str(val.estimated_value)


class PostmarkSerializer(serializers.ModelSerializer):
    """Full postmark serializer with all nested data — reads from PostmarkV2."""
    postal_facility_identity = PostalFacilityIdentitySerializer(read_only=True)
    postmark_shape = PostmarkShapeSerializer(read_only=True)
    lettering_style = LetteringStyleSerializer(read_only=True)
    framing_style = FramingStyleSerializer(read_only=True)
    date_format = DateFormatSerializer(read_only=True)

    # Write-only foreign key IDs
    postal_facility_identity_id = serializers.PrimaryKeyRelatedField(
        queryset=PostalFacilityIdentity.objects.all(),
        source='postal_facility_identity',
        write_only=True
    )
    postmark_shape_id = serializers.PrimaryKeyRelatedField(
        queryset=PostmarkShape.objects.all(),
        source='postmark_shape',
        write_only=True
    )
    lettering_style_id = serializers.PrimaryKeyRelatedField(
        queryset=LetteringStyle.objects.all(),
        source='lettering_style',
        write_only=True
    )
    framing_style_id = serializers.PrimaryKeyRelatedField(
        queryset=FramingStyle.objects.all(),
        source='framing_style',
        write_only=True
    )
    date_format_id = serializers.PrimaryKeyRelatedField(
        queryset=DateFormat.objects.all(),
        source='date_format',
        write_only=True,
        required=False
    )

    # Nested related data
    colors = PostmarkColorSerializer(source='postmark_colors', many=True, read_only=True)
    dates_seen = PostmarkDatesSeenSerializer(many=True, read_only=True)
    sizes = PostmarkSizeSerializer(many=True, read_only=True)
    valuations = PostmarkValuationSerializer(many=True, read_only=True)
    v2_data = PostmarkV2Serializer(read_only=True)
    images = PostmarkImageSerializer(many=True, read_only=True)
    responsible_groups = serializers.SerializerMethodField()

    # V2-sourced fields
    postmark_key = serializers.SerializerMethodField()
    state = serializers.SerializerMethodField()
    town = serializers.SerializerMethodField()
    shape_name = serializers.SerializerMethodField()
    is_manuscript = serializers.SerializerMethodField()
    catalog_txt = serializers.SerializerMethodField()
    inscription_txt = serializers.SerializerMethodField()
    lettering_style_name = serializers.SerializerMethodField()
    framing_style_name = serializers.SerializerMethodField()
    size_display = serializers.SerializerMethodField()
    colors_display = serializers.SerializerMethodField()
    earliest_use = serializers.SerializerMethodField()
    latest_use = serializers.SerializerMethodField()
    valuation_display = serializers.SerializerMethodField()

    created_by = UserSerializer(read_only=True)
    modified_by = UserSerializer(read_only=True)

    class Meta:
        model = Postmark
        fields = '__all__'
        read_only_fields = ['postmark_id', 'created_at', 'modified_at']

    def _v2(self, obj):
        return getattr(obj, 'v2_data', None)

    def get_postmark_key(self, obj):
        """PostmarkV2.V2PostmarkKey"""
        v2 = self._v2(obj)
        return v2.postmark_key if v2 else ''

    def get_town(self, obj):
        """PostmarkV2.post_office_id → post_office.name"""
        v2 = self._v2(obj)
        po = getattr(v2, 'post_office', None) if v2 else None
        return getattr(po, 'name', '') or ''

    def get_state(self, obj):
        """PostmarkV2.post_office_id → post_office.region_id → Region.name"""
        v2 = self._v2(obj)
        po = getattr(v2, 'post_office', None) if v2 else None
        if not po:
            return ''
        region = getattr(po, 'region', None)
        return getattr(region, 'name', '') or ''

    def get_shape_name(self, obj):
        """PostmarkV2.shape_id → common_shape.name"""
        v2 = self._v2(obj)
        shape = getattr(v2, 'shape', None) if v2 else None
        return getattr(shape, 'name', '') or ''

    def get_is_manuscript(self, obj):
        """PostmarkV2.is_manuscript"""
        v2 = self._v2(obj)
        return v2.is_manuscript if v2 else False

    def get_catalog_txt(self, obj):
        """PostmarkV2.catalog_txt"""
        v2 = self._v2(obj)
        return v2.catalog_txt or '' if v2 else ''

    def get_inscription_txt(self, obj):
        """PostmarkV2.inscription_txt"""
        v2 = self._v2(obj)
        return v2.inscription_txt or '' if v2 else ''

    def get_lettering_style_name(self, obj):
        """PostmarkV2.lettering_id → common_lettering.name"""
        v2 = self._v2(obj)
        lettering = getattr(v2, 'lettering', None) if v2 else None
        return getattr(lettering, 'name', '') or ''

    def get_framing_style_name(self, obj):
        """mark_framing (parent_mark_type=POSTMARK, parent_mark_id=PK) → common_framing.name"""
        framings = MarkFraming.objects.filter(
            parent_mark_type='POSTMARK',
            parent_mark_id=obj.postmark_id,
        ).select_related('framing').order_by('framing_pos')
        names = [mf.framing.name for mf in framings if mf.framing]
        return ', '.join(names) if names else ''

    def get_size_display(self, obj):
        """PostmarkV2.width / PostmarkV2.height"""
        v2 = self._v2(obj)
        if not v2:
            return None
        fmt = lambda v: f"{float(v):g}" if v else None
        w = fmt(v2.width)
        h = fmt(v2.height)
        if w and h:
            return f"{w}×{h}"
        if w:
            return w
        if h:
            return h
        return None

    def get_colors_display(self, obj):
        """PostmarkV2.color_id → Colors.color_name"""
        v2 = self._v2(obj)
        color = getattr(v2, 'color', None) if v2 else None
        return getattr(color, 'color_name', '') or ''

    def get_earliest_use(self, obj):
        """min(date_observed.date) where postmark_id = PK"""
        dates = list(obj.dates_observed.all())
        if not dates:
            return None
        earliest = min((d.date for d in dates if d.date), default=None)
        return earliest.isoformat() if earliest else None

    def get_latest_use(self, obj):
        """max(date_observed.date) where postmark_id = PK"""
        dates = list(obj.dates_observed.all())
        if not dates:
            return None
        latest = max((d.date for d in dates if d.date), default=None)
        return latest.isoformat() if latest else None

    def get_valuation_display(self, obj):
        val = obj.valuations.order_by('-valuation_date').first()
        if not val:
            return None
        return str(val.estimated_value)

    def get_responsible_groups(self, obj):
        groups = obj.get_responsible_groups()
        return [{'id': g.id, 'name': g.name} for g in groups]


# ========== PUBLICATION SERIALIZERS ==========

class PostmarkPublicationSerializer(serializers.ModelSerializer):
    """Publication catalog"""
    created_by = UserSerializer(read_only=True)
    modified_by = UserSerializer(read_only=True)
    
    class Meta:
        model = PostmarkPublication
        fields = '__all__'
        read_only_fields = ['postmark_publication_id', 'created_at', 'modified_at']


class PostmarkPublicationReferenceSerializer(serializers.ModelSerializer):
    """Publication references"""
    publication_title = serializers.CharField(
        source='postmark_publication.publication_title',
        read_only=True
    )
    
    class Meta:
        model = PostmarkPublicationReference
        fields = ['postmark_publication_reference_id', 'postmark_publication',
                  'publication_title', 'published_id', 'reference_location', 'created_at']
        read_only_fields = ['postmark_publication_reference_id', 'created_at']


# ========== POSTCOVER SERIALIZERS ==========

class PostcoverPostmarkSerializer(serializers.ModelSerializer):
    """Postmark on a postcover"""
    postmark_key = serializers.CharField(source='postmark.postmark_key', read_only=True)
    postmark_details = PostmarkListSerializer(source='postmark', read_only=True)
    
    class Meta:
        model = PostcoverPostmark
        fields = ['postcover_postmark_id', 'postmark', 'postmark_key', 
                  'postmark_details', 'position_order', 'postmark_location', 'created_at']
        read_only_fields = ['postcover_postmark_id', 'created_at']


class PostcoverImageSerializer(serializers.ModelSerializer):
    """Postcover images"""
    image_url = serializers.SerializerMethodField()
    
    class Meta:
        model = PostcoverImage
        fields = ['postcover_image_id', 'original_filename', 'storage_filename',
                  'image_url', 'mime_type', 'image_width', 'image_height',
                  'file_size_bytes', 'image_view', 'image_description',
                  'display_order', 'created_at']
        read_only_fields = ['postcover_image_id', 'file_checksum', 'created_at', 'modified_at']
    
    def get_image_url(self, obj):
        """Generate image URL"""
        if obj.storage_filename:
            request = self.context.get('request')
            if request:
                from django.conf import settings
                return request.build_absolute_uri(
                    f"{settings.MEDIA_URL}postcovers/{obj.storage_filename}"
                )
        return None


class PostcoverListSerializer(serializers.ModelSerializer):
    """Lightweight postcover list"""
    owner_username = serializers.CharField(source='owner_user.username', read_only=True)
    postmark_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Postcover
        fields = ['postcover_id', 'postcover_key', 'owner_username', 
                  'postmark_count', 'created_at']
    
    def get_postmark_count(self, obj):
        return obj.postcover_postmarks.count()


class PostcoverSerializer(serializers.ModelSerializer):
    """Full postcover with nested data"""
    owner_user = UserSerializer(read_only=True)
    postmarks = PostcoverPostmarkSerializer(source='postcover_postmarks', many=True, read_only=True)
    images = PostcoverImageSerializer(many=True, read_only=True)
    created_by = UserSerializer(read_only=True)
    modified_by = UserSerializer(read_only=True)
    
    class Meta:
        model = Postcover
        fields = '__all__'
        read_only_fields = ['postcover_id', 'created_at', 'modified_at']


# ========== ADMIN CSV UPLOADS ==========


class AdminCsvUploadListSerializer(serializers.ModelSerializer):
    """List view: id, name, file_name, uploaded_at, row_count (no full data). Uses model.row_count."""
    uploaded_by_username = serializers.SerializerMethodField()

    class Meta:
        model = AdminCsvUpload
        fields = ['id', 'name', 'file_name', 'uploaded_at', 'uploaded_by_username', 'row_count']

    def get_uploaded_by_username(self, obj):
        return obj.uploaded_by.username if obj.uploaded_by else None


class AdminCsvUploadSerializer(serializers.ModelSerializer):
    """Detail view: full data for display in admin."""
    uploaded_by_username = serializers.SerializerMethodField()

    class Meta:
        model = AdminCsvUpload
        fields = ['id', 'name', 'file_name', 'uploaded_at', 'uploaded_by_username', 'data']

    def get_uploaded_by_username(self, obj):
        return obj.uploaded_by.username if obj.uploaded_by else None


# ========== CONTRIBUTION SERIALIZERS ==========


class ContributionListSerializer(serializers.ModelSerializer):
    """List view for contributions (moderation queue)."""
    contributor_username = serializers.CharField(source="contributor.username", read_only=True)
    reviewer_username = serializers.CharField(source="reviewer.username", read_only=True, allow_null=True)
    postmark_id = serializers.SerializerMethodField()
    state_display = serializers.SerializerMethodField()
    town_display = serializers.SerializerMethodField()

    class Meta:
        model = Contribution
        fields = [
            "id",
            "contributor",
            "contributor_username",
            "postmark",
            "postmark_id",
            "status",
            "reviewer",
            "reviewer_username",
            "review_notes",
            "created_at",
            "updated_at",
            "state_display",
            "town_display",
        ]

    def get_postmark_id(self, obj):
        return obj.postmark_id if obj.postmark_id else None

    def get_state_display(self, obj):
        sd = obj.submitted_data or {}
        return sd.get("state", "-")

    def get_town_display(self, obj):
        sd = obj.submitted_data or {}
        return sd.get("town", "-")


class ContributionDetailSerializer(serializers.ModelSerializer):
    """Detail view for a single contribution."""
    contributor_username = serializers.CharField(source="contributor.username", read_only=True)
    reviewer_username = serializers.CharField(source="reviewer.username", read_only=True, allow_null=True)

    class Meta:
        model = Contribution
        fields = [
            "id",
            "contributor",
            "contributor_username",
            "postmark",
            "submitted_data",
            "status",
            "reviewer",
            "reviewer_username",
            "review_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "contributor", "postmark", "created_at"]


class ContributionApproveRejectSerializer(serializers.Serializer):
    """Payload for approve/reject actions."""
    review_notes = serializers.CharField(required=False, allow_blank=True)

###################################################################################################
