"""
DRF permission classes backed by real Django RBAC.

Role mapping (see plan in
.claude/plans/currently-the-system-has-prancy-wilkinson.md):

    Guest          → anonymous request
    Contributor    → in `Contributors` group
    Editor         → in `Editors` group (has `common.review_contribution`)
    Administrator  → `is_superuser` (single-person admin per design)

`IsAdminUser` (DRF built-in) is used directly in views for Administrator-only
endpoints — there is no separate Administrator group.
"""
from __future__ import annotations

from rest_framework.permissions import BasePermission, SAFE_METHODS

from common.models import Contribution, Region


REVIEW_CONTRIBUTION_PERM = "common.review_contribution"
APPROVE_IMAGE_PERM = "common.approve_image"


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
    region = marking.post_office.region
    if region is None:
        return False
    return _get_user_assigned_regions(user).filter(pk=region.pk).exists()


def user_assigned_collection_ids(user) -> set[int]:
    """Return the set of Collection IDs this user is assigned to as an Editor."""
    if not user or not user.is_authenticated:
        return set()
    return set(
        user.collection_assignments.values_list("collection_id", flat=True)
    )


class IsEditor(BasePermission):
    """
    Granted to users in the `Editors` group OR superusers.

    This is a pure role check; it does NOT scope to a specific Collection.
    Use `CanReviewContribution` when you need to also verify the user is
    assigned to the contribution's Collection.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user.is_superuser or user.has_perm(REVIEW_CONTRIBUTION_PERM)


class CanReviewContribution(BasePermission):
    """
    Object-level: user can review (approve/reject/edit) THIS contribution.

    Allowed if:
    - superuser, or
    - has `common.review_contribution` AND is assigned to the contribution's Collection.

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
            if not user.has_perm(REVIEW_CONTRIBUTION_PERM):
                return False
            return obj.collection_id in user_assigned_collection_ids(user)

        # Write access (approve/reject/edit): must have perm AND be assigned to this Collection.
        if not user.has_perm(REVIEW_CONTRIBUTION_PERM):
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
            # Spec says "add and edit" only — delete is admin-only.
            return False
        return False
