###################################################################################################
## WoCo Commons - Model Serialization
## MPC: 2025/11/15
###################################################################################################
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from common.models import (
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
    AdminCsvUpload,
    Contribution,
    FAQEntry,
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
    """Public FAQ entry serializer for the SPA."""

    class Meta:
        model = FAQEntry
        fields = ["faq_entry_id", "question", "answer", "is_active", "display_order"]
        read_only_fields = ["faq_entry_id", "is_active", "display_order"]


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


class ColorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Color
        fields = '__all__'
        read_only_fields = ['color_id', 'created_date', 'modified_date']


# ========== POSTMARK SERIALIZERS ==========

class PostmarkValuationSerializer(serializers.ModelSerializer):
    """Postmark valuations"""

    class Meta:
        model = PostmarkValuation
        fields = ['postmark_valuation_id', 'postmark', 'appraisal_pos', 'amt', 'appraisal_date']
        read_only_fields = ['postmark_valuation_id']


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
    facility_name = serializers.SerializerMethodField()
    shape_name = serializers.SerializerMethodField()
    main_image = serializers.SerializerMethodField()
    responsible_groups = serializers.SerializerMethodField()
    state = serializers.SerializerMethodField()
    town = serializers.SerializerMethodField()
    date_range = serializers.SerializerMethodField()
    colors_display = serializers.SerializerMethodField()
    color = serializers.SerializerMethodField()
    valuation_display = serializers.SerializerMethodField()
    size_display = serializers.SerializerMethodField()

    class Meta:
        model = Postmark
        fields = [
            'postmark_id',
            'code',
            'facility_name',
            'shape_name',
            'is_manuscript',
            'main_image',
            'responsible_groups',
            'state',
            'town',
            'date_range',
            'size_display',
            'color',
            'colors_display',
            'valuation_display',
            'created_date',
        ]

    def get_facility_name(self, obj):
        return ''

    def get_shape_name(self, obj):
        return getattr(obj.shape, 'name', '') if obj.shape_id else ''

    def get_main_image(self, obj):
        """Get main image (display_order=0)"""
        main_img = obj.images.filter(display_order=0).first()
        if main_img:
            return PostmarkImageSerializer(main_img, context=self.context).data
        return None

    def get_responsible_groups(self, obj):
        from common.api.v2.views import _get_postmark_responsible_groups
        groups = _get_postmark_responsible_groups(obj)
        return [{'id': g.id, 'name': g.name} for g in groups]

    def get_state(self, obj):
        try:
            region = obj.post_office.region if obj.post_office_id else None
            if not region:
                return None
            unit = region.administrative_unit if hasattr(region, 'administrative_unit') else None
            if unit:
                identity = unit.get_current_identity()
                return identity.unit_name if identity else unit.reference_code
        except Exception:
            pass
        return None

    def get_town(self, obj):
        return obj.post_office.name if obj.post_office_id else ''

    def get_size_display(self, obj):
        if obj.width and obj.height:
            return f"{obj.width}×{obj.height}"
        if obj.width:
            return str(obj.width)
        if obj.height:
            return str(obj.height)
        return None

    def get_date_range(self, obj):
        dates = obj.dates_observed.order_by('date')
        if not dates.exists():
            return None
        first_date = dates.first().date
        last_date = dates.last().date
        if first_date == last_date:
            return str(first_date.year)
        if first_date.year == last_date.year:
            return str(first_date.year)
        return f"{first_date.year}-{last_date.year}"

    def get_colors_display(self, obj):
        return obj.color.name if obj.color_id else None

    def get_color(self, obj):
        if not obj.color_id:
            return None
        return {'id': obj.color_id, 'name': obj.color.name}

    def get_valuation_display(self, obj):
        val = obj.valuations.order_by('-appraisal_date').first()
        if not val:
            return None
        return str(val.amt)


class PostmarkSerializer(serializers.ModelSerializer):
    """Full postmark serializer (v1 compat layer over new Postmark model)"""
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
        fields = [
            'postmark_id', 'code', 'catalog_txt', 'inscription_txt',
            'post_office', 'shape', 'lettering', 'color',
            'is_manuscript', 'impression', 'is_irreg',
            'width', 'height', 'date_type', 'date_fmt',
            'valuations', 'images',
            'responsible_groups', 'state', 'town', 'date_range',
            'colors_display', 'valuation_display',
            'created_by', 'modified_by', 'created_date', 'modified_date',
        ]
        read_only_fields = ['postmark_id', 'created_date', 'modified_date']

    def get_responsible_groups(self, obj):
        from common.api.v2.views import _get_postmark_responsible_groups
        groups = _get_postmark_responsible_groups(obj)
        return [{'id': g.id, 'name': g.name} for g in groups]

    def get_state(self, obj):
        try:
            region = obj.post_office.region if obj.post_office_id else None
            if not region:
                return None
            unit = region.administrative_unit if hasattr(region, 'administrative_unit') else None
            if unit:
                identity = unit.get_current_identity()
                return identity.unit_name if identity else unit.reference_code
        except Exception:
            pass
        return None

    def get_town(self, obj):
        return obj.post_office.name if obj.post_office_id else ''

    def get_date_range(self, obj):
        dates = obj.dates_observed.order_by('date')
        if not dates.exists():
            return None
        first_date = dates.first().date
        last_date = dates.last().date
        if first_date.year == last_date.year:
            return str(first_date.year)
        return f"{first_date.year}-{last_date.year}"

    def get_colors_display(self, obj):
        return obj.color.name if obj.color_id else None

    def get_valuation_display(self, obj):
        val = obj.valuations.order_by('-appraisal_date').first()
        return str(val.amt) if val else None


# ========== PUBLICATION SERIALIZERS ==========

# ========== POSTCOVER SERIALIZERS ==========

class PostcoverPostmarkSerializer(serializers.ModelSerializer):
    """Postmark on a postcover"""
    postmark_key = serializers.CharField(source='postmark.code', read_only=True)
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


# ========== CONTRIBUTION SERIALIZERS ==========


class ContributionListSerializer(serializers.ModelSerializer):
    """List view for contributions (moderation queue)."""
    contributor_username = serializers.CharField(source="contributor.username", read_only=True)
    reviewer_username = serializers.CharField(source="reviewer.username", read_only=True, allow_null=True)
    postmark_id = serializers.SerializerMethodField()
    is_suggestion = serializers.SerializerMethodField()
    state_display = serializers.SerializerMethodField()
    town_display = serializers.SerializerMethodField()
    type_display = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = Contribution
        fields = [
            "id",
            "contributor",
            "contributor_username",
            "postmark",
            "postmark_id",
            "is_suggestion",
            "status",
            "reviewer",
            "reviewer_username",
            "review_notes",
            "created_at",
            "updated_at",
            "state_display",
            "town_display",
            "type_display",
            "display_name",
        ]

    def get_postmark_id(self, obj):
        return obj.postmark_id if obj.postmark_id else None

    def get_is_suggestion(self, obj):
        """True if this is a suggested edit to an existing catalog entry (not a new submission)."""
        if obj.postmark_id is not None:
            return True
        sd = obj.submitted_data or {}
        orig = sd.get("original_postmark_id")
        return orig is not None and str(orig).strip() != ""

    def get_state_display(self, obj):
        sd = obj.submitted_data or {}
        return sd.get("state", "")

    def get_town_display(self, obj):
        sd = obj.submitted_data or {}
        return sd.get("town", "")

    def get_type_display(self, obj):
        sd = obj.submitted_data or {}
        return sd.get("type", "")

    def get_display_name(self, obj):
        """Postmaker-style title: "Town, State — Type" or "Submission #id" if missing."""
        sd = obj.submitted_data or {}
        town = (sd.get("town") or "").strip()
        state = (sd.get("state") or "").strip()
        type_val = (sd.get("type") or "").strip()
        title = ", ".join(x for x in [town, state] if x)
        if not title:
            return f"Submission #{obj.id}"
        if type_val and type_val.lower() != "unknown":
            return f"{title} — {type_val}"
        return title


class ContributionDetailSerializer(serializers.ModelSerializer):
    """Detail view for a single contribution."""
    contributor_username = serializers.CharField(source="contributor.username", read_only=True)
    reviewer_username = serializers.CharField(source="reviewer.username", read_only=True, allow_null=True)
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = Contribution
        fields = [
            "id",
            "contributor",
            "contributor_username",
            "postmark",
            "submitted_data",
            "display_name",
            "status",
            "reviewer",
            "reviewer_username",
            "review_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "contributor", "postmark", "created_at"]

    def get_display_name(self, obj):
        """Postmaker-style title: "Town, State — Type" or "Submission #id" if missing."""
        sd = obj.submitted_data or {}
        town = (sd.get("town") or "").strip()
        state = (sd.get("state") or "").strip()
        type_val = (sd.get("type") or "").strip()
        title = ", ".join(x for x in [town, state] if x)
        if not title:
            return f"Submission #{obj.id}"
        if type_val and type_val.lower() != "unknown":
            return f"{title} — {type_val}"
        return title


class ContributionApproveRejectSerializer(serializers.Serializer):
    """Payload for approve/reject/request_revision. Comment optional. For approve, editor may send value; lettering/framing/date_format come from contribution's submitted_data if not sent."""
    review_notes = serializers.CharField(required=False, allow_blank=True)
    # When approving: editor must set value; shape optional; lettering/framing/date_format optional (taken from submitted_data)
    postmark_shape_id = serializers.IntegerField(required=False, allow_null=True)
    lettering_style_id = serializers.IntegerField(required=False, allow_null=True)
    framing_style_id = serializers.IntegerField(required=False, allow_null=True)
    date_format_id = serializers.IntegerField(required=False, allow_null=True)
    estimated_value = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True
    )

###################################################################################################
