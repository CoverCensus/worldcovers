"""
DRF permission classes backed by real Django RBAC.

Role mapping (see plan in
.claude/plans/currently-the-system-has-prancy-wilkinson.md):

    Guest          -> anonymous request
    Contributor    -> in `Contributors` group
    Editor         -> assigned to at least one Collection, or has
                      `common.review_contribution`
    Administrator  -> `is_superuser` (single-person admin per design)

`IsAdminUser` (DRF built-in) is used directly in views for Administrator-only
endpoints -- there is no separate Administrator group.
"""
from __future__ import annotations

from rest_framework.permissions import BasePermission, SAFE_METHODS

from common.models import Contribution, Region


REVIEW_CONTRIBUTION_PERM = "common.review_contribution"
APPROVE_IMAGE_PERM = "common.approve_image"


def user_assigned_collection_ids(user) -> set[int]:
    """Return the set of Collection IDs this user is assigned to as an Editor."""
    if not user or not user.is_authenticated:
        return set()
    return set(
        user.collection_assignments.values_list("collection_id", flat=True)
    )


def user_can_review_contributions(user) -> bool:
    """
    Return True when the user can enter review flows.

    CollectionAssignment is the scoped editor source of truth. The
    `common.review_contribution` permission is retained for legacy group-based
    editor accounts and broad catalog tooling.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if user.has_perm(REVIEW_CONTRIBUTION_PERM):
        return True
    return bool(user_assigned_collection_ids(user))


def _get_user_assigned_regions(user):
    if not user or not user.is_authenticated:
        return Region.objects.none()
    return Region.objects.filter(collection__editor_assignments__user=user).distinct()


def _user_is_responsible_for_marking(user, marking):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if not user_can_review_contributions(user):
        return False
    if not marking or not marking.post_office_id:
        return False
    region = marking.post_office.region
    if region is None:
        return False
    return _get_user_assigned_regions(user).filter(pk=region.pk).exists()


def _user_is_responsible_for_cover(user, cover):
    """
    A cover has no region of its own; its regions are derived from the markings
    linked to it (CoverMarking -> Marking -> post_office -> region). An editor
    is responsible for the whole cover only if every one of those regions is in
    their assigned regions. This prevents an editor from removing a multi-state
    cover through one assigned marking while lacking authority over its other
    markings. A cover with no linked markings has no region, so only a
    superuser can act on it.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if not user_can_review_contributions(user):
        return False
    assigned_ids = set(
        _get_user_assigned_regions(user).values_list("pk", flat=True)
    )
    if not assigned_ids:
        return False
    region_ids = set()
    for cm in cover.cover_markings.select_related("marking__post_office").all():
        post_office = cm.marking.post_office if cm.marking else None
        # PostOffice.region is a property resolving the most-recent active region.
        region = post_office.region if post_office else None
        if region is not None:
            region_ids.add(region.pk)
    if not region_ids:
        return False
    return region_ids.issubset(assigned_ids)


class IsEditor(BasePermission):
    """
    Granted to assigned editors, users with the review permission, or superusers.

    This is a pure role check; it does NOT scope to a specific Collection.
    Use `CanReviewContribution` when you need to also verify the user is
    assigned to the contribution's Collection.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user_can_review_contributions(user)


class IsEditorOrAdminWrite(IsEditor):
    """
    Public reads pass; unsafe writes require an Editor or Administrator.

    Use this for direct catalog endpoints where contributors must go through
    the contribution review flow, but editors are allowed to enter live catalog
    vocabulary and records.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return super().has_permission(request, view)


def user_is_responsible_for_subject(user, subject_type, subject_id):
    """Whether ``user`` may act on the (subject_type, subject_id) a row hangs off.

    The polymorphic children -- Image, DateSeen -- carry no FK to their parent,
    so the subject has to be looked up before the ordinary marking/cover checks
    apply. They share the same 'COVER'/'MARKING' subject_type values, so this
    takes the pair rather than a row: object-level permission checks have an
    instance to read it off, but CREATE does not, and has to pass the values
    straight out of validated_data.

    A row pointing at a subject that no longer exists is superuser-only: there
    is no region to reason about. (Deleting a Marking or Cover orphans its
    child rows silently -- there is no cascade.) `all_objects` is deliberate:
    a recycle-binned subject still resolves to its region.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    from common.models import Cover, Marking

    # Literals rather than Image.SUBJECT_* / DateSeen.SUBJECT_*: this is
    # generic over the polymorphic children, and keying it on one model's
    # constants would read as though the others were being coerced to it.
    # The two models define the same values (models.py, Image and DateSeen).
    if subject_type == "MARKING":
        marking = Marking.all_objects.filter(pk=subject_id).first()
        return _user_is_responsible_for_marking(user, marking)
    if subject_type == "COVER":
        cover = Cover.all_objects.filter(pk=subject_id).first()
        if cover is None:
            return False
        return _user_is_responsible_for_cover(user, cover)
    return False


def user_is_responsible_for_image(user, image):
    """Whether ``user`` may act on ``image``, via the subject it hangs off."""
    if not user or not user.is_authenticated:
        return False
    # Superuser short-circuits ahead of the None check, so a superuser passes
    # even for a row we could not load. Preserved from the pre-extraction
    # version deliberately -- callers depend on it.
    if user.is_superuser:
        return True
    if image is None:
        return False
    return user_is_responsible_for_subject(user, image.subject_type, image.subject_id)


class IsResponsibleForImageSubject(BasePermission):
    """
    Object-level write check for Image rows, scoped to the subject's region.

    ImageViewSet carried only the role check (IsEditorOrAdminWrite), so any
    editor could mutate any image in any state -- unlike MarkingViewSet, which
    also applies IsResponsibleForRegion. Applied to the crop action (issue #77);
    widening it to the whole viewset is tracked separately so that change can be
    reviewed on its own.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_superuser or user_can_review_contributions(user))
        )

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return user_is_responsible_for_image(request.user, obj)


class IsResponsibleForDateSeenSubject(BasePermission):
    """
    Object-level write check for DateSeen rows, scoped to the subject's region.

    DateSeenViewSet carried only the role check (IsEditorOrAdminWrite), so any
    editor could alter or delete any marking's dates in any state (issue #128).

    This covers PUT/PATCH/DELETE only -- DRF does not call
    has_object_permission on create, so DateSeenViewSet.perform_create runs the
    same check by hand against validated_data.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_superuser or user_can_review_contributions(user))
        )

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return user_is_responsible_for_subject(
            request.user, obj.subject_type, obj.subject_id
        )


class CanReviewContribution(BasePermission):
    """
    Object-level: user can review (approve/reject/edit) THIS contribution.

    Allowed if:
    - superuser, or
    - is assigned to the contribution's Collection, with legacy support for
      users carrying `common.review_contribution`.

    For collection-listing actions (no object yet), allow any authenticated user
    in the Editors group; per-object filtering happens in get_queryset.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return True  # Allow contributors to list their own; per-object check below

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True

        # Read access: contributors can see their own; editors can see anything in their collections.
        if request.method in SAFE_METHODS:
            if getattr(obj, "contributor_id", None) == user.id:
                return True
            if not user_can_review_contributions(user):
                return False
            return obj.collection_id in user_assigned_collection_ids(user)

        # Write access (approve/reject/edit): must be assigned to this Collection.
        if not user_can_review_contributions(user):
            return False
        return obj.collection_id in user_assigned_collection_ids(user)


class IsDraftOwner(BasePermission):
    """
    Object-level: user may hard-DELETE this Contribution only if it is a draft
    that they own. True DELETE is permitted exclusively for drafts
    (status=draft); a non-draft contribution can never be hard-deleted through
    this path, not even by a superuser (use the marking REMOVE flow instead).
    For drafts, the owner (contributor or editor) may delete; superusers may
    delete any draft.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        # DELETE is for drafts only -- no exceptions, including superusers.
        if getattr(obj, "status", None) != Contribution.STATUS_DRAFT:
            return False
        if user.is_superuser:
            return True
        return getattr(obj, "contributor_id", None) == user.id


class IsOwnDeletableContribution(BasePermission):
    """
    Object-level: a user may hard-DELETE (withdraw) a Contribution they own as
    long as it has NOT been approved. Draft, pending, needs_revision and
    rejected contributions have no published Marking of their own yet -- the
    catalog row is only created/updated on approval -- so deleting them has no
    downstream catalog impact, the same rationale that made draft delete safe.
    An approved contribution can never be hard-deleted through this path (not
    even by a superuser); removing the resulting published marking goes through
    the marking REMOVE / recycle-bin flow instead. The owner (contributor) may
    delete their own; superusers may delete any non-approved contribution.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        # Approved contributions are off-limits to this true-delete path.
        if getattr(obj, "status", None) == Contribution.STATUS_APPROVED:
            return False
        if user.is_superuser:
            return True
        return getattr(obj, "contributor_id", None) == user.id


class CanManageReferenceWorks(BasePermission):
    """
    Reads: anyone authenticated.
    Writes: anyone with `add_referencework` / `change_referencework` (Editors group, superuser).
    Closes the F6 gap where reference works were writable by any contributor.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        if user.is_superuser:
            return True
        if request.method == "POST":
            return user.has_perm("common.add_referencework")
        if request.method in ("PUT", "PATCH"):
            return user.has_perm("common.change_referencework")
        if request.method == "DELETE":
            # Spec says "add and edit" only -- delete is admin-only.
            return False
        return False
