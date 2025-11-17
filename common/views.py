###################################################################################################
## WoCo Project - API View (Endpoints)
## MPC: 2025/11/15
###################################################################################################
from datetime import date

from django.db.models import Q, Count, Prefetch

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated

from django_filters.rest_framework import DjangoFilterBackend

from .models import (
    GeographicLocation, AdministrativeUnit, GeographicAffiliation,
    AdministrativeUnitNameHistory, AdministrativeUnitHistory,
    PostmarkShape, LetteringStyle, FramingStyle, Color, DateFormat,
    Postmark, PostmarkColor, PostmarkDatesSeen, PostmarkSize,
    PostmarkValuation, PostmarkPublication, PostmarkPublicationReference,
    PostmarkImage, Postcover, PostcoverPostmark, PostcoverImage
)

from .serializers import (
    GeographicLocationSerializer, GeographicLocationListSerializer,
    AdministrativeUnitSerializer, AdministrativeUnitListSerializer,
    GeographicAffiliationSerializer, AdministrativeUnitNameHistorySerializer,
    AdministrativeUnitHistorySerializer, PostmarkShapeSerializer,
    LetteringStyleSerializer, FramingStyleSerializer, ColorSerializer,
    DateFormatSerializer, PostmarkSerializer, PostmarkListSerializer,
    PostmarkColorSerializer, PostmarkDatesSeenSerializer, PostmarkSizeSerializer,
    PostmarkValuationSerializer, PostmarkPublicationSerializer,
    PostmarkPublicationReferenceSerializer, PostmarkImageSerializer,
    PostcoverSerializer, PostcoverListSerializer, PostcoverPostmarkSerializer,
    PostcoverImageSerializer
)


# ========== GEOGRAPHIC HIERARCHY VIEWSETS ==========

class GeographicLocationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for geographic locations (towns, cities, post offices)
    
    list: Return all geographic locations
    retrieve: Return a specific location with current affiliations
    create: Create a new location (authenticated users only)
    update: Update a location (authenticated users only)
    partial_update: Partially update a location (authenticated users only)
    destroy: Delete a location (authenticated users only)
    """
    queryset = GeographicLocation.objects.all().select_related(
        'created_by', 'modified_by'
    ).prefetch_related('affiliations__administrative_unit')
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['location_type', 'location_name']
    search_fields = ['location_name', 'location_type']
    ordering_fields = ['location_name', 'location_type', 'created_date']
    ordering = ['location_name']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return GeographicLocationListSerializer
        return GeographicLocationSerializer
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)
    
    @action(detail=True, methods=['get'])
    def affiliations_timeline(self, request, pk=None):
        """Get all historical affiliations for this location"""
        location = self.get_object()
        affiliations = location.affiliations.all().order_by('effective_from_date')
        from .serializers import GeographicAffiliationSerializer
        serializer = GeographicAffiliationSerializer(affiliations, many=True, context={'request': request})
        return Response(serializer.data)


class AdministrativeUnitViewSet(viewsets.ModelViewSet):
    """
    ViewSet for administrative units (states, territories, counties, countries)
    """
    queryset = AdministrativeUnit.objects.all().select_related(
        'parent_administrative_unit', 'created_by', 'modified_by'
    )
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['unit_type', 'hierarchy_level', 'is_active', 'unit_abbreviation']
    search_fields = ['unit_name', 'unit_abbreviation']
    ordering_fields = ['unit_name', 'hierarchy_level', 'created_date']
    ordering = ['hierarchy_level', 'unit_name']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return AdministrativeUnitListSerializer
        return AdministrativeUnitSerializer
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)
    
    @action(detail=True, methods=['get'])
    def children(self, request, pk=None):
        """Get all child administrative units"""
        parent = self.get_object()
        children = AdministrativeUnit.objects.filter(parent_administrative_unit=parent)
        serializer = AdministrativeUnitListSerializer(children, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def locations(self, request, pk=None):
        """Get all locations currently in this administrative unit"""
        unit = self.get_object()
        current_affiliations = GeographicAffiliation.objects.filter(
            administrative_unit=unit,
            effective_to_date__isnull=True
        ) | GeographicAffiliation.objects.filter(
            administrative_unit=unit,
            effective_to_date__gte=date.today()
        )
        locations = [aff.geographic_location for aff in current_affiliations]
        serializer = GeographicLocationListSerializer(locations, many=True)
        return Response(serializer.data)


class GeographicAffiliationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for geographic affiliations (temporal relationships between locations and units)
    """
    queryset = GeographicAffiliation.objects.all().select_related(
        'geographic_location', 'administrative_unit', 'created_by', 'modified_by'
    )
    serializer_class = GeographicAffiliationSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['geographic_location', 'administrative_unit']
    ordering_fields = ['effective_from_date', 'effective_to_date']
    ordering = ['-effective_from_date']
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class AdministrativeUnitNameHistoryViewSet(viewsets.ModelViewSet):
    """ViewSet for administrative unit name history"""
    queryset = AdministrativeUnitNameHistory.objects.all().select_related(
        'administrative_unit', 'created_by'
    )
    serializer_class = AdministrativeUnitNameHistorySerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['administrative_unit']
    ordering = ['-effective_from_date']


class AdministrativeUnitHistoryViewSet(viewsets.ModelViewSet):
    """ViewSet for administrative unit version history"""
    queryset = AdministrativeUnitHistory.objects.all().select_related(
        'administrative_unit', 'parent_administrative_unit', 'created_by'
    )
    serializer_class = AdministrativeUnitHistorySerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['administrative_unit', 'change_reason', 'unit_type']
    ordering = ['-effective_from_date']


# ========== PHYSICAL CHARACTERISTICS VIEWSETS ==========

class PostmarkShapeViewSet(viewsets.ModelViewSet):
    """ViewSet for postmark shapes"""
    queryset = PostmarkShape.objects.all()
    serializer_class = PostmarkShapeSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['shape_name', 'shape_description']
    ordering = ['shape_name']


class LetteringStyleViewSet(viewsets.ModelViewSet):
    """ViewSet for lettering styles"""
    queryset = LetteringStyle.objects.all()
    serializer_class = LetteringStyleSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['lettering_style_name', 'lettering_description']
    ordering = ['lettering_style_name']


class FramingStyleViewSet(viewsets.ModelViewSet):
    """ViewSet for framing styles"""
    queryset = FramingStyle.objects.all()
    serializer_class = FramingStyleSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['framing_style_name', 'framing_description']
    ordering = ['framing_style_name']


class ColorViewSet(viewsets.ModelViewSet):
    """ViewSet for colors"""
    queryset = Color.objects.all()
    serializer_class = ColorSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['color_name']
    ordering = ['color_name']


class DateFormatViewSet(viewsets.ModelViewSet):
    """ViewSet for date formats"""
    queryset = DateFormat.objects.all()
    serializer_class = DateFormatSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['format_name', 'format_description']
    ordering = ['format_name']


# ========== POSTMARK VIEWSETS ==========

class PostmarkViewSet(viewsets.ModelViewSet):
    """
    ViewSet for postmarks with comprehensive filtering
    
    Supports filtering by:
    - geographic_location: Filter by location ID
    - postmark_shape: Filter by shape ID
    - lettering_style: Filter by lettering ID
    - framing_style: Filter by framing ID
    - rate_location: Filter by rate location
    - rate_value: Filter by rate value
    - condition: Filter by condition (VERY_FINE, FINE, VERY_GOOD, POOR)
    - is_manuscript: Filter manuscript postmarks
    - search: Full-text search across location name, postmark_key, rate_value
    """
    queryset = Postmark.objects.all().select_related(
        'geographic_location', 'postmark_shape', 'lettering_style',
        'framing_style', 'date_format', 'created_by', 'modified_by'
    ).prefetch_related(
        'postmark_colors__color', 'dates_seen', 'sizes', 
        'valuations', 'images', 'publication_references__postmark_publication'
    )
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = {
        'geographic_location': ['exact'],
        'postmark_shape': ['exact'],
        'lettering_style': ['exact'],
        'framing_style': ['exact'],
        'rate_location': ['exact'],
        'rate_value': ['exact', 'icontains'],
        'condition': ['exact'],
        'is_manuscript': ['exact'],
    }
    search_fields = ['postmark_key', 'geographic_location__location_name', 
                     'rate_value', 'other_characteristics']
    ordering_fields = ['postmark_key', 'created_date', 'rate_value']
    ordering = ['postmark_key']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return PostmarkListSerializer
        return PostmarkSerializer
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def add_color(self, request, pk=None):
        """Add a color to a postmark"""
        postmark = self.get_object()
        color_id = request.data.get('color_id')
        
        if not color_id:
            return Response({'error': 'color_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            color = Color.objects.get(pk=color_id)
            PostmarkColor.objects.create(
                postmark=postmark,
                color=color,
                created_by=request.user
            )
            return Response({'status': 'color added'})
        except Color.DoesNotExist:
            return Response({'error': 'Color not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def add_date_range(self, request, pk=None):
        """Add a date range to a postmark"""
        postmark = self.get_object()
        serializer = PostmarkDatesSeenSerializer(data=request.data)
        
        if serializer.is_valid():
            serializer.save(postmark=postmark, created_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'])
    def by_location(self, request):
        """Get postmarks grouped by location"""
        location_id = request.query_params.get('location_id')
        if not location_id:
            return Response({'error': 'location_id parameter is required'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        postmarks = self.get_queryset().filter(geographic_location_id=location_id)
        serializer = self.get_serializer(postmarks, many=True)
        return Response(serializer.data)


class PostmarkImageViewSet(viewsets.ModelViewSet):
    """ViewSet for postmark images"""
    queryset = PostmarkImage.objects.all().select_related('postmark', 'created_by', 'modified_by')
    serializer_class = PostmarkImageSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['postmark', 'image_view', 'image_status']
    ordering_fields = ['display_order', 'created_date']
    ordering = ['display_order']
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve an image"""
        image = self.get_object()
        image.image_status = 'APPROVED'
        image.save()
        return Response({'status': 'image approved'})
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject an image"""
        image = self.get_object()
        image.image_status = 'REJECTED'
        image.save()
        return Response({'status': 'image rejected'})


class PostmarkValuationViewSet(viewsets.ModelViewSet):
    """ViewSet for postmark valuations"""
    queryset = PostmarkValuation.objects.all().select_related(
        'postmark', 'valued_by_user', 'created_by', 'modified_by'
    )
    serializer_class = PostmarkValuationSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['postmark', 'valued_by_user']
    ordering_fields = ['valuation_date', 'estimated_value']
    ordering = ['-valuation_date']


# ========== PUBLICATION VIEWSETS ==========

class PostmarkPublicationViewSet(viewsets.ModelViewSet):
    """ViewSet for publications"""
    queryset = PostmarkPublication.objects.all().select_related('created_by', 'modified_by')
    serializer_class = PostmarkPublicationSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['publication_type', 'author', 'publisher']
    search_fields = ['publication_title', 'author', 'publisher', 'isbn']
    ordering_fields = ['publication_date', 'publication_title']
    ordering = ['-publication_date']
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class PostmarkPublicationReferenceViewSet(viewsets.ModelViewSet):
    """ViewSet for publication references"""
    queryset = PostmarkPublicationReference.objects.all().select_related(
        'postmark', 'postmark_publication', 'created_by'
    )
    serializer_class = PostmarkPublicationReferenceSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['postmark', 'postmark_publication']
    search_fields = ['published_id', 'reference_location']


# ========== POSTCOVER VIEWSETS ==========

class PostcoverViewSet(viewsets.ModelViewSet):
    """
    ViewSet for postcovers (postal covers/envelopes in collections)
    
    list: Return all postcovers (or filter by owner and/or condition)
    retrieve: Return a specific postcover with all postmarks and images
    create: Create a new postcover
    update: Update a postcover
    my_collection: Get current user's postcovers
    
    Supports filtering by:
    - owner_user: Filter by owner user ID
    - condition: Filter by condition (VERY_FINE, FINE, VERY_GOOD, POOR)
    """
    queryset = Postcover.objects.all().select_related(
        'owner_user', 'created_by', 'modified_by'
    ).prefetch_related(
        'postcover_postmarks__postmark',
        'images'
    )
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['owner_user', 'condition']
    search_fields = ['postcover_key', 'description']
    ordering_fields = ['postcover_key', 'created_date']
    ordering = ['postcover_key']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return PostcoverListSerializer
        return PostcoverSerializer
    
    def perform_create(self, serializer):
        serializer.save(
            owner_user=self.request.user,
            created_by=self.request.user,
            modified_by=self.request.user
        )
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def my_collection(self, request):
        """Get current user's postcovers"""
        postcovers = self.get_queryset().filter(owner_user=request.user)
        serializer = self.get_serializer(postcovers, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def add_postmark(self, request, pk=None):
        """Add a postmark to this postcover"""
        postcover = self.get_object()
        serializer = PostcoverPostmarkSerializer(data=request.data)
        
        if serializer.is_valid():
            serializer.save(postcover=postcover, created_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PostcoverImageViewSet(viewsets.ModelViewSet):
    """ViewSet for postcover images"""
    queryset = PostcoverImage.objects.all().select_related(
        'postcover', 'uploaded_by_user', 'created_by', 'modified_by'
    )
    serializer_class = PostcoverImageSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['postcover', 'image_view']
    ordering_fields = ['display_order', 'created_date']
    ordering = ['display_order']
    
    def perform_create(self, serializer):
        serializer.save(
            uploaded_by_user=self.request.user,
            created_by=self.request.user,
            modified_by=self.request.user
        )
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)

###################################################################################################
