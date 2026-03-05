###################################################################################################
## WoCo Commons - API Views
## MPC: 2025/11/15
###################################################################################################
import csv
import hashlib
import io
import os
import re
import uuid
from datetime import date

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.utils.text import slugify
from django.db.models import Q, Count, Prefetch
from django.db.utils import ProgrammingError, OperationalError
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

from rest_framework import viewsets, filters, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated, IsAdminUser, BasePermission, AllowAny
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from django_filters.rest_framework import DjangoFilterBackend

from django.contrib.auth import get_user_model
from woco.pagination import PageSizePagination, LargePageSizePagination, PostmarkListPagination

from .models import (
    PostalFacility, PostalFacilityIdentity,
    AdministrativeUnit, AdministrativeUnitIdentity, AdministrativeUnitResponsibility,
    JurisdictionalAffiliation,
    PostmarkShape, LetteringStyle, FramingStyle, Color, DateFormat,
    Postmark, PostmarkColor, PostmarkDatesSeen, PostmarkSize,
    PostmarkValuation, PostmarkPublication, PostmarkPublicationReference,
    PostmarkImage, Postcover, PostcoverPostmark, PostcoverImage,
    AdminCsvUpload, CatalogContributionRequest,
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
    PostcoverImageSerializer,
    AdminCsvUploadListSerializer, AdminCsvUploadSerializer,
    LoginRequestSerializer,
)
from .filters import PostmarkListFilter
from .csv_import import IMPORTERS
from .contributions import (
    get_contribution_user,
    create_postmark_from_contribution,
    update_postmark_from_contribution,
)


# ========== AUTH (SESSION LOGIN FOR SPA) ==========


@method_decorator(csrf_exempt, name="dispatch")
class LoginView(APIView):
    """Session login for frontend when Supabase is not used. Accepts username or email + password."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username") or request.data.get("email") or ""
        password = request.data.get("password") or ""
        username = username.strip()
        if not username or not password:
            return Response(
                {"detail": "Username and password required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = authenticate(request, username=username, password=password)
        if user is None and "@" in username:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                u = User.objects.get(email__iexact=username)
                user = authenticate(request, username=u.username, password=password)
            except (User.DoesNotExist, User.MultipleObjectsReturned):
                pass
        if user is None:
            return Response(
                {"detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not user.is_active:
            return Response(
                {"detail": "Account is disabled."},
                status=status.HTTP_403_FORBIDDEN,
            )
        login(request, user)
        return Response({
            "user": {
                "id": user.pk,
                "username": user.username,
                "email": getattr(user, "email", "") or "",
                "is_staff": getattr(user, "is_staff", False),
            },
        })


class CurrentUserView(APIView):
    """Return current user when authenticated via session (for SPA auth state)."""
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        user = request.user
        return Response({
            "user": {
                "id": user.pk,
                "username": user.username,
                "email": getattr(user, "email", "") or "",
                "is_staff": getattr(user, "is_staff", False),
            },
        })


@method_decorator(csrf_exempt, name="dispatch")
class LogoutView(APIView):
    """Session logout for SPA."""
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name="dispatch")
class LoginRequestView(APIView):
    """
    Public API for users to request login access.
    Creates User directly (is_active=False). Admin sets username/password and activates in Users.
    """
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        User = get_user_model()
        email = data['email'].strip().lower()
        user = User(
            username=email,
            email=email,
            first_name=data['first_name'].strip(),
            last_name=data['last_name'].strip(),
            is_active=False,
        )
        user.set_unusable_password()
        user.save()
        return Response(
            {"detail": "Request submitted. An admin will provide your username and password."},
            status=status.HTTP_201_CREATED,
        )


def _save_contribution_image(uploaded_file):
    """
    Save uploaded image to media/postmarks/contributions/ and return metadata for PostmarkImage.
    Returns dict with storage_filename, original_filename, file_checksum, mime_type,
    image_width, image_height, file_size_bytes, or None if invalid/failed.
    """
    if not uploaded_file or not getattr(uploaded_file, "read", None):
        return None
    allowed_types = {"image/png", "image/jpeg", "image/jpg", "image/tiff"}
    content_type = getattr(uploaded_file, "content_type", "") or ""
    if content_type not in allowed_types:
        return None
    max_size_bytes = 10 * 1024 * 1024  # 10 MB
    uploaded_file.seek(0)
    content = uploaded_file.read()
    if len(content) > max_size_bytes:
        return None
    if not content:
        return None
    uploaded_file.seek(0)
    try:
        from PIL import Image as PILImage
    except ImportError:
        return None
    # Checksum
    file_checksum = hashlib.sha256(content).hexdigest()
    # Unique storage path: contributions/<uuid>.<ext>
    ext = "jpg"
    if "png" in content_type:
        ext = "png"
    elif "tiff" in content_type:
        ext = "tiff"
    storage_name = f"contributions/{uuid.uuid4().hex}.{ext}"
    media_dir = os.path.join(settings.MEDIA_ROOT, "postmarks")
    sub_dir = os.path.join(media_dir, "contributions")
    os.makedirs(sub_dir, exist_ok=True)
    file_path = os.path.join(media_dir, storage_name)
    with open(file_path, "wb") as f:
        f.write(content)
    # Dimensions
    try:
        img = PILImage.open(io.BytesIO(content))
        width, height = img.size
    except Exception:
        width, height = 0, 0
    return {
        "storage_filename": storage_name,
        "original_filename": getattr(uploaded_file, "name", "image")[:255] or "image",
        "file_checksum": file_checksum,
        "mime_type": content_type[:50],
        "image_width": width,
        "image_height": height,
        "file_size_bytes": len(content),
    }


@method_decorator(csrf_exempt, name="dispatch")
class ContributionView(APIView):
    """
    Public API to submit a catalog entry. Writes directly into the catalog tables
    (Postmark and related) so the entry appears in catalog search. No separate contribution table.
    Accepts JSON or multipart/form-data; when 'image' file is present, saves it and links to the new postmark.
    """
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def post(self, request):
        data = request.data or {}
        edit_postmark_id = data.get("editPostmarkId") or data.get("edit_postmark_id")
        try:
            edit_postmark_id = int(edit_postmark_id) if edit_postmark_id is not None else None
        except (TypeError, ValueError):
            edit_postmark_id = None

        state = (data.get("state") or "").strip()
        town = (data.get("town") or "").strip()
        first_seen = (data.get("firstSeen") or "").strip()
        last_seen = (data.get("lastSeen") or "").strip()
        type_val = (data.get("type") or "").strip()
        color = (data.get("color") or "").strip()
        if not state or not town or not first_seen or not type_val or not color:
            return Response(
                {"detail": "Missing required fields: state, town, firstSeen, type, color."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        date_range = f"{first_seen}-{last_seen}" if last_seen else first_seen
        submitter_name = (data.get("submitterName") or "").strip()
        payload = {
            "state": state,
            "town": town,
            "date_range": date_range,
            "type": type_val,
            "color": color,
            "manuscript": (data.get("manuscript") or "").strip(),
            "dimensions": (data.get("dimensions") or "").strip(),
            "description": (data.get("description") or "").strip(),
            "references": (data.get("references") or "").strip(),
            "rarity": (data.get("rarity") or "").strip(),
            "submitter_name": submitter_name,
        }
        # Optional image upload
        image_file = request.FILES.get("image")
        if image_file:
            image_meta = _save_contribution_image(image_file)
            if image_meta:
                payload["image_meta"] = image_meta

        # New or updated contribution: create a pending CatalogContributionRequest instead of
        # immediately modifying the catalog. Admin approval is required to apply changes.
        system_user = get_contribution_user()
        if not system_user:
            return Response(
                {"detail": "Could not create contribution request. Ensure the database has at least one user."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        action = "UPDATE" if edit_postmark_id is not None else "CREATE"
        postmark = None
        if edit_postmark_id is not None:
            postmark = Postmark.objects.filter(postmark_id=edit_postmark_id).first()
            if not postmark:
                return Response(
                    {"detail": "Catalog entry not found for update."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        request_obj = CatalogContributionRequest.objects.create(
            submitter_name=submitter_name or "",
            submitter_email=(data.get("submitterEmail") or "").strip(),
            state=state,
            town=town,
            first_seen=first_seen,
            last_seen=last_seen,
            type=type_val,
            color=color,
            manuscript=(data.get("manuscript") or "").strip(),
            dimensions=(data.get("dimensions") or "").strip(),
            description=(data.get("description") or "").strip(),
            references=(data.get("references") or "").strip(),
            rarity=(data.get("rarity") or "").strip(),
            raw_payload=payload,
            action=action,
            postmark=postmark,
            created_by=system_user,
            modified_by=system_user,
        )
        return Response(
            {
                "detail": "Submission sent. An admin will review your request.",
                "requestId": request_obj.catalog_contribution_request_id,
                "status": request_obj.status,
                "postmarkId": edit_postmark_id,
            },
            status=status.HTTP_201_CREATED,
        )


# ========== CUSTOM PERMISSIONS ==========

class IsResponsibleForRegion(BasePermission):
    """
    Permission check: User must be in a group responsible for the postmark's region.
    Exception: submitters may delete (and update) their own user-contribution postmarks.
    """
    def has_object_permission(self, request, view, obj):
        # Read permissions are allowed for all authenticated users
        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            return True
        
        # For postmarks, check if user is in responsible group
        if isinstance(obj, Postmark):
            # Allow submitter to delete or update their own user contribution
            if obj.source_catalog == "User contribution" and obj.other_characteristics:
                submitter_needles = [
                    f"Submitted by: {request.user.username}",
                    f"Submitted by: {getattr(request.user, 'email', '') or ''}",
                ]
                if any(
                    needle in (obj.other_characteristics or "")
                    for needle in submitter_needles
                    if needle.strip() != "Submitted by:"
                ):
                    return True
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
    ViewSet for administrative units (stable containers).
    Uses larger max page_size so filter dropdowns can request all states in one call.
    """
    pagination_class = LargePageSizePagination
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

def _postmark_list_queryset():
    """Optimized queryset for postmark list: prefetches only data needed by PostmarkListSerializer.
    Uses .only() to fetch minimal fields, reducing data transfer and serialization overhead.
    """
    current_identities = AdministrativeUnitIdentity.objects.filter(
        effective_to_date__isnull=True
    ).only('administrative_unit_id', 'unit_name', 'unit_abbreviation', 'effective_from_date')
    
    current_jurisdictions = JurisdictionalAffiliation.objects.filter(
        Q(effective_to_date__isnull=True) | Q(effective_to_date__gte=timezone.now().date())
    ).select_related('administrative_unit').prefetch_related(
        Prefetch('administrative_unit__identities', queryset=current_identities),
    ).only(
        'postal_facility_identity_id',
        'administrative_unit_id',
        'effective_from_date',
        'effective_to_date',
        'administrative_unit__reference_code',
    )
    
    return Postmark.objects.all().select_related(
        'postal_facility_identity',
        'postmark_shape',
        'state',
    ).prefetch_related(
        'postmark_colors__color',
        'dates_seen',
        'valuations',
        Prefetch('images', queryset=PostmarkImage.objects.filter(display_order=0).only(
            'postmark_image_id', 'postmark_id', 'storage_filename', 'image_view', 'display_order'
        )),
        Prefetch('postal_facility_identity__jurisdictions', queryset=current_jurisdictions),
        Prefetch('state__identities', queryset=current_identities),
    ).only(
        'postmark_id',
        'postmark_key',
        'postal_facility_identity_id',
        'postmark_shape_id',
        'state_id',
        'rate_location',
        'rate_value',
        'is_manuscript',
        'created_date',
        'postal_facility_identity__facility_name',
        'postmark_shape__shape_name',
        'state__reference_code',
    )


class PostmarkViewSet(viewsets.ModelViewSet):
    """
    ViewSet for postmarks with group-based permission checking.
    List is paginated: 10 per page (honors ?page_size= up to 100).
    Supports ?include_count=false to skip the COUNT query for faster first load.
    """
    pagination_class = PostmarkListPagination
    queryset = Postmark.objects.all()  # Base queryset; get_queryset() returns optimized version
    permission_classes = [IsAuthenticatedOrReadOnly, IsResponsibleForRegion]

    def get_queryset(self):
        return _postmark_list_queryset()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = PostmarkListFilter
    # Search only by name (postmark_key); town, state, type, color have their own filters
    search_fields = ['postmark_key']
    ordering_fields = ['postmark_key', 'created_date', 'rate_value']
    ordering = ['-created_date']  # Newest first for catalog search list
    
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


class MyCatalogRequestsView(APIView):
    """
    API to fetch catalog contribution requests submitted by a given submitter.
    Frontend passes ?submitter=<username-or-email>.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        submitter = (request.query_params.get('submitter') or '').strip()
        if not submitter:
            return Response(
                {"detail": "submitter query parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            qs = CatalogContributionRequest.objects.filter(
                Q(submitter_name__iexact=submitter) | Q(submitter_email__iexact=submitter)
            ).order_by('-created_date')
        except (ProgrammingError, OperationalError):
            # If the CatalogContributionRequests table does not exist yet on a deployed
            # database, fail gracefully with an empty list rather than a 500 error.
            return Response([])

        results = []
        for obj in qs:
            results.append(
                {
                    "id": obj.catalog_contribution_request_id,
                    "state": obj.state,
                    "town": obj.town,
                    "firstSeen": obj.first_seen,
                    "lastSeen": obj.last_seen,
                    "type": obj.type,
                    "color": obj.color,
                    "manuscript": obj.manuscript,
                    "dimensions": obj.dimensions,
                    "description": obj.description,
                    "references": obj.references,
                    "rarity": obj.rarity,
                    "status": obj.status,
                    "createdAt": obj.created_date,
                    "postmarkId": obj.postmark_id,
                }
            )
        return Response(results)


class CatalogRequestDetailView(APIView):
    """
    Detail/update/delete for a single catalog contribution request.
    Only the original submitter (matching username or email) or a staff user
    may access it. Updates and deletes are only permitted while there is no
    linked catalog Postmark (i.e., before approval has been applied).
    """
    permission_classes = [IsAuthenticated]

    def _get_object_for_user(self, pk, user):
        try:
            obj = CatalogContributionRequest.objects.get(pk=pk)
        except CatalogContributionRequest.DoesNotExist:
            return None

        # Staff users may access any request
        if getattr(user, "is_staff", False):
            return obj

        user_ids = {
            (getattr(user, "username", "") or "").strip().lower(),
            (getattr(user, "email", "") or "").strip().lower(),
        }
        submitter_ids = {
            (obj.submitter_name or "").strip().lower(),
            (obj.submitter_email or "").strip().lower(),
        }
        # Only allow if the current user matches the submitter by username or email
        if user_ids.intersection(submitter_ids):
            return obj
        return None

    def get(self, request, pk):
        obj = self._get_object_for_user(pk, request.user)
        if not obj:
            return Response(status=status.HTTP_404_NOT_FOUND)

        data = {
            "id": obj.catalog_contribution_request_id,
            "state": obj.state,
            "town": obj.town,
            "firstSeen": obj.first_seen,
            "lastSeen": obj.last_seen,
            "type": obj.type,
            "color": obj.color,
            "manuscript": obj.manuscript,
            "dimensions": obj.dimensions,
            "description": obj.description,
            "references": obj.references,
            "rarity": obj.rarity,
            "status": obj.status,
            "createdAt": obj.created_date,
            "postmarkId": obj.postmark_id,
            "submitterName": obj.submitter_name,
            "submitterEmail": obj.submitter_email,
        }
        return Response(data)

    def put(self, request, pk):
        obj = self._get_object_for_user(pk, request.user)
        if not obj:
            return Response(status=status.HTTP_404_NOT_FOUND)

        # Do not allow edits once a catalog Postmark has been linked
        if obj.postmark_id is not None:
            return Response(
                {"detail": "This request has already been applied to the catalog and cannot be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = request.data or {}
        # Required core fields mirror ContributionView
        state = (data.get("state") or "").strip()
        town = (data.get("town") or "").strip()
        first_seen = (data.get("firstSeen") or "").strip()
        last_seen = (data.get("lastSeen") or "").strip()
        type_val = (data.get("type") or "").strip()
        color = (data.get("color") or "").strip()
        if not state or not town or not first_seen or not type_val or not color:
            return Response(
                {"detail": "Missing required fields: state, town, firstSeen, type, color."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        obj.state = state
        obj.town = town
        obj.first_seen = first_seen
        obj.last_seen = last_seen
        obj.type = type_val
        obj.color = color
        obj.manuscript = (data.get("manuscript") or "").strip()
        obj.dimensions = (data.get("dimensions") or "").strip()
        obj.description = (data.get("description") or "").strip()
        obj.references = (data.get("references") or "").strip()
        obj.rarity = (data.get("rarity") or "").strip()

        # Keep raw_payload in sync where possible
        payload = dict(obj.raw_payload or {})
        date_range = f"{first_seen}-{last_seen}".strip("-")
        payload.update(
            {
                "state": state,
                "town": town,
                "date_range": date_range,
                "type": type_val,
                "color": color,
                "manuscript": obj.manuscript,
                "dimensions": obj.dimensions,
                "description": obj.description,
                "references": obj.references,
                "rarity": obj.rarity,
                "submitter_name": obj.submitter_name,
            }
        )
        obj.raw_payload = payload
        obj.modified_by = obj.modified_by or request.user  # safeguard; normally a system user
        obj.save()

        return self.get(request, pk)

    def delete(self, request, pk):
        obj = self._get_object_for_user(pk, request.user)
        if not obj:
            return Response(status=status.HTTP_404_NOT_FOUND)

        # Do not allow delete once applied to catalog
        if obj.postmark_id is not None:
            return Response(
                {"detail": "This request has already been applied to the catalog and cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # Catalog action commented out: keep only list + pagination (PageSizePagination in settings)
    # @action(detail=False, methods=['get'], url_path='catalog')
    # def catalog(self, request): ...


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


# ========== ADMIN CSV UPLOADS (STAFF ONLY) ==========


def _parse_csv_file(file) -> dict:
    """Parse CSV file (handles quoted newlines). Returns { headers: [...], rows: [[...], ...] }."""
    content = file.read()
    if isinstance(content, bytes):
        content = content.decode('utf-8', errors='replace')
    reader = csv.reader(io.StringIO(content), quoting=csv.QUOTE_MINIMAL)
    rows = list(reader)
    if not rows:
        return {'headers': [], 'rows': []}
    return {'headers': rows[0], 'rows': rows[1:]}


class SessionAuthenticationNoCSRF(SessionAuthentication):
    """Session auth without CSRF check; use only for admin CSV upload/import (staff-only)."""

    def enforce_csrf(self, request):
        pass  # Skip so SPA can POST import-to-catalog without CSRF token


class AdminCsvUploadViewSet(viewsets.ModelViewSet):
    """
    Staff-only: upload CSV files and view parsed data.
    POST multipart/form-data with key "file" (the CSV file).
    CSRF not enforced so SPA can POST without token (protected by IsAdminUser).
    """
    authentication_classes = [SessionAuthenticationNoCSRF]
    permission_classes = [IsAuthenticated, IsAdminUser]
    queryset = AdminCsvUpload.objects.all().select_related('uploaded_by').order_by('-uploaded_at')
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ['get', 'post', 'head', 'options', 'delete']

    @classmethod
    def as_view(cls, *args, **kwargs):
        """Wrap so the view function Django's CSRF middleware sees is exempt (SPA cross-origin)."""
        view = super().as_view(*args, **kwargs)
        return csrf_exempt(view)

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == 'list':
            # Don't load the large Data JSON so MySQL and responses stay fast
            qs = qs.only('id', 'name', 'file_name', 'uploaded_at', 'uploaded_by_id', 'row_count')
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return AdminCsvUploadListSerializer
        return AdminCsvUploadSerializer

    def create(self, request, *args, **kwargs):
        csv_file = request.FILES.get('file')
        if not csv_file:
            return Response(
                {'detail': 'No file provided. Send multipart/form-data with key "file".'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        name = request.data.get('name') or csv_file.name or 'Unnamed upload'
        try:
            data = _parse_csv_file(csv_file)
        except Exception as e:
            return Response(
                {'detail': f'Failed to parse CSV: {e!s}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obj = AdminCsvUpload.objects.create(
            name=name,
            file_name=csv_file.name or 'upload.csv',
            uploaded_by=request.user if request.user.is_authenticated else None,
            data=data,
        )
        serializer = AdminCsvUploadSerializer(obj)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='import-to-catalog')
    def import_to_catalog(self, request, pk=None):
        """
        Import this CSV upload into catalog tables.
        POST body: { "import_type": "states" | "lettering" | "framing" | "date_format" | "colors" }
        """
        obj = self.get_object()
        import_type = (request.data.get('import_type') or '').strip().lower()
        if not import_type:
            return Response(
                {'detail': 'Missing import_type. Use one of: states, lettering, framing, date_format, colors.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if import_type not in IMPORTERS:
            return Response(
                {'detail': f'Unknown import_type: {import_type}. Use one of: {", ".join(IMPORTERS)}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = request.user
        if not user.is_authenticated:
            return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

        data = obj.data or {}
        try:
            result = IMPORTERS[import_type](data, user)
        except Exception as e:
            return Response(
                {'detail': f'Import failed: {e!s}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(result, status=status.HTTP_200_OK)

###################################################################################################
