###################################################################################################
## WoCo Commons - API Views
## MPC: 2025/11/15
###################################################################################################
from datetime import date

from django.db.models import Q, Count, Prefetch

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated, BasePermission

from django_filters.rest_framework import DjangoFilterBackend

from .models import (
    PostalFacility, PostalFacilityIdentity,
    AdministrativeUnit, AdministrativeUnitIdentity, AdministrativeUnitResponsibility,
    JurisdictionalAffiliation,
    PostmarkShape, LetteringStyle, FramingStyle, Color, DateFormat,
    Postmark, PostmarkColor, PostmarkDatesSeen, PostmarkSize,
    PostmarkValuation, PostmarkPublication, PostmarkPublicationReference,
    PostmarkImage, Postcover, PostcoverPostmark, PostcoverImage
)

from .serializers import (
    PostalFacilitySerializer, PostalFacilityListSerializer,
    PostalFacilityIdentitySerializer, AdministrativeUnitSerializer,
    AdministrativeUnitListSerializer, AdministrativeUnitIdentitySerializer,
    AdministrativeUnitResponsibilitySerializer, JurisdictionalAffiliationSerializer,
    PostmarkShapeSerializer, LetteringStyleSerializer, FramingStyleSerializer,
    ColorSerializer, DateFormatSerializer, PostmarkSerializer,
    PostmarkListSerializer, PostmarkColorSerializer, PostmarkDatesSeenSerializer,
    PostmarkSizeSerializer, PostmarkValuationSerializer, PostmarkPublicationSerializer,
    PostmarkPublicationReferenceSerializer, PostmarkImageSerializer,
    PostcoverSerializer, PostcoverListSerializer, PostcoverPostmarkSerializer,
    PostcoverImageSerializer
)


# ========== CUSTOM PERMISSIONS ==========

class IsResponsibleForRegion(BasePermission):
    """
    Permission check: User must be in a group responsible for the postmark's region.
    """
    def has_object_permission(self, request, view, obj):
        # Read permissions are allowed for all authenticated users
        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            return True
        
        # For postmarks, check if user is in responsible group
        if isinstance(obj, Postmark):
            responsible_groups = obj.get_responsible_groups()
            user_groups = request.user.groups.all()
            return any(group in responsible_groups for group in user_groups)
        
        # For other objects, allow if authenticated
        return request.user and request.user.is_authenticated


# ========== GEOGRAPHIC HIERARCHY VIEWSETS ==========

class PostalFacilityViewSet(viewsets.ModelViewSet):
    """
    ViewSet for postal facilities (stable containers)
    """
    queryset = PostalFacility.objects.all().select_related(
        'created_by', 'modified_by'
    ).prefetch_related('identities')
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['reference_code']
    search_fields = ['reference_code']
    ordering_fields = ['reference_code', 'created_date']
    ordering = ['reference_code']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return PostalFacilityListSerializer
        return PostalFacilitySerializer
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)
    
    @action(detail=True, methods=['get'])
    def identities_timeline(self, request, pk=None):
        """Get all historical identities for this facility"""
        facility = self.get_object()
        identities = facility.identities.all().order_by('effective_from_date')
        serializer = PostalFacilityIdentitySerializer(identities, many=True, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def identity_at_date(self, request, pk=None):
        """Get identity at a specific date"""
        facility = self.get_object()
        date_str = request.query_params.get('date')
        
        if not date_str:
            return Response(
                {'error': 'date parameter required (YYYY-MM-DD)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            target_date = date.fromisoformat(date_str)
            identity = facility.get_identity_at_date(target_date)
            if identity:
                serializer = PostalFacilityIdentitySerializer(identity, context={'request': request})
                return Response(serializer.data)
            return Response(
                {'error': f'No identity found for {date_str}'},
                status=status.HTTP_404_NOT_FOUND
            )
        except ValueError:
            return Response(
                {'error': 'Invalid date format, use YYYY-MM-DD'},
                status=status.HTTP_400_BAD_REQUEST
            )


class PostalFacilityIdentityViewSet(viewsets.ModelViewSet):
    """ViewSet for postal facility identities"""
    queryset = PostalFacilityIdentity.objects.all().select_related(
        'postal_facility', 'created_by', 'modified_by'
    )
    serializer_class = PostalFacilityIdentitySerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['postal_facility', 'facility_type', 'is_operational']
    search_fields = ['facility_name']
    ordering_fields = ['effective_from_date', 'facility_name']
    ordering = ['-effective_from_date']


class AdministrativeUnitViewSet(viewsets.ModelViewSet):
    """
    ViewSet for administrative units (stable containers)
    """
    queryset = AdministrativeUnit.objects.all().select_related(
        'created_by', 'modified_by'
    ).prefetch_related('identities', 'responsibilities__group')
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['reference_code']
    search_fields = ['reference_code']
    ordering_fields = ['reference_code', 'created_date']
    ordering = ['reference_code']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return AdministrativeUnitListSerializer
        return AdministrativeUnitSerializer
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)
    
    @action(detail=True, methods=['get'])
    def identities_timeline(self, request, pk=None):
        """Get all historical identities for this unit"""
        unit = self.get_object()
        identities = unit.identities.all().order_by('effective_from_date')
        serializer = AdministrativeUnitIdentitySerializer(identities, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def children(self, request, pk=None):
        """Get all child administrative units (current)"""
        parent = self.get_object()
        # Get identities where this unit is the parent
        child_identities = AdministrativeUnitIdentity.objects.filter(
            parent_administrative_unit=parent,
            effective_to_date__isnull=True
        )
        # Get the administrative units
        child_units = [identity.administrative_unit for identity in child_identities]
        serializer = AdministrativeUnitListSerializer(child_units, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def facilities(self, request, pk=None):
        """Get all facilities currently in this administrative unit"""
        unit = self.get_object()
        current_affiliations = JurisdictionalAffiliation.objects.filter(
            administrative_unit=unit,
            effective_to_date__isnull=True
        ).select_related('postal_facility_identity__postal_facility')
        
        facilities = [aff.postal_facility_identity.postal_facility for aff in current_affiliations]
        serializer = PostalFacilityListSerializer(facilities, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def responsible_groups(self, request, pk=None):
        """Get groups responsible for this unit"""
        unit = self.get_object()
        responsibilities = unit.responsibilities.filter(is_active=True)
        serializer = AdministrativeUnitResponsibilitySerializer(responsibilities, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def my_responsibilities(self, request):
        """Get administrative units the current user's groups are responsible for"""
        user_groups = request.user.groups.all()
        responsibilities = AdministrativeUnitResponsibility.objects.filter(
            group__in=user_groups,
            is_active=True
        ).select_related('administrative_unit')
        
        units = [resp.administrative_unit for resp in responsibilities]
        serializer = AdministrativeUnitListSerializer(units, many=True)
        return Response(serializer.data)


class AdministrativeUnitIdentityViewSet(viewsets.ModelViewSet):
    """ViewSet for administrative unit identities"""
    queryset = AdministrativeUnitIdentity.objects.all().select_related(
        'administrative_unit', 'parent_administrative_unit', 'created_by'
    )
    serializer_class = AdministrativeUnitIdentitySerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['administrative_unit', 'unit_type', 'change_reason']
    ordering = ['-effective_from_date']


class AdministrativeUnitResponsibilityViewSet(viewsets.ModelViewSet):
    """ViewSet for managing group responsibilities"""
    queryset = AdministrativeUnitResponsibility.objects.all().select_related(
        'administrative_unit', 'group', 'created_by', 'modified_by'
    )
    serializer_class = AdministrativeUnitResponsibilitySerializer
    permission_classes = [IsAuthenticated]  # Only authenticated users can manage
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['administrative_unit', 'group', 'is_active']
    ordering = ['administrative_unit']
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class JurisdictionalAffiliationViewSet(viewsets.ModelViewSet):
    """ViewSet for jurisdictional affiliations"""
    queryset = JurisdictionalAffiliation.objects.all().select_related(
        'postal_facility_identity', 'administrative_unit', 'created_by', 'modified_by'
    )
    serializer_class = JurisdictionalAffiliationSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['postal_facility_identity', 'administrative_unit']
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
    ViewSet for postmarks with group-based permission checking
    """
    queryset = Postmark.objects.all().select_related(
        'postal_facility_identity__postal_facility',
        'postmark_shape', 'lettering_style', 'framing_style',
        'date_format', 'created_by', 'modified_by'
    ).prefetch_related(
        'postmark_colors__color', 'dates_seen', 'sizes',
        'valuations', 'images', 'publication_references__postmark_publication'
    )
    permission_classes = [IsAuthenticatedOrReadOnly, IsResponsibleForRegion]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = {
        'postal_facility_identity': ['exact'],
        'postmark_shape': ['exact'],
        'lettering_style': ['exact'],
        'framing_style': ['exact'],
        'rate_location': ['exact'],
        'rate_value': ['exact', 'icontains'],
        'is_manuscript': ['exact'],
    }
    search_fields = ['postmark_key', 'postal_facility_identity__facility_name',
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
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def my_region(self, request):
        """Get postmarks from regions the user's groups are responsible for"""
        user_groups = request.user.groups.all()
        
        # Get administrative units user's groups are responsible for
        responsibilities = AdministrativeUnitResponsibility.objects.filter(
            group__in=user_groups,
            is_active=True
        )
        responsible_units = [resp.administrative_unit for resp in responsibilities]
        
        # Get current affiliations for these units
        affiliations = JurisdictionalAffiliation.objects.filter(
            administrative_unit__in=responsible_units,
            effective_to_date__isnull=True
        ).select_related('postal_facility_identity')
        
        # Get postmarks from these facility identities
        facility_identities = [aff.postal_facility_identity for aff in affiliations]
        postmarks = self.get_queryset().filter(
            postal_facility_identity__in=facility_identities
        )
        
        page = self.paginate_queryset(postmarks)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(postmarks, many=True)
        return Response(serializer.data)
    
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
    def by_facility(self, request):
        """Get postmarks grouped by facility"""
        facility_id = request.query_params.get('facility_id')
        if not facility_id:
            return Response({'error': 'facility_id parameter is required'},
                          status=status.HTTP_400_BAD_REQUEST)
        
        # Get all identities for this facility
        identities = PostalFacilityIdentity.objects.filter(postal_facility_id=facility_id)
        postmarks = self.get_queryset().filter(postal_facility_identity__in=identities)
        serializer = self.get_serializer(postmarks, many=True)
        return Response(serializer.data)


class PostmarkImageViewSet(viewsets.ModelViewSet):
    """ViewSet for postmark images"""
    queryset = PostmarkImage.objects.all().select_related('postmark', 'created_by', 'modified_by')
    serializer_class = PostmarkImageSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['postmark', 'image_view']
    ordering_fields = ['display_order', 'created_date']
    ordering = ['display_order']
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve an image (requires regional permission)"""
        image = self.get_object()
        
        # Check if user is in responsible group
        responsible_groups = image.postmark.get_responsible_groups()
        user_groups = request.user.groups.all()
        
        if not any(group in responsible_groups for group in user_groups):
            return Response(
                {'error': 'You are not responsible for this region'},
                status=status.HTTP_403_FORBIDDEN
            )

        image.save()
        return Response({'status': 'image approved'})
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject an image (requires regional permission)"""
        image = self.get_object()
        
        # Check if user is in responsible group
        responsible_groups = image.postmark.get_responsible_groups()
        user_groups = request.user.groups.all()
        
        if not any(group in responsible_groups for group in user_groups):
            return Response(
                {'error': 'You are not responsible for this region'},
                status=status.HTTP_403_FORBIDDEN
            )

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
    """ViewSet for postcovers"""
    queryset = Postcover.objects.all().select_related(
        'owner_user', 'created_by', 'modified_by'
    ).prefetch_related(
        'postcover_postmarks__postmark',
        'images'
    )
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['owner_user']
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

###################################################################################################
