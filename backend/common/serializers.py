###################################################################################################
## WoCo Commons - Model Serialization
## MPC: 2025/11/15
###################################################################################################
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from .models import (
    PostalFacility, PostalFacilityIdentity,
    AdministrativeUnit, AdministrativeUnitIdentity, AdministrativeUnitResponsibility,
    JurisdictionalAffiliation,
    PostmarkShape, LetteringStyle, FramingStyle, Color, DateFormat,
    Postmark, PostmarkColor, PostmarkDatesSeen, PostmarkSize,
    PostmarkValuation, PostmarkPublication, PostmarkPublicationReference,
    PostmarkImage, Postcover, PostcoverPostmark, PostcoverImage,
    AdminCsvUpload,
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


# ========== GEOGRAPHIC HIERARCHY SERIALIZERS ==========

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
        read_only_fields = ['administrative_unit_identity_id', 'created_date']
    
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
        read_only_fields = ['administrative_unit_responsibility_id', 'created_date', 'modified_date']
    
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
        read_only_fields = ['administrative_unit_id', 'created_date', 'modified_date']
    
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
        read_only_fields = ['postal_facility_identity_id', 'created_date', 'modified_date']
    
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
        read_only_fields = ['jurisdictional_affiliation_id', 'created_date', 'modified_date']
    
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
        read_only_fields = ['postal_facility_id', 'created_date', 'modified_date']
    
    def get_current_identity(self, obj):
        identity = obj.get_current_identity()
        return PostalFacilityIdentitySerializer(identity).data if identity else None


# ========== PHYSICAL CHARACTERISTICS SERIALIZERS ==========

class PostmarkShapeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostmarkShape
        fields = '__all__'
        read_only_fields = ['postmark_shape_id', 'created_date', 'modified_date']


class LetteringStyleSerializer(serializers.ModelSerializer):
    class Meta:
        model = LetteringStyle
        fields = '__all__'
        read_only_fields = ['lettering_style_id', 'created_date', 'modified_date']


class FramingStyleSerializer(serializers.ModelSerializer):
    class Meta:
        model = FramingStyle
        fields = '__all__'
        read_only_fields = ['framing_style_id', 'created_date', 'modified_date']


class ColorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Color
        fields = '__all__'
        read_only_fields = ['color_id', 'created_date', 'modified_date']


class DateFormatSerializer(serializers.ModelSerializer):
    class Meta:
        model = DateFormat
        fields = '__all__'
        read_only_fields = ['date_format_id', 'created_date', 'modified_date']


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
        fields = ['postmark_color_id', 'color_id', 'color_name', 'created_date']
        read_only_fields = ['postmark_color_id', 'created_date']


class PostmarkDatesSeenSerializer(serializers.ModelSerializer):
    """Date ranges when postmarks were observed"""
    class Meta:
        model = PostmarkDatesSeen
        fields = ['postmark_dates_seen_id', 'earliest_date_seen', 'latest_date_seen', 'created_date']
        read_only_fields = ['postmark_dates_seen_id', 'created_date']


class PostmarkSizeSerializer(serializers.ModelSerializer):
    """Postmark size observations"""
    class Meta:
        model = PostmarkSize
        fields = ['postmark_size_id', 'width', 'height', 'size_notes', 'created_date']
        read_only_fields = ['postmark_size_id', 'created_date']


class PostmarkValuationSerializer(serializers.ModelSerializer):
    """Postmark valuations"""
    valued_by = UserSerializer(source='valued_by_user', read_only=True)
    
    class Meta:
        model = PostmarkValuation
        fields = ['postmark_valuation_id', 'valued_by', 'estimated_value', 
                  'valuation_date', 'created_date']
        read_only_fields = ['postmark_valuation_id', 'created_date', 'modified_date']


class PostmarkImageSerializer(serializers.ModelSerializer):
    """Postmark images"""
    image_url = serializers.SerializerMethodField()
    
    class Meta:
        model = PostmarkImage
        fields = ['postmark_image_id', 'original_filename', 'storage_filename',
                  'image_url', 'mime_type', 'image_width', 'image_height',
                  'file_size_bytes', 'image_view', 'image_description',
                  'display_order', 'uploaded_by', 'created_date']
        read_only_fields = ['postmark_image_id', 'file_checksum', 'created_date', 'modified_date']
    
    def get_image_url(self, obj):
        """Generate image URL if using media files"""
        if obj.storage_filename:
            request = self.context.get('request')
            if request:
                from django.conf import settings
                return request.build_absolute_uri(
                    f"{settings.MEDIA_URL}postmarks/{obj.storage_filename}"
                )
        return None


class PostmarkListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for postmark lists (search/catalog)"""
    facility_name = serializers.SerializerMethodField()
    shape_name = serializers.SerializerMethodField()
    main_image = serializers.SerializerMethodField()
    responsible_groups = serializers.SerializerMethodField()
    state = serializers.SerializerMethodField()
    town = serializers.SerializerMethodField()
    date_range = serializers.SerializerMethodField()
    colors_display = serializers.SerializerMethodField()
    valuation_display = serializers.SerializerMethodField()

    class Meta:
        model = Postmark
        fields = ['postmark_id', 'postmark_key', 'facility_name', 'shape_name',
                  'rate_location', 'rate_value', 'is_manuscript', 'main_image',
                  'responsible_groups', 'state', 'town', 'date_range',
                  'colors_display', 'valuation_display']

    def get_facility_name(self, obj):
        if obj.postal_facility_identity_id:
            return getattr(obj.postal_facility_identity, 'facility_name', None) or ''
        return ''

    def get_shape_name(self, obj):
        if obj.postmark_shape_id:
            return getattr(obj.postmark_shape, 'shape_name', None) or ''
        return ''

    def get_main_image(self, obj):
        """Get main image (display_order=0)"""
        main_img = obj.images.filter(display_order=0).first()
        if main_img:
            return PostmarkImageSerializer(main_img, context=self.context).data
        return None

    def get_responsible_groups(self, obj):
        """Get groups responsible for this postmark"""
        groups = obj.get_responsible_groups()
        return [{'id': g.id, 'name': g.name} for g in groups]

    def get_state(self, obj):
        """State from current jurisdictional affiliation (administrative unit name)."""
        if not obj.postal_facility_identity_id:
            return None
        aff = obj.postal_facility_identity.jurisdictions.filter(
            effective_to_date__isnull=True
        ).select_related('administrative_unit').first()
        if not aff or not aff.administrative_unit:
            return None
        identity = aff.administrative_unit.get_current_identity()
        return identity.unit_name if identity else None

    def get_town(self, obj):
        """Town: facility name from identity."""
        if obj.postal_facility_identity_id:
            return getattr(obj.postal_facility_identity, 'facility_name', None) or ''
        return ''

    def get_date_range(self, obj):
        """Earliest–latest date seen as string (e.g. '1850-1860')."""
        if not obj.dates_seen.exists():
            return None
        earliest = obj.dates_seen.order_by('earliest_date_seen').first()
        latest = obj.dates_seen.order_by('-latest_date_seen').first()
        if not earliest:
            return None
        e_str = str(earliest.earliest_date_seen.year) if earliest.earliest_date_seen else ''
        l_str = str(latest.latest_date_seen.year) if latest and latest.latest_date_seen else e_str
        if e_str == l_str:
            return e_str
        return f"{e_str}-{l_str}" if e_str and l_str else e_str or l_str

    def get_colors_display(self, obj):
        """Comma-separated color names for this postmark."""
        names = [
            pc.color.color_name
            for pc in obj.postmark_colors.select_related('color').all()
            if getattr(pc, 'color', None)
        ]
        return ', '.join(names) if names else None

    def get_valuation_display(self, obj):
        """Latest valuation as string (e.g. Common, or numeric)."""
        val = obj.valuations.order_by('-valuation_date').first()
        if not val:
            return None
        return str(val.estimated_value)


class PostmarkSerializer(serializers.ModelSerializer):
    """Full postmark serializer with all nested data"""
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
        write_only=True
    )
    
    # Nested related data
    colors = PostmarkColorSerializer(source='postmark_colors', many=True, read_only=True)
    dates_seen = PostmarkDatesSeenSerializer(many=True, read_only=True)
    sizes = PostmarkSizeSerializer(many=True, read_only=True)
    valuations = PostmarkValuationSerializer(many=True, read_only=True)
    images = PostmarkImageSerializer(many=True, read_only=True)
    responsible_groups = serializers.SerializerMethodField()
    state = serializers.SerializerMethodField()
    town = serializers.SerializerMethodField()
    date_range = serializers.SerializerMethodField()
    colors_display = serializers.SerializerMethodField()
    valuation_display = serializers.SerializerMethodField()
    
    created_by = UserSerializer(read_only=True)
    modified_by = UserSerializer(read_only=True)
    
    class Meta:
        model = Postmark
        fields = '__all__'
        read_only_fields = ['postmark_id', 'created_date', 'modified_date']
    
    def get_state(self, obj):
        if not obj.postal_facility_identity_id:
            return None
        aff = obj.postal_facility_identity.jurisdictions.filter(
            effective_to_date__isnull=True
        ).select_related('administrative_unit').first()
        if not aff or not aff.administrative_unit:
            return None
        identity = aff.administrative_unit.get_current_identity()
        return identity.unit_name if identity else None

    def get_town(self, obj):
        if obj.postal_facility_identity_id:
            return getattr(obj.postal_facility_identity, 'facility_name', None) or ''
        return ''

    def get_date_range(self, obj):
        if not obj.dates_seen.exists():
            return None
        earliest = obj.dates_seen.order_by('earliest_date_seen').first()
        latest = obj.dates_seen.order_by('-latest_date_seen').first()
        if not earliest:
            return None
        e_str = str(earliest.earliest_date_seen.year) if earliest.earliest_date_seen else ''
        l_str = str(latest.latest_date_seen.year) if latest and latest.latest_date_seen else e_str
        if e_str == l_str:
            return e_str
        return f"{e_str}-{l_str}" if e_str and l_str else e_str or l_str

    def get_colors_display(self, obj):
        names = [
            pc.color.color_name
            for pc in obj.postmark_colors.select_related('color').all()
            if getattr(pc, 'color', None)
        ]
        return ', '.join(names) if names else None

    def get_valuation_display(self, obj):
        val = obj.valuations.order_by('-valuation_date').first()
        if not val:
            return None
        return str(val.estimated_value)

    def get_responsible_groups(self, obj):
        """Get groups responsible for this postmark"""
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
        read_only_fields = ['postmark_publication_id', 'created_date', 'modified_date']


class PostmarkPublicationReferenceSerializer(serializers.ModelSerializer):
    """Publication references"""
    publication_title = serializers.CharField(
        source='postmark_publication.publication_title',
        read_only=True
    )
    
    class Meta:
        model = PostmarkPublicationReference
        fields = ['postmark_publication_reference_id', 'postmark_publication',
                  'publication_title', 'published_id', 'reference_location', 'created_date']
        read_only_fields = ['postmark_publication_reference_id', 'created_date']


# ========== POSTCOVER SERIALIZERS ==========

class PostcoverPostmarkSerializer(serializers.ModelSerializer):
    """Postmark on a postcover"""
    postmark_key = serializers.CharField(source='postmark.postmark_key', read_only=True)
    postmark_details = PostmarkListSerializer(source='postmark', read_only=True)
    
    class Meta:
        model = PostcoverPostmark
        fields = ['postcover_postmark_id', 'postmark', 'postmark_key', 
                  'postmark_details', 'position_order', 'postmark_location', 'created_date']
        read_only_fields = ['postcover_postmark_id', 'created_date']


class PostcoverImageSerializer(serializers.ModelSerializer):
    """Postcover images"""
    image_url = serializers.SerializerMethodField()
    
    class Meta:
        model = PostcoverImage
        fields = ['postcover_image_id', 'original_filename', 'storage_filename',
                  'image_url', 'mime_type', 'image_width', 'image_height',
                  'file_size_bytes', 'image_view', 'image_description',
                  'display_order', 'created_date']
        read_only_fields = ['postcover_image_id', 'file_checksum', 'created_date', 'modified_date']
    
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
                  'postmark_count', 'created_date']
    
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
        read_only_fields = ['postcover_id', 'created_date', 'modified_date']


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

###################################################################################################
