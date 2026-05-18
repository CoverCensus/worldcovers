"""
Tests for the DRF permission classes in `common.api.v2.permissions`.
These guards stand between contributor-portal users and editor-only data,
so any regression effectively unlocks the catalog.
"""
from __future__ import annotations

from unittest.mock import MagicMock

from django.test import RequestFactory, TestCase

from common.api.v2.permissions import (
    CanManageReferenceWorks,
    CanReviewContribution,
    IsEditor,
    user_assigned_collection_ids,
)
from common.models import Contribution
from common.tests.factories import (
    assign_editor,
    make_collection,
    make_contributor,
    make_editor,
    make_superuser,
)


def _request(method="GET", user=None):
    rf = RequestFactory()
    builder = getattr(rf, method.lower())
    request = builder("/api/v2/contributions/")
    request.user = user
    return request


class UserAssignedCollectionIdsTest(TestCase):
    def test_returns_empty_for_anonymous_user(self):
        anon = MagicMock(is_authenticated=False)
        self.assertEqual(user_assigned_collection_ids(anon), set())

    def test_returns_collection_ids_for_assigned_editor(self):
        editor = make_editor()
        collection = make_collection(creator=editor)
        assign_editor(editor, collection, creator=editor)
        self.assertEqual(user_assigned_collection_ids(editor), {collection.pk})


class IsEditorTest(TestCase):
    def test_anonymous_denied(self):
        anon = MagicMock(is_authenticated=False)
        request = _request(user=anon)
        self.assertFalse(IsEditor().has_permission(request, view=None))

    def test_superuser_granted(self):
        admin = make_superuser()
        request = _request(user=admin)
        self.assertTrue(IsEditor().has_permission(request, view=None))

    def test_contributor_denied(self):
        user = make_contributor()
        request = _request(user=user)
        self.assertFalse(IsEditor().has_permission(request, view=None))

    def test_editor_granted(self):
        editor = make_editor()
        request = _request(user=editor)
        self.assertTrue(IsEditor().has_permission(request, view=None))


class CanReviewContributionTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.editor = make_editor("editor_perm")
        cls.other_editor = make_editor("editor_other")
        cls.contributor = make_contributor("contrib_perm")
        cls.admin = make_superuser("admin_perm")
        cls.collection = make_collection(creator=cls.admin)
        assign_editor(cls.editor, cls.collection, creator=cls.admin)
        cls.contrib = Contribution.objects.create(
            contributor=cls.contributor,
            collection=cls.collection,
            submitted_data={"state": "Virginia"},
        )

    def test_anonymous_has_no_permission(self):
        request = _request(user=MagicMock(is_authenticated=False))
        self.assertFalse(CanReviewContribution().has_permission(request, view=None))

    def test_owner_can_read_own_contribution(self):
        request = _request("GET", user=self.contributor)
        self.assertTrue(
            CanReviewContribution().has_object_permission(request, view=None, obj=self.contrib)
        )

    def test_owner_cannot_write_their_contribution_unless_assigned(self):
        request = _request("POST", user=self.contributor)
        self.assertFalse(
            CanReviewContribution().has_object_permission(request, view=None, obj=self.contrib)
        )

    def test_unassigned_editor_denied(self):
        # other_editor has review_contribution perm but isn't assigned to this collection.
        request = _request("POST", user=self.other_editor)
        self.assertFalse(
            CanReviewContribution().has_object_permission(request, view=None, obj=self.contrib)
        )

    def test_assigned_editor_granted_for_write(self):
        request = _request("POST", user=self.editor)
        self.assertTrue(
            CanReviewContribution().has_object_permission(request, view=None, obj=self.contrib)
        )

    def test_superuser_always_granted(self):
        request = _request("POST", user=self.admin)
        self.assertTrue(
            CanReviewContribution().has_object_permission(request, view=None, obj=self.contrib)
        )


class CanManageReferenceWorksTest(TestCase):
    def test_anonymous_denied(self):
        request = _request("GET", user=MagicMock(is_authenticated=False))
        self.assertFalse(CanManageReferenceWorks().has_permission(request, view=None))

    def test_authenticated_user_can_read(self):
        request = _request("GET", user=make_contributor())
        self.assertTrue(CanManageReferenceWorks().has_permission(request, view=None))

    def test_contributor_cannot_write(self):
        request = _request("POST", user=make_contributor())
        self.assertFalse(CanManageReferenceWorks().has_permission(request, view=None))

    def test_editor_can_write_and_patch(self):
        editor = make_editor("ref_editor")
        for method in ("POST", "PUT", "PATCH"):
            self.assertTrue(
                CanManageReferenceWorks().has_permission(_request(method, user=editor), view=None),
                msg=f"editor should be permitted to {method}",
            )

    def test_editor_cannot_delete(self):
        editor = make_editor("ref_editor_del")
        request = _request("DELETE", user=editor)
        self.assertFalse(CanManageReferenceWorks().has_permission(request, view=None))

    def test_superuser_can_delete(self):
        request = _request("DELETE", user=make_superuser("admin_ref"))
        self.assertTrue(CanManageReferenceWorks().has_permission(request, view=None))
