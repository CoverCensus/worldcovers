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
    Color,
    Postmark, PostmarkValuation,
    PostmarkImage, Postcover, PostcoverPostmark, PostcoverImage,
    AdminCsvUpload, Collection, CollectionAssignment, Contribution, FAQEntry,
)

User = get_user_model()


def _format_date_by_granularity(date, granularity):
    """Render an observed date per its granularity: YEAR→YYYY, MONTH→YYYY-MM, DAY→YYYY-MM-DD."""
    if not date:
        return None
    iso = date.isoformat()
    if granularity == 'YEAR':
        return iso[:4]
    if granularity == 'MONTH':
        return iso[:7]
    return iso[:10]


def _granularity_for_date(obj, target_date):
    """Look up the granularity of the DateObserved row matching target_date (uses prefetch cache)."""
    if not target_date:
        return 'DAY'
    for row in obj.dates_observed.all():
        if row.date == target_date:
            return row.granularity
    return 'DAY'


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
        read_only_fields = ["id", "created_date", "modified_date"]


class PostOfficeSerializer(serializers.ModelSerializer):
    """Serializer for v2 PostOffice model."""
    region_name = serializers.CharField(source="region.name", read_only=True)

    class Meta:
        model = PostOffice
        fields = "__all__"
        read_only_fields = ["id", "created_date", "modified_date"]


class LetteringSerializer(serializers.ModelSerializer):
    """Serializer for v2 Lettering model."""

    class Meta:
        model = Lettering
        fields = "__all__"
        read_only_fields = ["id", "created_date", "modified_date"]


class FramingSerializer(serializers.ModelSerializer):
    """Serializer for v2 Framing model."""

    class Meta:
        model = Framing
        fields = "__all__"
        read_only_fields = ["id", "created_date", "modified_date"]


class ShapeSerializer(serializers.ModelSerializer):
    """Serializer for v2 Shape model."""

    class Meta:
        model = Shape
        fields = "__all__"
        read_only_fields = ["id", "created_date", "modified_date"]


class CoverSerializer(serializers.ModelSerializer):
    """Serializer for v2 Cover model."""
    color_name = serializers.CharField(source="color.name", read_only=True)

    class Meta:
        model = Cover
        fields = "__all__"
        read_only_fields = ["id", "created_date", "modified_date"]


class DateObservedSerializer(serializers.ModelSerializer):
    """Serializer for v2 DateObserved model."""

    class Meta:
        model = DateObserved
        fields = "__all__"
        read_only_fields = ["id", "created_date", "modified_date"]


class RatemarkSerializer(serializers.ModelSerializer):
    """Serializer for v2 Ratemark model."""
    shape_name = serializers.CharField(source='shape.name', read_only=True)
    lettering_name = serializers.CharField(source='lettering.name', read_only=True)
    color_name = serializers.CharField(source='color.name', read_only=True)

    class Meta:
        model = Ratemark
        fields = "__all__"
        read_only_fields = ["id", "created_date", "modified_date"]


class AuxmarkSerializer(serializers.ModelSerializer):
    """Serializer for v2 Auxmark model."""
    shape_name = serializers.CharField(source='shape.name', read_only=True)
    lettering_name = serializers.CharField(source='lettering.name', read_only=True)
    color_name = serializers.CharField(source='color.name', read_only=True)

    class Meta:
        model = Auxmark
        fields = "__all__"
        read_only_fields = ["id", "created_date", "modified_date"]


class CoverPostmarkSerializer(serializers.ModelSerializer):
    """Serializer for v2 CoverPostmark model."""
    cover_details = CoverSerializer(source='cover', read_only=True)

    class Meta:
        model = CoverPostmark
        fields = "__all__"
        read_only_fields = ["id", "created_date", "modified_date"]


class PostmarkRatemarkSerializer(serializers.ModelSerializer):
    """Serializer for v2 PostmarkRatemark model."""
    ratemark_details = RatemarkSerializer(source='ratemark', read_only=True)
    auxmark_count = serializers.SerializerMethodField()

    class Meta:
        model = PostmarkRatemark
        fields = "__all__"
        read_only_fields = ["id", "created_date", "modified_date"]

    def get_auxmark_count(self, obj):
        annotated = getattr(obj, 'auxmark_count', None)
        if annotated is not None:
            return annotated
        return Auxmark.objects.filter(
            parent_mark_type='RATEMARK', parent_mark_id=obj.ratemark_id
        ).count()


class MarkFramingSerializer(serializers.ModelSerializer):
    """Serializer for v2 MarkFraming model."""

    class Meta:
        model = MarkFraming
        fields = "__all__"
        read_only_fields = ["id", "created_date", "modified_date"]


class ReferenceWorkSerializer(serializers.ModelSerializer):
    """Serializer for v2 ReferenceWork model."""

    class Meta:
        model = ReferenceWork
        fields = "__all__"
        read_only_fields = ["id", "created_date", "modified_date"]


class CitationSerializer(serializers.ModelSerializer):
    """Serializer for v2 Citation model."""

    class Meta:
        model = Citation
        fields = "__all__"
        read_only_fields = ["id", "created_date", "modified_date"]


# ========== PHYSICAL CHARACTERISTICS SERIALIZERS ==========

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
        fields = [
            'postmark_valuation_id',
            'appraisal_pos',
            'amt',
            'appraisal_date',
            'created_date',
        ]
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
    id = serializers.IntegerField(source='postmark_id', read_only=True)
    facility_name = serializers.SerializerMethodField()
    shape_name = serializers.SerializerMethodField()
    main_image = serializers.SerializerMethodField()
    second_image = serializers.SerializerMethodField()
    state = serializers.SerializerMethodField()
    state_abbrev = serializers.SerializerMethodField()
    town = serializers.SerializerMethodField()
    colors_display = serializers.SerializerMethodField()
    valuation_display = serializers.SerializerMethodField()
    size_display = serializers.SerializerMethodField()
    lettering_style_name = serializers.SerializerMethodField()
    framing = serializers.SerializerMethodField()
    earliest_use = serializers.SerializerMethodField()
    latest_use = serializers.SerializerMethodField()
    ratemark_count = serializers.IntegerField(read_only=True)
    auxmark_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Postmark
        fields = [
            'id',
            'postmark_id',
            'code',
            'catalog_txt',
            'inscription_txt',
            'facility_name',
            'shape_name',
            'is_manuscript',
            'impression',
            'width',
            'height',
            'date_type',
            'date_fmt',
            'main_image',
            'second_image',
            'state',
            'state_abbrev',
            'town',
            'size_display',
            'colors_display',
            'valuation_display',
            'created_date',
            'lettering_style_name',
            'framing',
            'earliest_use',
            'latest_use',
            'ratemark_count',
            'auxmark_count',
        ]

    def get_facility_name(self, obj):
        return self.get_town(obj)

    def get_town(self, obj):
        po = getattr(obj, 'post_office', None)
        return po.name if po and po.name else ''

    def get_state(self, obj):
        po = getattr(obj, 'post_office', None)
        if po:
            region = getattr(po, 'region', None)
            if region and region.name:
                return region.name
        return ''

    def get_state_abbrev(self, obj):
        po = getattr(obj, 'post_office', None)
        if po:
            region = getattr(po, 'region', None)
            if region and region.abbrev:
                return region.abbrev
        return ''

    def get_shape_name(self, obj):
        shape = getattr(obj, 'shape', None)
        return shape.name if shape and shape.name else ''

    def get_lettering_style_name(self, obj):
        lettering = getattr(obj, 'lettering', None)
        return lettering.name if lettering and lettering.name else ''

    def get_framing(self, obj):
        framings = MarkFraming.objects.filter(
            parent_mark_type='POSTMARK',
            parent_mark_id=obj.pk,
        ).select_related('framing').order_by('framing_pos')
        names = [mf.framing.name for mf in framings if mf.framing]
        return ', '.join(names)

    def get_size_display(self, obj):
        fmt = lambda v: f"{float(v):g}" if v else None
        w, h = fmt(obj.width), fmt(obj.height)
        if w and h:
            return f"{w}×{h}"
        return w or h or None

    def get_colors_display(self, obj):
        color = getattr(obj, 'color', None)
        return color.name if color and color.name else ''

    def get_earliest_use(self, obj):
        d = getattr(obj, 'earliest_date_observed', None)
        return _format_date_by_granularity(d, _granularity_for_date(obj, d))

    def get_latest_use(self, obj):
        d = getattr(obj, 'latest_date_observed', None)
        return _format_date_by_granularity(d, _granularity_for_date(obj, d))

    def get_main_image(self, obj):
        main_img = obj.images.order_by('display_order').first()
        if main_img:
            return PostmarkImageSerializer(main_img, context=self.context).data
        return None

    def get_second_image(self, obj):
        imgs = list(obj.images.order_by('display_order')[:2])
        if len(imgs) < 2:
            return None
        return PostmarkImageSerializer(imgs[1], context=self.context).data

    def get_valuation_display(self, obj):
        val = obj.valuations.order_by('-appraisal_date').first()
        if not val:
            return None
        return str(val.amt)


class PostmarkSerializer(serializers.ModelSerializer):
    """Full postmark serializer with all nested data."""
    id = serializers.IntegerField(source='postmark_id', read_only=True)
    valuations = PostmarkValuationSerializer(many=True, read_only=True)
    images = PostmarkImageSerializer(many=True, read_only=True)
    state = serializers.SerializerMethodField()
    state_abbrev = serializers.SerializerMethodField()
    town = serializers.SerializerMethodField()
    shape_name = serializers.SerializerMethodField()
    lettering_style_name = serializers.SerializerMethodField()
    framing = serializers.SerializerMethodField()
    framings = serializers.SerializerMethodField()
    dates_observed = serializers.SerializerMethodField()
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
        read_only_fields = ['postmark_id', 'created_date', 'modified_date']

    def get_town(self, obj):
        po = getattr(obj, 'post_office', None)
        return po.name if po and po.name else ''

    def get_state(self, obj):
        po = getattr(obj, 'post_office', None)
        if po:
            region = getattr(po, 'region', None)
            if region and region.name:
                return region.name
        return ''

    def get_state_abbrev(self, obj):
        po = getattr(obj, 'post_office', None)
        if po:
            region = getattr(po, 'region', None)
            if region and region.abbrev:
                return region.abbrev
        return ''

    def get_shape_name(self, obj):
        shape = getattr(obj, 'shape', None)
        return shape.name if shape and shape.name else ''

    def get_lettering_style_name(self, obj):
        lettering = getattr(obj, 'lettering', None)
        return lettering.name if lettering and lettering.name else ''

    def get_framing(self, obj):
        framings = MarkFraming.objects.filter(
            parent_mark_type='POSTMARK',
            parent_mark_id=obj.pk,
        ).select_related('framing').order_by('framing_pos')
        names = [mf.framing.name for mf in framings if mf.framing]
        return ', '.join(names)

    def get_framings(self, obj):
        framings = MarkFraming.objects.filter(
            parent_mark_type='POSTMARK',
            parent_mark_id=obj.pk,
        ).select_related('framing').order_by('framing_pos')
        return [
            {'name': mf.framing.name, 'framing_pos': mf.framing_pos}
            for mf in framings
            if mf.framing
        ]

    def get_dates_observed(self, obj):
        return [
            {'date': d.date.isoformat(), 'granularity': d.granularity}
            for d in obj.dates_observed.order_by('date')
        ]

    def get_size_display(self, obj):
        fmt = lambda v: f"{float(v):g}" if v else None
        w, h = fmt(obj.width), fmt(obj.height)
        if w and h:
            return f"{w}×{h}"
        return w or h or None

    def get_colors_display(self, obj):
        color = getattr(obj, 'color', None)
        return color.name if color and color.name else ''

    def get_earliest_use(self, obj):
        d = getattr(obj, 'earliest_date_observed', None)
        return _format_date_by_granularity(d, _granularity_for_date(obj, d))

    def get_latest_use(self, obj):
        d = getattr(obj, 'latest_date_observed', None)
        return _format_date_by_granularity(d, _granularity_for_date(obj, d))

    def get_valuation_display(self, obj):
        val = obj.valuations.order_by('-appraisal_date').first()
        if not val:
            return None
        return str(val.amt)

# ========== POSTCOVER SERIALIZERS ==========

class PostcoverPostmarkSerializer(serializers.ModelSerializer):
    """Postmark on a postcover"""
    postmark_code = serializers.CharField(source='postmark.code', read_only=True)
    postmark_details = PostmarkListSerializer(source='postmark', read_only=True)

    class Meta:
        model = PostcoverPostmark
        fields = ['postcover_postmark_id', 'postmark', 'postmark_code',
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

_SUBMITTED_DATA_IMAGE_META_KEYS = {
    "postmark_image_metas",
    "ratemark_image_metas",
    "auxmark_image_metas",
    "image_metas",
    "image_meta",
}


def _meta_item_to_public_image_url(meta, request):
    """Build public image URL from submitted_data image meta."""
    if not isinstance(meta, dict):
        return None
    storage = (meta.get("storage_filename") or meta.get("storageFilename") or "").strip().lstrip("/")
    if not storage:
        return None

    from django.conf import settings

    if storage.startswith("contributions/") or storage.startswith("postmarks/"):
        path = f"{settings.MEDIA_URL.rstrip('/')}/postmarks/{storage}"
    else:
        path = f"{settings.MEDIA_URL.rstrip('/')}/{storage}"
    if request is None:
        return path
    return request.build_absolute_uri(path)


def _coerce_meta_list(raw):
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    return []


def _build_submitted_data_image_urls(data, request):
    """Return categorized URL lists for gallery previews, without exposing meta objects."""
    if not isinstance(data, dict):
        return {}

    categorized = {
        "postmark_images": [],
        "ratemark_images": [],
        "auxmark_images": [],
    }

    grouped_sources = (
        ("postmark_images", data.get("postmark_image_metas")),
        ("ratemark_images", data.get("ratemark_image_metas")),
        ("auxmark_images", data.get("auxmark_image_metas")),
    )

    has_grouped = False
    for target_key, raw_list in grouped_sources:
        urls = []
        for item in _coerce_meta_list(raw_list):
            image_url = _meta_item_to_public_image_url(item, request)
            if image_url:
                urls.append(image_url)
        if urls:
            categorized[target_key] = urls
            has_grouped = True

    if not has_grouped:
        legacy_metas = _coerce_meta_list(data.get("image_metas"))
        single_meta = data.get("image_meta")
        if isinstance(single_meta, dict):
            legacy_metas = [*legacy_metas, single_meta]
        legacy_urls = []
        for item in legacy_metas:
            image_url = _meta_item_to_public_image_url(item, request)
            if image_url:
                legacy_urls.append(image_url)
        if legacy_urls:
            categorized["postmark_images"] = legacy_urls

    return {k: v for k, v in categorized.items() if v}


def _strip_submitted_data_image_metas(data, request=None):
    if not isinstance(data, dict):
        return data
    stripped = {k: v for k, v in data.items() if k not in _SUBMITTED_DATA_IMAGE_META_KEYS}
    stripped.update(_build_submitted_data_image_urls(data, request))
    return stripped


class ContributionListSerializer(serializers.ModelSerializer):
    """List view for contributions (moderation queue)."""
    contributor_username = serializers.CharField(source="contributor.username", read_only=True)
    reviewer_username = serializers.CharField(source="reviewer.username", read_only=True, allow_null=True)
    postmark_id = serializers.SerializerMethodField()
    state_display = serializers.SerializerMethodField()
    town_display = serializers.SerializerMethodField()
    shape_display = serializers.SerializerMethodField()
    date_range = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()

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
            "submitted_data",
            "state_display",
            "town_display",
            "shape_display",
            "date_range",
            "display_name",
        ]

    def get_postmark_id(self, obj):
        return obj.postmark_id if obj.postmark_id else None

    def get_state_display(self, obj):
        sd = obj.submitted_data or {}
        return sd.get("state", "-")

    def get_town_display(self, obj):
        sd = obj.submitted_data or {}
        return sd.get("town", "-")

    def get_shape_display(self, obj):
        sd = obj.submitted_data or {}
        return sd.get("shape") or sd.get("type", "-")

    def get_date_range(self, obj):
        sd = obj.submitted_data or {}
        date_range = (sd.get("date_range") or "").strip()
        if date_range:
            return date_range
        first_seen = (sd.get("first_seen") or "").strip()
        last_seen = (sd.get("last_seen") or "").strip()
        if first_seen and last_seen:
            return f"{first_seen}-{last_seen}"
        return first_seen or ""

    def get_display_name(self, obj):
        sd = obj.submitted_data or {}
        town = (sd.get("town") or "").strip()
        state = (sd.get("state") or "").strip()
        shape_display = (sd.get("shape") or sd.get("type") or "").strip()
        location = ", ".join([x for x in [town, state] if x])
        parts = [x for x in [location, shape_display] if x and x.lower() != "unknown"]
        return " — ".join(parts) if parts else f"Submission #{obj.id}"

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["submitted_data"] = _strip_submitted_data_image_metas(
            data.get("submitted_data"),
            request=self.context.get("request"),
        )
        return data


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

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["submitted_data"] = _strip_submitted_data_image_metas(
            data.get("submitted_data"),
            request=self.context.get("request"),
        )
        return data


class ContributionApproveRejectSerializer(serializers.Serializer):
    """Payload for approve/reject actions."""
    review_notes = serializers.CharField(required=False, allow_blank=True)


# ========== COLLECTION (F7) ==========


class _NestedRegionSerializer(serializers.ModelSerializer):
    """Compact Region representation embedded inside Collection responses."""
    class Meta:
        model = Region
        fields = ["id", "name", "abbrev", "region_tier"]


class CollectionSerializer(serializers.ModelSerializer):
    """Collection (institutional unit) serializer."""
    region = _NestedRegionSerializer(read_only=True)
    region_id = serializers.PrimaryKeyRelatedField(
        queryset=Region.objects.all(), source="region", write_only=True,
    )
    editor_count = serializers.SerializerMethodField()

    class Meta:
        model = Collection
        fields = [
            "id",
            "name",
            "description",
            "region",
            "region_id",
            "is_active",
            "editor_count",
            "created_date",
            "modified_date",
        ]
        read_only_fields = ["id", "created_date", "modified_date", "editor_count"]

    def get_editor_count(self, obj):
        # Cheap count; for hot lists, annotate at the queryset level instead.
        return obj.editor_assignments.count()


class CollectionAssignmentSerializer(serializers.ModelSerializer):
    """Editor↔Collection assignment serializer."""
    username = serializers.CharField(source="user.username", read_only=True)
    collection_name = serializers.CharField(source="collection.name", read_only=True)

    class Meta:
        model = CollectionAssignment
        fields = ["id", "user", "username", "collection", "collection_name", "created_date"]
        read_only_fields = ["id", "username", "collection_name", "created_date"]


###################################################################################################
