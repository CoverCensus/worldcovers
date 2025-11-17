###################################################################################################
## WoCo Project - Model Serialization
## MPC: 2025/11/15
###################################################################################################
from rest_framework import serializers

from django.contrib.auth import get_user_model

from .models import (
    GeographicLocation, AdministrativeUnit, GeographicAffiliation,
    AdministrativeUnitNameHistory, AdministrativeUnitHistory,
    PostmarkShape, LetteringStyle, FramingStyle, Color, DateFormat,
    Postmark, PostmarkColor, PostmarkDatesSeen, PostmarkSize,
    PostmarkValuation, PostmarkPublication, PostmarkPublicationReference,
    PostmarkImage, Postcover, PostcoverPostmark, PostcoverImage
)

User = get_user_model()


# ========== USER SERIALIZER ==========

class UserSerializer(serializers.ModelSerializer):
    """Basic user serializer for nested representations"""
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']
        read_only_fields = ['id']


# ========== GEOGRAPHIC HIERARCHY SERIALIZERS ==========

class AdministrativeUnitListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for lists"""
    class Meta:
        model = AdministrativeUnit
        fields = ['administrative_unit_id', 'unit_name', 'unit_abbreviation', 
                  'unit_type', 'hierarchy_level', 'is_active']


class AdministrativeUnitSerializer(serializers.ModelSerializer):
    """Full serializer with nested parent"""
    parent_administrative_unit = AdministrativeUnitListSerializer(read_only=True)
    parent_administrative_unit_id = serializers.PrimaryKeyRelatedField(
        queryset=AdministrativeUnit.objects.all(),
        source='parent_administrative_unit',
        write_only=True,
        required=False,
        allow_null=True
    )
    created_by = UserSerializer(read_only=True)
    modified_by = UserSerializer(read_only=True)
    
    class Meta:
        model = AdministrativeUnit
        fields = '__all__'
        read_only_fields = ['administrative_unit_id', 'created_date', 'modified_date']


class GeographicLocationListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for lists"""
    class Meta:
        model = GeographicLocation
        fields = ['geographic_location_id', 'location_name', 'location_type', 
                  'latitude', 'longitude']


class GeographicLocationSerializer(serializers.ModelSerializer):
    """Full serializer with nested data"""
    created_by = UserSerializer(read_only=True)
    modified_by = UserSerializer(read_only=True)
    current_affiliations = serializers.SerializerMethodField()
    
    class Meta:
        model = GeographicLocation
        fields = '__all__'
        read_only_fields = ['geographic_location_id', 'created_date', 'modified_date']
    
    def get_current_affiliations(self, obj):
        """Get current geographic affiliations (where effective_to_date is NULL)"""
        from datetime import date
        affiliations = obj.affiliations.filter(
            effective_to_date__isnull=True
        ) | obj.affiliations.filter(
            effective_to_date__gte=date.today()
        )
        return GeographicAffiliationListSerializer(affiliations, many=True).data


class GeographicAffiliationListSerializer(serializers.ModelSerializer):
    """Lightweight serializer"""
    geographic_location_name = serializers.CharField(
        source='geographic_location.location_name', 
        read_only=True
    )
    administrative_unit_name = serializers.CharField(
        source='administrative_unit.unit_name', 
        read_only=True
    )
    
    class Meta:
        model = GeographicAffiliation
        fields = ['geographic_affiliation_id', 'geographic_location_name', 
                  'administrative_unit_name', 'effective_from_date', 'effective_to_date']


class GeographicAffiliationSerializer(serializers.ModelSerializer):
    """Full serializer"""
    geographic_location = GeographicLocationListSerializer(read_only=True)
    administrative_unit = AdministrativeUnitListSerializer(read_only=True)
    geographic_location_id = serializers.PrimaryKeyRelatedField(
        queryset=GeographicLocation.objects.all(),
        source='geographic_location',
        write_only=True
    )
    administrative_unit_id = serializers.PrimaryKeyRelatedField(
        queryset=AdministrativeUnit.objects.all(),
        source='administrative_unit',
        write_only=True
    )
    created_by = UserSerializer(read_only=True)
    modified_by = UserSerializer(read_only=True)
    
    class Meta:
        model = GeographicAffiliation
        fields = '__all__'
        read_only_fields = ['geographic_affiliation_id', 'created_date', 'modified_date']


class AdministrativeUnitNameHistorySerializer(serializers.ModelSerializer):
    """Administrative unit name history"""
    administrative_unit = AdministrativeUnitListSerializer(read_only=True)
    administrative_unit_id = serializers.PrimaryKeyRelatedField(
        queryset=AdministrativeUnit.objects.all(),
        source='administrative_unit',
        write_only=True
    )
    created_by = UserSerializer(read_only=True)
    
    class Meta:
        model = AdministrativeUnitNameHistory
        fields = '__all__'
        read_only_fields = ['administrative_unit_name_history_id', 'created_date']


class AdministrativeUnitHistorySerializer(serializers.ModelSerializer):
    """Administrative unit version history"""
    administrative_unit = AdministrativeUnitListSerializer(read_only=True)
    administrative_unit_id = serializers.PrimaryKeyRelatedField(
        queryset=AdministrativeUnit.objects.all(),
        source='administrative_unit',
        write_only=True
    )
    created_by = UserSerializer(read_only=True)
    
    class Meta:
        model = AdministrativeUnitHistory
        fields = '__all__'
        read_only_fields = ['administrative_unit_history_id', 'created_date']


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
                  'display_order', 'image_status', 'submitter_name',
                  'submitter_email', 'created_date']
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
    """Lightweight serializer for postmark lists"""
    location_name = serializers.CharField(source='geographic_location.location_name', read_only=True)
    shape_name = serializers.CharField(source='postmark_shape.shape_name', read_only=True)
    main_image = serializers.SerializerMethodField()
    condition_display = serializers.CharField(source='get_condition_display', read_only=True)
    
    class Meta:
        model = Postmark
        fields = ['postmark_id', 'postmark_key', 'location_name', 'shape_name',
                  'rate_location', 'rate_value', 'condition', 'condition_display', 
                  'is_manuscript', 'main_image']
    
    def get_main_image(self, obj):
        """Get main image (display_order=0)"""
        main_img = obj.images.filter(display_order=0, image_status='APPROVED').first()
        if main_img:
            return PostmarkImageSerializer(main_img, context=self.context).data
        return None


class PostmarkSerializer(serializers.ModelSerializer):
    """Full postmark serializer with all nested data"""
    geographic_location = GeographicLocationListSerializer(read_only=True)
    postmark_shape = PostmarkShapeSerializer(read_only=True)
    lettering_style = LetteringStyleSerializer(read_only=True)
    framing_style = FramingStyleSerializer(read_only=True)
    date_format = DateFormatSerializer(read_only=True)
    
    # Write-only foreign key IDs
    geographic_location_id = serializers.PrimaryKeyRelatedField(
        queryset=GeographicLocation.objects.all(),
        source='geographic_location',
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
    
    created_by = UserSerializer(read_only=True)
    modified_by = UserSerializer(read_only=True)
    
    class Meta:
        model = Postmark
        fields = '__all__'
        read_only_fields = ['postmark_id', 'created_date', 'modified_date']


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
    condition_display = serializers.CharField(source='get_condition_display', read_only=True)
    
    class Meta:
        model = Postcover
        fields = ['postcover_id', 'postcover_key', 'owner_username', 
                  'condition', 'condition_display', 'postmark_count', 'created_date']
    
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

###################################################################################################
