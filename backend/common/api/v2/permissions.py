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


REVIEW_CONTRIBUTION_PERM = "common.review_contribution"
APPROVE_IMAGE_PERM = "common.approve_image"


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
