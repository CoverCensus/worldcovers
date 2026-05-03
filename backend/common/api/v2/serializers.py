###################################################################################################
## WoCo Commons - API v2 Serializers (Phase 2 rewrite)
##
## Unified Marking model: Postmark / Ratemark / Auxmark are now rows in a single
## Marking table discriminated by `type`. CoverMarking carries placement.
## CoverDate / CoverValuation move date and valuation observation to the Cover.
## Image is polymorphic over (subject_type, subject_id).
###################################################################################################
from django.contrib.auth import get_user_model

from rest_framework import serializers

from common.models import (
    AdminCsvUpload,
    Citation,
    Collection,
    CollectionAssignment,
    Color,
    Contribution,
    Cover,
    CoverDate,
    CoverMarking,
    CoverValuation,
    FAQEntry,
    Image,
    Lettering,
    Marking,
    MarkingType,
    PostOffice,
    ReferenceWork,
    Region,
    Shape,
)


User = get_user_model()


###################################################################################################
## Lookup / shared
###################################################################################################
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "is_staff", "is_superuser"]
        read_only_fields = fields


class LoginRequestSerializer(serializers.Serializer):
    """Validates login access request (email, first_name, last_name). Creates User directly."""
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)

    def validate_email(self, value):
        value = (value or "").strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "A user with this email already exists."
            )
        return value


class ColorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Color
        fields = "__all__"
        read_only_fields = ["color_id", "created_date", "modified_date"]


class RegionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Region
        fields = "__all__"


class PostOfficeSerializer(serializers.ModelSerializer):
    region_name = serializers.CharField(source="region.name", read_only=True)
    region_abbrev = serializers.CharField(source="region.abbrev", read_only=True)

    class Meta:
        model = PostOffice
        fields = "__all__"


class LetteringSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lettering
        fields = "__all__"


class ShapeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shape
        fields = "__all__"


class ReferenceWorkSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReferenceWork
        fields = "__all__"
        read_only_fields = ["id", "created_date", "modified_date"]


class FAQEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = FAQEntry
        fields = ["faq_entry_id", "question", "answer", "is_active", "display_order"]


###################################################################################################
## Image (polymorphic over COVER | MARKING)
###################################################################################################
class ImageSerializer(serializers.ModelSerializer):
    """
    Polymorphic image attached to either a Cover or a Marking by
    (subject_type, subject_id). Replaces PostmarkImageSerializer.
    """
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Image
        fields = [
            "image_id",
            "subject_type",
            "subject_id",
            "original_filename",
            "storage_filename",
            "file_checksum",
            "mime_type",
            "image_width",
            "image_height",
            "file_size_bytes",
            "image_view",
            "image_description",
            "display_order",
            "uploaded_by",
            "image_url",
            "created_date",
        ]
        read_only_fields = ["image_id", "file_checksum", "created_date", "modified_date"]

    def get_image_url(self, obj):
        """
        Build the public URL for the stored image file.

        Phase 2 layout: contributor uploads live under
        MEDIA_ROOT/markings/<region_abbrev>/<uuid>.<ext>, with storage_filename
        like 'va/<uuid>.png'. The public URL is MEDIA_URL + 'markings/' +
        storage_filename, e.g. /media/markings/va/<uuid>.png.

        Back-compat branches:
        - storage_filename starting with 'contributions/' was the brief
          interim layout before region-namespacing; files lived under
          MEDIA_ROOT/markings/contributions/.
        - storage_filename starting with 'postmarks/' is from the original v1
          layout, before the postmarks/ -> markings/ directory rename; those
          files still live at MEDIA_ROOT/postmarks/...
        - Anything else is treated as a legacy catalog image path served
          directly from MEDIA_ROOT (e.g. 'iowa/Marking-...jpg').
        """
        storage = (obj.storage_filename or "").lstrip("/")
        if not storage:
            return None
        request = self.context.get("request")
        if not request:
            return None
        from django.conf import settings
        media_url = settings.MEDIA_URL.rstrip("/")
        if storage.startswith("contributions/"):
            path = f"{media_url}/markings/{storage}"
        elif storage.startswith("postmarks/"):
            path = f"{media_url}/{storage}"
        elif "/" in storage and not storage.startswith("markings/"):
            # New convention: '<abbrev>/<file>' served from /markings/<abbrev>/<file>.
            # Legacy catalog paths like 'iowa/foo.jpg' also match this branch;
            # those files must be moved to MEDIA_ROOT/markings/iowa/ at deploy.
            path = f"{media_url}/markings/{storage}"
        else:
            path = f"{media_url}/{storage}"
        return request.build_absolute_uri(path)


###################################################################################################
## Citation (subject_type COVER | MARKING)
###################################################################################################
class CitationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Citation
        fields = "__all__"
        read_only_fields = ["id", "created_date", "modified_date"]

    def validate_subject_type(self, value):
        if value not in {"COVER", "MARKING"}:
            raise serializers.ValidationError("subject_type must be COVER or MARKING.")
        return value


###################################################################################################
## Cover, CoverDate, CoverValuation, CoverMarking
###################################################################################################
class CoverDateSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoverDate
        fields = "__all__"
        read_only_fields = ["id", "created_date", "modified_date"]


class CoverSerializer(serializers.ModelSerializer):
    color_name = serializers.CharField(source="color.name", read_only=True)
    cover_dates = CoverDateSerializer(many=True, read_only=True)

    class Meta:
        model = Cover
        fields = [
            "id",
            "code",
            "color",
            "color_name",
            "type",
            "has_adhesive",
            "height",
            "is_institutional",
            "width",
            "cover_dates",
            "created_date",
            "modified_date",
        ]
        read_only_fields = ["id", "created_date", "modified_date"]


class CoverValuationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoverValuation
        fields = [
            "cover_valuation_id",
            "cover",
            "amt",
            "appraisal_date",
            "created_date",
            "modified_date",
        ]
        read_only_fields = ["cover_valuation_id", "created_date", "modified_date"]


class CoverMarkingSerializer(serializers.ModelSerializer):
    cover_details = CoverSerializer(source="cover", read_only=True)

    class Meta:
        model = CoverMarking
        fields = [
            "id",
            "cover",
            "cover_details",
            "marking",
            "is_backstamp",
            "placement",
            "created_date",
            "modified_date",
        ]
        read_only_fields = ["id", "created_date", "modified_date"]


###################################################################################################
## Marking (unified TOWNMARK | RATEMARK | AUXMARK)
###################################################################################################
def _format_decimal(value):
    if value is None:
        return None
    try:
        return f"{float(value):g}"
    except (TypeError, ValueError):
        return None


class MarkingListSerializer(serializers.ModelSerializer):
    """
    Lightweight Marking row used by /api/v2/markings/ list/search.

    Returns the same nested-name fields the frontend already consumes
    (state, town, shape_name, color_name, ...), plus the unified `type`
    discriminator and aggregated earliest_seen / latest_seen.
    """
    id = serializers.IntegerField(source="marking_id", read_only=True)
    state = serializers.CharField(source="post_office.region.name", read_only=True, default="")
    state_abbrev = serializers.CharField(source="post_office.region.abbrev", read_only=True, default="")
    town = serializers.CharField(source="post_office.name", read_only=True, default="")
    shape_name = serializers.CharField(source="shape.name", read_only=True, default="")
    lettering_name = serializers.CharField(source="lettering.name", read_only=True, default="")
    color_name = serializers.CharField(source="color.name", read_only=True, default="")
    post_office_name = serializers.CharField(source="post_office.name", read_only=True, default="")
    region_name = serializers.CharField(source="post_office.region.name", read_only=True, default="")
    earliest_seen = serializers.DateField(read_only=True, allow_null=True, required=False)
    latest_seen = serializers.DateField(read_only=True, allow_null=True, required=False)
    main_image = serializers.SerializerMethodField()
    second_image = serializers.SerializerMethodField()
    size_display = serializers.SerializerMethodField()

    class Meta:
        model = Marking
        fields = [
            "id",
            "marking_id",
            "code",
            "type",
            "catalog_txt",
            "inscription_txt",
            "desc",
            "is_manuscript",
            "is_irreg",
            "width",
            "height",
            "size_display",
            "date_fmt",
            "impression",
            "rate_val",
            "post_office",
            "shape",
            "lettering",
            "color",
            "state",
            "state_abbrev",
            "town",
            "shape_name",
            "lettering_name",
            "color_name",
            "post_office_name",
            "region_name",
            "earliest_seen",
            "latest_seen",
            "main_image",
            "second_image",
        ]
        read_only_fields = fields

    def _images_for(self, obj):
        cached = getattr(obj, "_marking_images", None)
        if cached is not None:
            return cached
        rows = list(
            Image.objects.filter(
                subject_type=Image.SUBJECT_MARKING,
                subject_id=obj.pk,
            ).order_by("display_order", "image_id")
        )
        obj._marking_images = rows
        return rows

    def _image_payload(self, image):
        if not image:
            return None
        return ImageSerializer(image, context=self.context).data

    def get_main_image(self, obj):
        rows = self._images_for(obj)
        return self._image_payload(rows[0] if rows else None)

    def get_second_image(self, obj):
        rows = self._images_for(obj)
        return self._image_payload(rows[1] if len(rows) > 1 else None)

    def get_size_display(self, obj):
        w = _format_decimal(obj.width)
        h = _format_decimal(obj.height)
        if w and h:
            return f"{w}x{h}"
        return w or h or None


class MarkingSerializer(serializers.ModelSerializer):
    """
    Full Marking serializer used for retrieve / create / update.

    Includes images and citations attached to this marking, plus aggregated
    earliest_seen / latest_seen across covers it appears on.
    """
    id = serializers.IntegerField(source="marking_id", read_only=True)
    state = serializers.CharField(source="post_office.region.name", read_only=True, default="")
    state_abbrev = serializers.CharField(source="post_office.region.abbrev", read_only=True, default="")
    town = serializers.CharField(source="post_office.name", read_only=True, default="")
    shape_name = serializers.CharField(source="shape.name", read_only=True, default="")
    lettering_name = serializers.CharField(source="lettering.name", read_only=True, default="")
    color_name = serializers.CharField(source="color.name", read_only=True, default="")
    post_office_name = serializers.CharField(source="post_office.name", read_only=True, default="")
    region_name = serializers.CharField(source="post_office.region.name", read_only=True, default="")
    earliest_seen = serializers.DateField(read_only=True, allow_null=True, required=False)
    latest_seen = serializers.DateField(read_only=True, allow_null=True, required=False)
    images = serializers.SerializerMethodField()
    citations = serializers.SerializerMethodField()
    size_display = serializers.SerializerMethodField()
    created_by = UserSerializer(read_only=True)
    modified_by = UserSerializer(read_only=True)

    class Meta:
        model = Marking
        fields = [
            "id",
            "marking_id",
            "code",
            "type",
            "catalog_txt",
            "inscription_txt",
            "desc",
            "is_manuscript",
            "is_irreg",
            "width",
            "height",
            "size_display",
            "date_fmt",
            "impression",
            "rate_val",
            "post_office",
            "shape",
            "lettering",
            "color",
            "state",
            "state_abbrev",
            "town",
            "shape_name",
            "lettering_name",
            "color_name",
            "post_office_name",
            "region_name",
            "earliest_seen",
            "latest_seen",
            "images",
            "citations",
            "created_date",
            "modified_date",
            "created_by",
            "modified_by",
        ]
        read_only_fields = ["marking_id", "created_date", "modified_date"]

    def get_images(self, obj):
        rows = Image.objects.filter(
            subject_type=Image.SUBJECT_MARKING,
            subject_id=obj.pk,
        ).order_by("display_order", "image_id")
        return ImageSerializer(rows, many=True, context=self.context).data

    def get_citations(self, obj):
        rows = Citation.objects.filter(
            subject_type="MARKING",
            subject_id=obj.pk,
        ).select_related("reference_work").order_by("reference_work_id")
        return CitationSerializer(rows, many=True, context=self.context).data

    def get_size_display(self, obj):
        w = _format_decimal(obj.width)
        h = _format_decimal(obj.height)
        if w and h:
            return f"{w}x{h}"
        return w or h or None

    def validate_type(self, value):
        valid = {c[0] for c in MarkingType.choices}
        if value not in valid:
            raise serializers.ValidationError(f"type must be one of {sorted(valid)}.")
        return value


###################################################################################################
## Contribution (moderation queue)
###################################################################################################
class ContributionListSerializer(serializers.ModelSerializer):
    """List view for contributions (moderation queue)."""
    contributor_username = serializers.CharField(source="contributor.username", read_only=True)
    reviewer_username = serializers.CharField(source="reviewer.username", read_only=True, allow_null=True)
    marking_id = serializers.SerializerMethodField()
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
            "marking",
            "marking_id",
            "collection",
            "status",
            "reviewer",
            "reviewer_username",
            "review_notes",
            "created_at",
            "updated_at",
            "submitted_data",
            "state_display",
            "town_display",
            "type_display",
            "display_name",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_marking_id(self, obj):
        return obj.marking_id if obj.marking_id else None

    def get_state_display(self, obj):
        return (obj.submitted_data or {}).get("state", "-")

    def get_town_display(self, obj):
        return (obj.submitted_data or {}).get("town", "-")

    def get_type_display(self, obj):
        return (obj.submitted_data or {}).get("type", "-")

    def get_display_name(self, obj):
        sd = obj.submitted_data or {}
        town = (sd.get("town") or "").strip()
        state = (sd.get("state") or "").strip()
        type_display = (sd.get("type") or "").strip()
        location = ", ".join([x for x in [town, state] if x])
        parts = [x for x in [location, type_display] if x and x.lower() != "unknown"]
        return " - ".join(parts) if parts else f"Submission #{obj.id}"


class ContributionDetailSerializer(serializers.ModelSerializer):
    contributor_username = serializers.CharField(source="contributor.username", read_only=True)
    reviewer_username = serializers.CharField(source="reviewer.username", read_only=True, allow_null=True)

    class Meta:
        model = Contribution
        fields = [
            "id",
            "contributor",
            "contributor_username",
            "marking",
            "collection",
            "submitted_data",
            "status",
            "reviewer",
            "reviewer_username",
            "review_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "contributor", "marking", "created_at"]


class ContributionApproveRejectSerializer(serializers.Serializer):
    """Payload for approve / reject actions."""
    review_notes = serializers.CharField(required=False, allow_blank=True)


###################################################################################################
## Collection (institutional unit, F7)
###################################################################################################
class _NestedRegionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Region
        fields = ["id", "name", "abbrev", "region_tier"]


class CollectionSerializer(serializers.ModelSerializer):
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
        return obj.editor_assignments.count()


class CollectionAssignmentSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = CollectionAssignment
        fields = [
            "id",
            "user",
            "username",
            "collection",
            "created_date",
        ]
        read_only_fields = ["id", "created_date"]


###################################################################################################
## Admin CSV upload (staff only)
###################################################################################################
class AdminCsvUploadListSerializer(serializers.ModelSerializer):
    uploaded_by_username = serializers.CharField(source="uploaded_by.username", read_only=True, allow_null=True)

    class Meta:
        model = AdminCsvUpload
        fields = [
            "id",
            "name",
            "file_name",
            "uploaded_at",
            "uploaded_by",
            "uploaded_by_username",
            "row_count",
        ]
        read_only_fields = fields


class AdminCsvUploadSerializer(serializers.ModelSerializer):
    uploaded_by_username = serializers.CharField(source="uploaded_by.username", read_only=True, allow_null=True)

    class Meta:
        model = AdminCsvUpload
        fields = [
            "id",
            "name",
            "file_name",
            "uploaded_at",
            "uploaded_by",
            "uploaded_by_username",
            "data",
            "row_count",
        ]
        read_only_fields = ["id", "uploaded_at", "row_count"]


###################################################################################################
