###################################################################################################
## WoCo Commons - API v2 Views (Phase 1 stub)
##
## The pre-rewrite views.py (3300 lines) targeted the split
## Postmark/Ratemark/Auxmark/Framing/DateObserved/PostmarkValuation/PostmarkImage
## schema. Those models were retired by the Phase 1 model rewrite, so the
## viewsets that consumed them are gone here. The full Marking/Image/Cover*
## API rewrite belongs to Phase 2.
##
## What survives Phase 1 in this module: read-only viewsets for the lookup
## tables (Color/Region/PostOffice/Lettering/Shape/ReferenceWork/FAQEntry),
## which are unaffected by the model rewrite. Auth lives in common/api/auth.py.
###################################################################################################
from django.db import ProgrammingError

from rest_framework import viewsets
from rest_framework.permissions import AllowAny, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from common.models import (
    Color,
    FAQEntry,
    Lettering,
    PostOffice,
    ReferenceWork,
    Region,
    Shape,
)

from .serializers import (
    ColorSerializer,
    FAQEntrySerializer,
    LetteringSerializer,
    PostOfficeSerializer,
    ReferenceWorkSerializer,
    RegionSerializer,
    ShapeSerializer,
)


class ColorViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Color.objects.all().order_by("name")
    serializer_class = ColorSerializer
    permission_classes = [AllowAny]


class RegionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Region.objects.all().order_by("name")
    serializer_class = RegionSerializer
    permission_classes = [AllowAny]


class PostOfficeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PostOffice.objects.select_related("region").order_by("name")
    serializer_class = PostOfficeSerializer
    permission_classes = [AllowAny]


class LetteringViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Lettering.objects.all().order_by("name")
    serializer_class = LetteringSerializer
    permission_classes = [AllowAny]


class ShapeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Shape.objects.all().order_by("name")
    serializer_class = ShapeSerializer
    permission_classes = [AllowAny]


class ReferenceWorkViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ReferenceWork.objects.all().order_by("title")
    serializer_class = ReferenceWorkSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]


class FAQEntryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only API for FAQ entries used by the public SPA homepage.
    Tolerates a missing FAQEntries table by returning an empty paginated list.
    """
    queryset = FAQEntry.objects.filter(is_active=True).order_by("display_order", "faq_entry_id")
    serializer_class = FAQEntrySerializer
    permission_classes = [AllowAny]

    def list(self, request, *args, **kwargs):
        try:
            return super().list(request, *args, **kwargs)
        except ProgrammingError:
            return Response({
                "count": 0,
                "next": None,
                "previous": None,
                "results": [],
            })


###################################################################################################
