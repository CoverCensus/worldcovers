###################################################################################################
## WoCo Commons - API v2 Serializers (Phase 1 stub)
## The full Marking-aware rewrite lives in Phase 2. This stub keeps only the
## serializers backing the read-only lookup viewsets that survive Phase 1.
###################################################################################################
from rest_framework import serializers

from common.models import (
    Color,
    FAQEntry,
    Lettering,
    PostOffice,
    ReferenceWork,
    Region,
    Shape,
)


class ColorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Color
        fields = "__all__"


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


class FAQEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = FAQEntry
        fields = ["faq_entry_id", "question", "answer", "is_active", "display_order"]


###################################################################################################
