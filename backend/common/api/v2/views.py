###################################################################################################
## WoCo Commons - API v2 Views (Phase 2 rewrite)
##
## Unified Marking model with type discriminator (TOWNMARK | RATEMARK | AUXMARK).
## CoverMarking carries placement; CoverDate / CoverValuation belong to Cover.
## Image is polymorphic over (subject_type, subject_id). Citation references
## COVER | MARKING.
###################################################################################################
from __future__ import annotations

import os
import uuid

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import ProgrammingError, transaction
from django.db.models import Min, Max, Q
from django.db.models.functions import ExtractYear
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import (
    AllowAny,
    BasePermission,
    IsAdminUser,
    IsAuthenticated,
    IsAuthenticatedOrReadOnly,
)
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer

from common.audit import (
    build_marking_snapshot,
    create_marking_version,
    log_submission_transaction,
    restore_marking_from_snapshot,
)
from common.filters import MarkingListFilter
from common.models import (
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
    MarkingVersion,
    PostOffice,
    ReferenceWork,
    Region,
    Shape,
    SubmissionTransaction,
)
from woco.pagination import MarkingListPagination

from .permissions import (
    REVIEW_CONTRIBUTION_PERM,
    CanManageReferenceWorks,
    CanReviewContribution,
    user_assigned_collection_ids,
)
from .serializers import (
    CitationSerializer,
    CollectionSerializer,
    ColorSerializer,
    ContributionApproveRejectSerializer,
    ContributionDetailSerializer,
    ContributionListSerializer,
    CoverDateSerializer,
    CoverMarkingSerializer,
    CoverSerializer,
    CoverValuationSerializer,
    FAQEntrySerializer,
    ImageSerializer,
    LetteringSerializer,
    MarkingListSerializer,
    MarkingSerializer,
    PostOfficeSerializer,
    ReferenceWorkSerializer,
    RegionSerializer,
    ShapeSerializer,
)


User = get_user_model()


###################################################################################################
## Helpers
###################################################################################################
def _get_user_assigned_regions(user):
    if not user or not user.is_authenticated:
        return Region.objects.none()
    return Region.objects.filter(collection__editor_assignments__user=user).distinct()


def _user_is_responsible_for_marking(user, marking):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if not user.has_perm(REVIEW_CONTRIBUTION_PERM):
        return False
    if not marking or not marking.post_office_id:
        return False
    region_id = marking.post_office.region_id
    return _get_user_assigned_regions(user).filter(pk=region_id).exists()


class IsResponsibleForRegion(BasePermission):
    """
    Object-level write check for Marking-bound resources.
    Reads pass; writes require the user to be assigned to the marking's
    region (or be a superuser).
    """

    def has_permission(self, request, view):
        if request.method in {"GET", "HEAD", "OPTIONS"}:
            return True
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in {"GET", "HEAD", "OPTIONS"}:
            return True
        marking = obj if isinstance(obj, Marking) else getattr(obj, "marking", None)
        return _user_is_responsible_for_marking(request.user, marking)


def _marking_list_queryset():
    """Optimized queryset for Marking list-style endpoints with date-range annotations."""
    return Marking.objects.all().select_related(
        "post_office__region", "shape", "lettering", "color"
    ).annotate(
        earliest_seen=Min("cover_markings__cover__cover_dates__date"),
        latest_seen=Max("cover_markings__cover__cover_dates__date"),
    )


###################################################################################################
## Lookup viewsets (read-only or simple CRUD)
###################################################################################################
class ColorViewSet(viewsets.ModelViewSet):
    queryset = Color.objects.all()
    serializer_class = ColorSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name"]
    ordering = ["name"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class RegionViewSet(viewsets.ModelViewSet):
    """Regions; supports ?assigned_only=true to scope to the user's Collections."""
    queryset = Region.objects.all().select_related("parent_region")
    serializer_class = RegionSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["region_tier", "parent_region"]
    search_fields = ["name", "abbrev"]
    ordering_fields = ["name", "abbrev", "established_date", "defunct_date", "created_date"]
    ordering = ["name"]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("assigned_only", "").lower() != "true":
            return qs
        user = self.request.user
        if not user or not user.is_authenticated:
            return qs.none()
        if user.is_superuser:
            return qs
        return qs.filter(collection__editor_assignments__user=user).distinct()

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if request.query_params.get("assigned_only", "").lower() == "true":
            response["Cache-Control"] = "no-store, private, max-age=0"
        return response

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class PostOfficeViewSet(viewsets.ModelViewSet):
    queryset = PostOffice.objects.all().select_related("region")
    serializer_class = PostOfficeSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["region"]
    search_fields = ["name", "region__name", "region__abbrev"]
    ordering_fields = ["name", "created_date"]
    ordering = ["name"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)

    @action(detail=False, methods=["get"], url_path="town-options")
    def town_options(self, request):
        """Lightweight {town, state} payload for autocomplete controls."""
        rows = (
            PostOffice.objects.select_related("region")
            .exclude(name__isnull=True)
            .exclude(name__exact="")
            .values_list("name", "region__name")
            .order_by("name", "region__name")
        )
        out = [
            {"town": (town or "").strip(), "state": (state or "").strip()}
            for town, state in rows
        ]
        return Response(out, status=status.HTTP_200_OK)


class LetteringViewSet(viewsets.ModelViewSet):
    queryset = Lettering.objects.all()
    serializer_class = LetteringSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["name", "created_date"]
    ordering = ["name"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class ShapeViewSet(viewsets.ModelViewSet):
    queryset = Shape.objects.all()
    serializer_class = ShapeSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "code"]
    ordering_fields = ["name", "code", "created_date"]
    ordering = ["name"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class ReferenceWorkViewSet(viewsets.ModelViewSet):
    """Reads: any authenticated user. Writes: Editors / Administrators."""
    queryset = ReferenceWork.objects.all()
    serializer_class = ReferenceWorkSerializer
    permission_classes = [CanManageReferenceWorks]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["publication_year"]
    search_fields = ["code", "title", "authorship", "publisher", "edition", "volume", "isbn"]
    ordering_fields = ["title", "publication_year", "created_date"]
    ordering = ["title"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class FAQEntryViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only FAQ for the public SPA homepage."""
    queryset = FAQEntry.objects.filter(is_active=True).order_by("display_order", "faq_entry_id")
    serializer_class = FAQEntrySerializer
    permission_classes = [AllowAny]

    def list(self, request, *args, **kwargs):
        try:
            return super().list(request, *args, **kwargs)
        except ProgrammingError:
            return Response({"count": 0, "next": None, "previous": None, "results": []})


###################################################################################################
## Image (polymorphic over COVER | MARKING)
###################################################################################################
class ImageViewSet(viewsets.ModelViewSet):
    """
    Polymorphic image API. Filter by `?subject_type=MARKING&subject_id=<id>`
    or `?subject_type=COVER&subject_id=<id>`.
    """
    queryset = Image.objects.all().select_related("uploaded_by")
    serializer_class = ImageSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["subject_type", "subject_id", "image_view"]
    ordering_fields = ["display_order", "created_date"]
    ordering = ["subject_type", "subject_id", "display_order"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


###################################################################################################
## Citation (subject_type COVER | MARKING)
###################################################################################################
class CitationViewSet(viewsets.ModelViewSet):
    queryset = Citation.objects.all().select_related("reference_work")
    serializer_class = CitationSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["reference_work", "subject_type", "subject_id"]
    search_fields = ["citation_detail", "reference_work__title"]
    ordering_fields = ["reference_work", "subject_type", "subject_id", "created_date"]
    ordering = ["reference_work", "subject_type", "subject_id"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


###################################################################################################
## Cover, CoverDate, CoverValuation, CoverMarking
###################################################################################################
class CoverV2ViewSet(viewsets.ModelViewSet):
    queryset = Cover.objects.all().select_related("color")
    serializer_class = CoverSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["color", "type", "has_adhesive", "is_institutional"]
    ordering_fields = ["id", "code", "created_date"]
    ordering = ["id"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class CoverDateViewSet(viewsets.ModelViewSet):
    queryset = CoverDate.objects.all().select_related("cover")
    serializer_class = CoverDateSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["cover", "granularity"]
    ordering_fields = ["date", "created_date"]
    ordering = ["cover", "date"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class CoverValuationViewSet(viewsets.ModelViewSet):
    queryset = CoverValuation.objects.all().select_related("cover")
    serializer_class = CoverValuationSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["cover"]
    ordering_fields = ["appraisal_date", "amt"]
    ordering = ["-appraisal_date"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


class CoverMarkingViewSet(viewsets.ModelViewSet):
    queryset = (
        CoverMarking.objects.all()
        .select_related("cover", "cover__color", "marking")
        .prefetch_related("cover__cover_dates")
    )
    serializer_class = CoverMarkingSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["cover", "marking", "is_backstamp", "placement"]
    ordering_fields = ["id", "created_date"]
    ordering = ["id"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)


###################################################################################################
## Marking (unified TOWNMARK | RATEMARK | AUXMARK)
###################################################################################################
class MarkingViewSet(viewsets.ModelViewSet):
    """
    Unified marking ViewSet. Replaces PostmarkViewSet / RatemarkViewSet /
    AuxmarkViewSet. List supports `?type=TOWNMARK|RATEMARK|AUXMARK`
    and the legacy filters preserved on MarkingListFilter.
    """
    pagination_class = MarkingListPagination
    queryset = Marking.objects.all()
    permission_classes = [IsAuthenticatedOrReadOnly, IsResponsibleForRegion]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = MarkingListFilter
    search_fields = [
        "code",
        "catalog_txt",
        "inscription_txt",
        "desc",
        "post_office__region__name",
        "post_office__name",
        "shape__name",
        "lettering__name",
        "color__name",
    ]
    ordering_fields = [
        # Location / identity
        "post_office__region__name",
        "post_office__region__abbrev",
        "post_office__name",
        "code",
        "type",
        # Physical/editorial fields
        "shape__name",
        "lettering__name",
        "color__name",
        "width",
        "height",
        # Date range annotations
        "earliest_seen",
        "latest_seen",
        # Stable fallback
        "id",
    ]
    ordering = ["post_office__region__name", "post_office__name", "id"]

    def get_queryset(self):
        return _marking_list_queryset()

    def get_serializer_class(self):
        if self.action == "list":
            return MarkingListSerializer
        return MarkingSerializer

    def perform_create(self, serializer):
        marking = serializer.save(created_by=self.request.user, modified_by=self.request.user)
        after_snapshot = build_marking_snapshot(marking)
        txn = log_submission_transaction(
            action=SubmissionTransaction.ACTION_RECORD_CREATE,
            actor=self.request.user,
            contribution=getattr(marking, "contribution", None),
            marking=marking,
            source=SubmissionTransaction.SOURCE_EDITOR_PORTAL,
            before_payload={},
            after_payload=after_snapshot,
        )
        create_marking_version(marking, txn, self.request.user)

    def perform_update(self, serializer):
        before_snapshot = build_marking_snapshot(serializer.instance)
        marking = serializer.save(modified_by=self.request.user)
        after_snapshot = build_marking_snapshot(marking)
        txn = log_submission_transaction(
            action=SubmissionTransaction.ACTION_RECORD_UPDATE,
            actor=self.request.user,
            contribution=getattr(marking, "contribution", None),
            marking=marking,
            source=SubmissionTransaction.SOURCE_EDITOR_PORTAL,
            before_payload=before_snapshot,
            after_payload=after_snapshot,
        )
        create_marking_version(marking, txn, self.request.user)

    def perform_destroy(self, instance):
        before_snapshot = build_marking_snapshot(instance)
        log_submission_transaction(
            action=SubmissionTransaction.ACTION_RECORD_DELETE,
            actor=self.request.user,
            contribution=getattr(instance, "contribution", None),
            marking=instance,
            source=SubmissionTransaction.SOURCE_EDITOR_PORTAL,
            before_payload=before_snapshot,
            after_payload={},
            extra_payload={"deleted_marking_id": instance.pk},
        )
        super().perform_destroy(instance)

    @action(detail=False, methods=["get"], url_path="my-assigned", permission_classes=[IsAuthenticated])
    def my_assigned(self, request):
        user = request.user
        assigned_regions = _get_user_assigned_regions(user)
        if not assigned_regions.exists():
            empty = self.get_queryset().none()
            page = self.paginate_queryset(empty)
            if page is not None:
                serializer = self.get_serializer(page, many=True)
                return self.get_paginated_response(serializer.data)
            return Response(self.get_serializer(empty, many=True).data)
        qs = self.get_queryset().filter(post_office__region__in=assigned_regions).distinct().order_by("-created_date")
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=False, methods=["get"], url_path="my-submissions", permission_classes=[IsAuthenticated])
    def my_submissions(self, request):
        user = request.user
        qs = self.get_queryset().filter(contribution__contributor=user).order_by("-created_date")
        if not user.is_superuser:
            assigned_regions = _get_user_assigned_regions(user)
            if assigned_regions.exists():
                qs = qs.filter(post_office__region__in=assigned_regions)
            else:
                qs = qs.none()
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=True, methods=["get"], url_path="changelog", permission_classes=[IsAuthenticated])
    def changelog(self, request, pk=None):
        marking = self.get_object()
        if not _user_is_responsible_for_marking(request.user, marking):
            return Response(
                {"detail": "You are not allowed to view changelog for this record."},
                status=status.HTTP_403_FORBIDDEN,
            )

        def _summary(snap):
            snap = snap if isinstance(snap, dict) else {}
            return {
                "catalog_txt": snap.get("catalog_txt") or "",
                "code": snap.get("code") or "",
                "town": snap.get("town") or "",
                "state": snap.get("state") or "",
                "type": snap.get("type") or "",
                "inscription_txt": snap.get("inscription_txt") or "",
                "desc": snap.get("desc") or "",
                "is_manuscript": bool(snap.get("is_manuscript")),
                "impression": snap.get("impression") or "",
                "is_irreg": snap.get("is_irreg"),
                "shape_id": snap.get("shape_id"),
                "lettering_id": snap.get("lettering_id"),
                "color_id": snap.get("color_id"),
                "date_fmt": snap.get("date_fmt") or "",
                "rate_val": snap.get("rate_val"),
                "width": snap.get("width"),
                "height": snap.get("height"),
            }

        txns = list(
            SubmissionTransaction.objects.filter(
                Q(marking=marking) | Q(contribution__marking=marking)
            )
            .select_related("actor", "contribution")
            .order_by("-created_at", "-id")
            .distinct()
        )
        versions = list(
            MarkingVersion.objects.filter(marking=marking)
            .select_related("created_by", "transaction")
            .order_by("-version_no")
        )
        version_no_by_txn_id = {
            v.transaction_id: v.version_no for v in versions if v.transaction_id is not None
        }
        txn_by_id = {txn.id: txn for txn in txns}
        action_labels = dict(SubmissionTransaction.ACTION_CHOICES)

        events = []
        for txn in txns:
            actor_name = None
            actor_email = None
            if txn.actor:
                actor_email = (getattr(txn.actor, "email", "") or "").strip() or None
                actor_name = (
                    txn.actor.get_username()
                    or actor_email
                    or str(txn.actor.pk)
                )
            events.append(
                {
                    "event_id": txn.id,
                    "transaction_uuid": str(txn.transaction_uuid),
                    "timestamp": txn.created_at,
                    "action": txn.action,
                    "action_label": action_labels.get(txn.action, txn.action.replace("_", " ").title()),
                    "actor": actor_name,
                    # actor_email is what the editor-facing Record History panel
                    # displays per row. We expose it explicitly (in addition to
                    # the username-fallback "actor" string) because the audit
                    # trail is contractually email-based on the UI side.
                    "actor_email": actor_email,
                    "source": txn.source,
                    "contribution_id": txn.contribution_id,
                    "version_no": version_no_by_txn_id.get(txn.id),
                    "diff": txn.diff_payload or [],
                    "summary": f"{action_labels.get(txn.action, txn.action)} by {actor_email or actor_name or 'system'}",
                }
            )

        approved_actions = {
            SubmissionTransaction.ACTION_APPROVE,
            SubmissionTransaction.ACTION_CATALOG_DIRECT_EDIT,
            SubmissionTransaction.ACTION_RESTORE_VERSION,
        }
        version_rows = []
        approved_version_rows = []
        for version in versions:
            created_by_name = None
            if version.created_by:
                created_by_name = (
                    version.created_by.get_username()
                    or getattr(version.created_by, "email", "")
                    or str(version.created_by.pk)
                )
            txn = txn_by_id.get(version.transaction_id) if version.transaction_id is not None else None
            txn_action = txn.action if txn else None
            row = {
                "version_no": version.version_no,
                "created_at": version.created_at,
                "created_by": created_by_name,
                "transaction_id": version.transaction_id,
                "action": txn_action,
                "action_label": (
                    action_labels.get(txn_action, str(txn_action).replace("_", " ").title())
                    if txn_action
                    else None
                ),
                "snapshot": _summary(version.snapshot),
            }
            version_rows.append(row)
            if txn_action in approved_actions:
                approved_version_rows.append(row)

        return Response(
            {
                "marking_id": marking.pk,
                "events": events,
                "versions": version_rows,
                "approved_versions": approved_version_rows,
            }
        )

    @action(detail=True, methods=["post"], url_path="restore-version", permission_classes=[IsAuthenticated])
    def restore_version(self, request, pk=None):
        marking = self.get_object()
        if not _user_is_responsible_for_marking(request.user, marking):
            return Response(
                {"detail": "You are not allowed to restore this record."},
                status=status.HTTP_403_FORBIDDEN,
            )
        raw_version_no = (request.data or {}).get("version_no")
        try:
            version_no = int(raw_version_no)
        except (TypeError, ValueError):
            return Response(
                {"detail": "version_no must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        restore_from = MarkingVersion.objects.filter(
            marking=marking, version_no=version_no
        ).first()
        if not restore_from:
            return Response(
                {"detail": f"Version {version_no} not found for this record."},
                status=status.HTTP_404_NOT_FOUND,
            )
        before_snapshot = build_marking_snapshot(marking)
        with transaction.atomic():
            restore_marking_from_snapshot(marking, restore_from.snapshot or {}, request.user)
            marking.refresh_from_db()
            after_snapshot = build_marking_snapshot(marking)
            txn = log_submission_transaction(
                action=SubmissionTransaction.ACTION_RESTORE_VERSION,
                actor=request.user,
                contribution=getattr(marking, "contribution", None),
                marking=marking,
                source=SubmissionTransaction.SOURCE_EDITOR_PORTAL,
                before_payload=before_snapshot,
                after_payload=after_snapshot,
                extra_payload={"restored_from_version_no": restore_from.version_no},
            )
            new_version = create_marking_version(marking, txn, request.user)
        return Response(
            {
                "detail": f"Record restored from version {restore_from.version_no}.",
                "restored_from_version_no": restore_from.version_no,
                "new_version_no": new_version.version_no,
            },
            status=status.HTTP_200_OK,
        )


###################################################################################################
## Custom non-router endpoints
###################################################################################################
@extend_schema(
    responses=inline_serializer(
        name="MarkingDateRangeResponse",
        fields={
            "earliest_year": serializers.IntegerField(allow_null=True),
            "latest_year": serializers.IntegerField(allow_null=True),
        },
    )
)
class MarkingDateRangeView(APIView):
    """Earliest and latest cover_date.date years across the catalog."""
    permission_classes = [AllowAny]

    def get(self, request):
        agg = CoverDate.objects.aggregate(
            earliest_year=Min(ExtractYear("date")),
            latest_year=Max(ExtractYear("date")),
        )
        earliest = int(agg["earliest_year"]) if agg["earliest_year"] is not None else None
        latest = int(agg["latest_year"]) if agg["latest_year"] is not None else None
        return Response({"earliest_year": earliest, "latest_year": latest})


@extend_schema(
    responses={
        204: OpenApiResponse(description="Marking deleted"),
        400: OpenApiResponse(description="Invalid marking ID"),
        403: OpenApiResponse(description="Not permitted to delete this marking"),
        404: OpenApiResponse(description="Marking not found"),
    }
)
@method_decorator(csrf_exempt, name="dispatch")
class DeleteMyMarkingView(APIView):
    """
    Delete one of your own user-contributed catalog markings, OR delete any marking
    in a region you are an editor for. Replaces the v1 /postmarks/<id>/delete-mine/.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            marking_id = int(pk)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid marking ID."}, status=status.HTTP_400_BAD_REQUEST)
        marking = Marking.objects.filter(pk=marking_id).first()
        if not marking:
            return Response({"detail": "Marking not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        before_snapshot = build_marking_snapshot(marking)

        def _log_delete():
            log_submission_transaction(
                action=SubmissionTransaction.ACTION_RECORD_DELETE,
                actor=user,
                contribution=getattr(marking, "contribution", None),
                marking=marking,
                source=SubmissionTransaction.SOURCE_EDITOR_PORTAL,
                before_payload=before_snapshot,
                after_payload={},
                extra_payload={"deleted_marking_id": marking_id},
            )

        if user.is_superuser:
            _log_delete()
            marking.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        region_id = marking.post_office.region_id if marking.post_office_id else None
        if region_id and _get_user_assigned_regions(user).filter(pk=region_id).exists():
            _log_delete()
            marking.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        try:
            is_own_contribution = marking.contribution.contributor_id == user.id
        except Exception:
            is_own_contribution = False
        if not is_own_contribution:
            return Response(
                {"detail": "You can only delete catalog entries that you originally submitted."},
                status=status.HTTP_403_FORBIDDEN,
            )
        _log_delete()
        marking.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


###################################################################################################
## Contribution viewset
###################################################################################################
def _get_editor_contribution_queryset(user):
    """Editors see contributions for Collections they are assigned to."""
    assigned_ids = user_assigned_collection_ids(user)
    base = Contribution.objects.select_related(
        "contributor", "reviewer", "marking", "collection", "collection__region"
    )
    if not assigned_ids:
        return base.none()
    return base.filter(collection_id__in=assigned_ids).distinct()


@method_decorator(csrf_exempt, name="dispatch")
class ContributionViewSet(mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    """
    GET list / detail at /contributions/ and /contributions/<pk>/.
    POST /contributions/ delegates to ContributionSubmitView so authenticated
    contributors can submit new entries here. Approve / reject actions live on
    detail routes.
    """
    permission_classes = [IsAuthenticated, CanReviewContribution]
    serializer_class = ContributionDetailSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status"]
    ordering = ["-created_at"]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        # POST /contributions/ is the public submission endpoint and only
        # requires authentication; the editor review permission is enforced on
        # GET (list/detail) and on the approve/reject detail actions.
        if self.action == "create":
            return [IsAuthenticated()]
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        # Delegate to ContributionSubmitView.post so the submission logic stays
        # in one place. The DRF Request from this viewset already exposes data,
        # FILES, and user as ContributionSubmitView expects.
        submit_view = ContributionSubmitView()
        submit_view.request = request
        submit_view.kwargs = getattr(self, "kwargs", {})
        submit_view.format_kwarg = getattr(self, "format_kwarg", None)
        return submit_view.post(request)

    def get_queryset(self):
        user = self.request.user
        base_qs = Contribution.objects.select_related(
            "contributor", "reviewer", "marking", "collection", "collection__region"
        )
        if user.is_superuser:
            return base_qs
        if user.has_perm(REVIEW_CONTRIBUTION_PERM):
            return _get_editor_contribution_queryset(user)
        return base_qs.filter(contributor=user).distinct()

    def get_serializer_class(self):
        if self.action == "list":
            return ContributionListSerializer
        return ContributionDetailSerializer

    @action(detail=True, methods=["patch"], url_path="editor-edit")
    def editor_edit(self, request, pk=None):
        """
        Editor-side merge of submitted_data prior to approve.

        Frontend (ContributionDetail.tsx -> persistEditorEdits) PATCHes a JSON
        object whose keys mirror the contribute payload (state, town, type,
        width_mm, height_mm, lettering_style_id, ...). The values are merged
        into `Contribution.submitted_data`; explicit `null` clears a field,
        omitted keys leave existing values untouched. Approve later reads from
        the merged submitted_data when applying to the catalog.
        """
        contrib = self.get_object()
        if contrib.status != Contribution.STATUS_PENDING:
            return Response(
                {"detail": f"Contribution is not pending (status: {contrib.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payload = request.data
        if not isinstance(payload, dict):
            return Response(
                {"detail": "Request body must be a JSON object of submission fields."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        before_submission = dict(contrib.submitted_data or {})
        merged = dict(before_submission)
        for key, value in payload.items():
            merged[key] = value

        with transaction.atomic():
            contrib.submitted_data = merged
            contrib.save(update_fields=["submitted_data", "updated_at"])
            log_submission_transaction(
                action=SubmissionTransaction.ACTION_EDITOR_EDIT,
                actor=request.user,
                contribution=contrib,
                marking=contrib.marking,
                source=SubmissionTransaction.SOURCE_EDITOR_PORTAL,
                before_payload=before_submission,
                after_payload=merged,
                extra_payload={"changed_keys": sorted(payload.keys())},
            )

        serializer = ContributionDetailSerializer(contrib, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        contrib = self.get_object()
        if contrib.status != Contribution.STATUS_PENDING:
            return Response(
                {"detail": f"Contribution is not pending (status: {contrib.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = ContributionApproveRejectSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        review_notes = serializer.validated_data.get("review_notes", "")
        try:
            with transaction.atomic():
                marking = contrib.apply_to_catalog()
                if not marking:
                    return Response(
                        {"detail": "Could not apply contribution. Check submitted_data."},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )
                contrib.status = Contribution.STATUS_APPROVED
                contrib.reviewer = request.user
                contrib.review_notes = review_notes
                contrib.save(update_fields=["status", "reviewer", "review_notes", "marking", "updated_at"])
                after_snapshot = build_marking_snapshot(marking)
                txn = log_submission_transaction(
                    action=SubmissionTransaction.ACTION_APPROVE,
                    actor=request.user,
                    contribution=contrib,
                    marking=marking,
                    source=SubmissionTransaction.SOURCE_EDITOR_PORTAL,
                    before_payload={},
                    after_payload=after_snapshot,
                    extra_payload={"review_notes": review_notes},
                )
                create_marking_version(marking, txn, request.user)
        except NotImplementedError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )
        return Response(
            {"detail": "Contribution approved.", "markingId": marking.pk},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        contrib = self.get_object()
        if contrib.status != Contribution.STATUS_PENDING:
            return Response(
                {"detail": f"Contribution is not pending (status: {contrib.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = ContributionApproveRejectSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        review_notes = serializer.validated_data.get("review_notes", "")
        before_submission = dict(contrib.submitted_data or {})
        contrib.status = Contribution.STATUS_REJECTED
        contrib.reviewer = request.user
        contrib.review_notes = review_notes
        contrib.save(update_fields=["status", "reviewer", "review_notes", "updated_at"])
        log_submission_transaction(
            action=SubmissionTransaction.ACTION_REJECT,
            actor=request.user,
            contribution=contrib,
            marking=contrib.marking,
            source=SubmissionTransaction.SOURCE_EDITOR_PORTAL,
            before_payload=before_submission,
            after_payload=before_submission,
            extra_payload={"review_notes": review_notes},
        )
        return Response({"detail": "Contribution rejected."}, status=status.HTTP_200_OK)


@extend_schema(
    request=inline_serializer(
        name="ContributionSubmitRequest",
        fields={
            "state": serializers.CharField(help_text="State name or abbreviation; routes to a Collection"),
            "type": serializers.ChoiceField(
                choices=["TOWNMARK", "RATEMARK", "AUXMARK"],
                required=False,
            ),
            "desc": serializers.CharField(required=False, allow_blank=True),
        },
    ),
    responses={
        201: inline_serializer(
            name="ContributionSubmitResponse",
            fields={
                "contribution_id": serializers.IntegerField(),
                "status": serializers.CharField(),
            },
        ),
        400: OpenApiResponse(description="Validation error"),
    },
)
@method_decorator(csrf_exempt, name="dispatch")
class ContributionSubmitView(APIView):
    """
    Public submission endpoint for new contributions.

    Accepts the new unified payload shape: marking_* keys (formerly postmark_*),
    plus `type` (TOWNMARK | RATEMARK | AUXMARK) and `desc`. The payload is
    persisted to Contribution.submitted_data and routed to a Collection by
    state. Final application to the catalog (creating / updating Marking,
    Image, CoverMarking, CoverDate, CoverValuation rows) happens at approval
    time; that pipeline is rebuilt against the unified schema in a follow-up
    pass and currently raises ContributionApplyNotImplemented.

    See plan: docs/devel/scope.md and
    .claude/plans/the-latest-changes-made-functional-zebra.md sections 2c.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else dict(request.data)
        state_value = (data.get("state") or "").strip()
        if not state_value:
            return Response(
                {"detail": "state is required to route the contribution to a Collection."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        region = Region.objects.filter(
            Q(name__iexact=state_value) | Q(abbrev__iexact=state_value)
        ).first()
        if not region:
            return Response(
                {"detail": f"No Region matches state={state_value!r}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        collection = Collection.objects.filter(region=region, is_active=True).first()
        if not collection:
            return Response(
                {"detail": f"No active Collection covers region {region.name!r}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Optional draft mode: when save_as_draft is truthy, contributions are
        # created with status=DRAFT instead of PENDING so they are visible only
        # to the contributor in "My Submissions" until they choose to submit.
        save_as_draft_raw = str(
            data.get("save_as_draft")
            or data.get("saveAsDraft")
            or data.get("status")
        ).strip().lower()
        is_draft = save_as_draft_raw in {"draft", "true", "1", "yes", "on"}

        type_value = (data.get("type") or "").strip().upper()
        if type_value and type_value not in {"TOWNMARK", "RATEMARK", "AUXMARK"}:
            return Response(
                {"detail": "type must be TOWNMARK, RATEMARK, or AUXMARK."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Save uploaded marking image files under MEDIA_ROOT/<region_abbrev>/.
        # Frontend posts FormData with one or more `marking_image` fields; we
        # stash the resulting metadata on Contribution.submitted_data so the
        # editor portal can display previews. Approval-time materialization
        # into Image rows happens in the contribution-apply pipeline.
        region_abbrev = (region.abbrev or "").strip().lower() or "unknown"
        uploaded_files = []
        try:
            uploaded_files = request.FILES.getlist("marking_image")
        except AttributeError:
            uploaded_files = []
        image_metas = []
        for uploaded in uploaded_files:
            meta = _save_contribution_image(uploaded, region_abbrev)
            if meta:
                image_metas.append(meta)

        # Strip multi-value form keys to plain values for the JSONField payload.
        # Skip raw file objects: they are not JSON-serializable and we have already
        # captured them in image_metas above.
        submitted_data = {}
        for key in data:
            if key == "marking_image":
                continue
            value = data.get(key)
            if hasattr(value, "read") and hasattr(value, "name"):
                continue
            try:
                submitted_data[key] = value
            except Exception:
                submitted_data[key] = str(value)

        if image_metas:
            submitted_data["marking_image_metas"] = image_metas
            # Legacy keys still consumed by Dashboard.tsx and ContributionDetail.tsx.
            submitted_data["image_metas"] = image_metas
            submitted_data["image_meta"] = image_metas[0]

        contrib = Contribution.objects.create(
            contributor=request.user,
            collection=collection,
            submitted_data=submitted_data,
            status=Contribution.STATUS_DRAFT if is_draft else Contribution.STATUS_PENDING,
        )
        log_submission_transaction(
            action=SubmissionTransaction.ACTION_SUBMIT,
            actor=request.user,
            contribution=contrib,
            marking=None,
            source=SubmissionTransaction.SOURCE_CONTRIBUTOR_PORTAL,
            before_payload={},
            after_payload=submitted_data,
        )
        return Response(
            ContributionDetailSerializer(contrib, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


def _save_contribution_image(uploaded_file, region_abbrev):
    """
    Save an uploaded marking image under MEDIA_ROOT/<region_abbrev>/
    and return a metadata dict suitable for Contribution.submitted_data.

    Returns dict with storage_filename, original_filename, file_checksum,
    mime_type, image_width, image_height, file_size_bytes; or None if the
    file is missing, oversize, or not a recognized image format.

    storage_filename is returned as '<region_abbrev>/<uuid>.<ext>'. Public
    URLs are built by ImageSerializer.get_image_url, which serves from
    MEDIA_URL directly (e.g. /media/<region_abbrev>/<uuid>.<ext>).
    """
    from common.images import extract_image_metadata

    if not uploaded_file or not getattr(uploaded_file, "read", None):
        return None
    content_type = getattr(uploaded_file, "content_type", "") or ""
    max_size_bytes = 100 * 1024 * 1024  # 100 MB
    try:
        uploaded_file.seek(0)
    except Exception:
        pass
    content = uploaded_file.read()
    if not content or len(content) > max_size_bytes:
        return None
    try:
        uploaded_file.seek(0)
    except Exception:
        pass
    metadata = extract_image_metadata(content, content_type)
    if metadata is None:
        return None
    if "png" in content_type:
        ext = "png"
    elif "tiff" in content_type:
        ext = "tiff"
    else:
        ext = "jpg"
    abbrev = (region_abbrev or "").strip().lower() or "unknown"
    storage_name = f"{abbrev}/{uuid.uuid4().hex}.{ext}"
    sub_dir = os.path.join(settings.MEDIA_ROOT, abbrev)
    os.makedirs(sub_dir, exist_ok=True)
    file_path = os.path.join(settings.MEDIA_ROOT, storage_name)
    with open(file_path, "wb") as f:
        f.write(content)
    return {
        "storage_filename": storage_name,
        "original_filename": (getattr(uploaded_file, "name", "image") or "image")[:255],
        **metadata,
    }


###################################################################################################
## Collection (institutional unit, F7)
###################################################################################################
class CollectionViewSet(viewsets.ModelViewSet):
    """
    Reads: any authenticated user.
    Writes (incl. assign / unassign editor): Administrators only.
    """
    queryset = Collection.objects.select_related("region").all()
    serializer_class = CollectionSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["region", "is_active"]
    search_fields = ["name", "description", "region__name", "region__abbrev"]
    ordering_fields = ["name", "created_date"]
    ordering = ["name"]

    def get_permissions(self):
        if self.action in ("list", "retrieve", "editors"):
            return [IsAuthenticated()]
        return [IsAdminUser()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, modified_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(modified_by=self.request.user)

    @action(detail=True, methods=["get"], url_path="editors")
    def editors(self, request, pk=None):
        collection = self.get_object()
        rows = collection.editor_assignments.select_related("user").order_by("user__username")
        return Response([
            {
                "id": ca.pk,
                "user_id": ca.user_id,
                "username": ca.user.username,
                "email": getattr(ca.user, "email", "") or "",
            }
            for ca in rows
        ])

    @action(detail=True, methods=["post"], url_path="assign-editor")
    def assign_editor(self, request, pk=None):
        collection = self.get_object()
        user_id = request.data.get("user_id")
        try:
            user_id = int(user_id) if user_id is not None else None
        except (TypeError, ValueError):
            user_id = None
        if not user_id:
            return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        target = User.objects.filter(pk=user_id).first()
        if not target:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        ca, created = CollectionAssignment.objects.get_or_create(
            user=target,
            collection=collection,
            defaults={"created_by": request.user, "modified_by": request.user},
        )
        return Response(
            {
                "id": ca.pk,
                "user_id": target.pk,
                "username": target.username,
                "collection_id": collection.pk,
                "created": created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=["delete"], url_path="unassign-editor/(?P<user_id>[^/.]+)")
    def unassign_editor(self, request, pk=None, user_id=None):
        collection = self.get_object()
        try:
            uid = int(user_id) if user_id is not None else None
        except (TypeError, ValueError):
            uid = None
        if not uid:
            return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        deleted, _ = CollectionAssignment.objects.filter(
            user_id=uid, collection=collection
        ).delete()
        if not deleted:
            return Response({"detail": "Assignment not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


###################################################################################################
