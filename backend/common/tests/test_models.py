"""
Unit tests for the `common` models. These focus on behavior that isn't simply
delegated to Django (constraints, custom `clean()` / `save()` overrides, and
helper methods) rather than re-asserting field declarations.
"""
from __future__ import annotations

from datetime import date

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from common.models import (
    CollectionAssignment,
    Contribution,
    Image,
    Marking,
    MarkingType,
    PostOfficeRegion,
    SubmissionTransaction,
)
from common.tests.factories import (
    assign_editor,
    make_collection,
    make_color,
    make_contributor,
    make_cover,
    make_cover_date_seen,
    make_cover_marking,
    make_image_for_marking,
    make_lettering,
    make_marking,
    make_post_office,
    make_region,
    make_shape,
    make_superuser,
    make_user,
)


class MarkingStrTest(TestCase):
    """Guard __str__ on the unified Marking model. Field-name typos should
    surface immediately on instantiation."""

    def test_townmark_str_with_code(self):
        m = Marking(type=MarkingType.TOWNMARK, code="IA-001", inscription_txt="IOWA CITY", is_manuscript=False)
        result = str(m)
        self.assertIn("TOWNMARK", result)
        self.assertIn("IA-001", result)

    def test_ratemark_str_without_code(self):
        m = Marking(type=MarkingType.RATEMARK, inscription_txt="5", is_manuscript=False)
        result = str(m)
        self.assertIn("RATEMARK", result)

    def test_auxmark_str_without_code(self):
        m = Marking(type=MarkingType.AUXMARK, inscription_txt="PAID", is_manuscript=False)
        result = str(m)
        self.assertIn("AUXMARK", result)


class MarkingCleanAndSaveTest(TestCase):
    """`clean()` and `save()` enforce the manuscript/printed invariants on Marking."""

    def test_manuscript_must_not_carry_shape_lettering_or_irreg(self):
        po = make_post_office()
        color = make_color()
        shape = make_shape()

        m = Marking(
            type=MarkingType.TOWNMARK,
            inscription_txt="HAND WRITTEN",
            is_manuscript=True,
            shape=shape,
            post_office=po,
            color=color,
            created_by=po.created_by,
            modified_by=po.created_by,
        )
        with self.assertRaises(ValidationError) as ctx:
            m.clean()
        self.assertIn("shape", ctx.exception.message_dict)

    def test_non_manuscript_requires_shape(self):
        po = make_post_office()
        color = make_color()
        m = Marking(
            type=MarkingType.TOWNMARK,
            inscription_txt="RICHMOND",
            is_manuscript=False,
            shape=None,
            post_office=po,
            color=color,
            created_by=po.created_by,
            modified_by=po.created_by,
        )
        with self.assertRaises(ValidationError) as ctx:
            m.clean()
        self.assertIn("shape", ctx.exception.message_dict)

    def test_save_nulls_shape_for_manuscript(self):
        """save() should defensively strip shape/lettering/is_irreg on a manuscript row,
        even if a caller forgot to. This protects the DB constraint."""
        po = make_post_office()
        color = make_color()
        shape = make_shape()
        lettering = make_lettering()
        creator = po.created_by
        m = Marking(
            type=MarkingType.AUXMARK,
            inscription_txt="PAID",
            is_manuscript=True,
            shape=shape,
            lettering=lettering,
            is_irreg=True,
            post_office=po,
            color=color,
            created_by=creator,
            modified_by=creator,
        )
        m.save()
        m.refresh_from_db()
        self.assertIsNone(m.shape_id)
        self.assertIsNone(m.lettering_id)
        self.assertIsNone(m.is_irreg)

    def test_save_defaults_is_irreg_false_for_printed(self):
        marking = make_marking(is_manuscript=False)
        marking.is_irreg = None
        marking.save()
        marking.refresh_from_db()
        self.assertFalse(marking.is_irreg)


class MarkingQuerySetDateRangeTest(TestCase):
    """`Marking.objects.with_date_range()` should expose earliest_seen / latest_seen."""

    def test_with_date_range_annotates_min_and_max(self):
        marking = make_marking()
        cover = make_cover(creator=marking.created_by)
        make_cover_marking(cover, marking, creator=marking.created_by)
        # DateSeen is now polymorphic; cover-side dates are attached with
        # subject_type='COVER' and the marking's date range comes through the
        # cover_markings join inside `with_date_range`.
        make_cover_date_seen(cover, date(1860, 1, 1), creator=marking.created_by)
        make_cover_date_seen(cover, date(1870, 6, 1), creator=marking.created_by)

        annotated = Marking.objects.with_date_range().get(pk=marking.pk)
        self.assertEqual(annotated.earliest_seen, date(1860, 1, 1))
        self.assertEqual(annotated.latest_seen, date(1870, 6, 1))

    def test_with_date_range_returns_none_when_no_dates(self):
        marking = make_marking()
        annotated = Marking.objects.with_date_range().get(pk=marking.pk)
        self.assertIsNone(annotated.earliest_seen)
        self.assertIsNone(annotated.latest_seen)


class RegionAndPostOfficeTest(TestCase):
    def test_region_str_returns_name(self):
        region = make_region(name="Iowa", abbrev="IA")
        self.assertEqual(str(region), "Iowa")

    def test_post_office_region_link_is_unique(self):
        """A PostOffice can only be linked to the same Region once via the
        PostOfficeRegion junction (unique_together)."""
        creator = make_user("por_unique")
        region = make_region(name="Ohio", abbrev="OH", creator=creator)
        po = make_post_office(name="Springfield", region=region, creator=creator)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PostOfficeRegion.objects.create(
                    post_office=po, region=region, created_by=creator, modified_by=creator
                )

    def test_post_office_region_property_returns_linked_region(self):
        creator = make_user("po_prop")
        oh = make_region(name="Ohio", abbrev="OH", creator=creator)
        po = make_post_office(name="Columbus", region=oh, creator=creator)
        self.assertEqual(po.region, oh)


class CollectionAssignmentTest(TestCase):
    """A CollectionAssignment.save() should add the user to the Editors group."""

    def test_assignment_adds_user_to_editors_group(self):
        admin = make_superuser()
        contributor = make_contributor()
        # Editors group is normally seeded by migration 0052; create it
        # explicitly here so the test is hermetic.
        from django.contrib.auth.models import Group

        Group.objects.get_or_create(name="Editors")
        collection = make_collection(creator=admin)
        self.assertFalse(contributor.groups.filter(name="Editors").exists())

        assign_editor(contributor, collection, creator=admin)
        self.assertTrue(contributor.groups.filter(name="Editors").exists())

    def test_assignment_unique_per_user_collection(self):
        admin = make_superuser()
        user = make_user("dup_user")
        collection = make_collection(creator=admin)
        CollectionAssignment.objects.create(
            user=user, collection=collection, created_by=admin, modified_by=admin
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CollectionAssignment.objects.create(
                    user=user, collection=collection, created_by=admin, modified_by=admin
                )


class ContributionTest(TestCase):
    def test_str_includes_id_and_status(self):
        admin = make_superuser()
        collection = make_collection(creator=admin)
        contrib = Contribution.objects.create(
            contributor=admin,
            collection=collection,
            submitted_data={"state": "VA"},
            status=Contribution.STATUS_PENDING,
        )
        self.assertIn(str(contrib.id), str(contrib))
        self.assertIn("pending", str(contrib))

    def test_apply_to_catalog_raises_not_implemented(self):
        """During the Phase 1 rewrite the apply pipeline is a stub."""
        admin = make_superuser()
        collection = make_collection(creator=admin)
        contrib = Contribution.objects.create(
            contributor=admin,
            collection=collection,
            submitted_data={"state": "VA"},
        )
        with self.assertRaises(NotImplementedError):
            contrib.apply_to_catalog()


class SubmissionTransactionTest(TestCase):
    def test_str_includes_action(self):
        admin = make_superuser()
        txn = SubmissionTransaction.objects.create(
            actor=admin,
            action=SubmissionTransaction.ACTION_SUBMIT,
            source=SubmissionTransaction.SOURCE_CONTRIBUTOR_PORTAL,
        )
        self.assertIn(SubmissionTransaction.ACTION_SUBMIT, str(txn))

    def test_default_uuid_is_unique(self):
        admin = make_superuser()
        a = SubmissionTransaction.objects.create(
            actor=admin, action=SubmissionTransaction.ACTION_SUBMIT
        )
        b = SubmissionTransaction.objects.create(
            actor=admin, action=SubmissionTransaction.ACTION_SUBMIT
        )
        self.assertNotEqual(a.transaction_uuid, b.transaction_uuid)


class ImageModelTest(TestCase):
    def test_image_view_must_match_subject_type(self):
        marking = make_marking()
        image = Image(
            subject_type=Image.SUBJECT_MARKING,
            subject_id=marking.pk,
            original_filename="x.jpg",
            storage_filename="va/x.jpg",
            file_checksum="0" * 64,
            mime_type="image/jpeg",
            image_width=10,
            image_height=10,
            file_size_bytes=1,
            image_view="FRONT",  # invalid for MARKING
            uploaded_by=marking.created_by,
            created_by=marking.created_by,
            modified_by=marking.created_by,
        )
        with self.assertRaises(ValidationError):
            image.clean()

    def test_image_str_includes_filename(self):
        marking = make_marking()
        image = make_image_for_marking(marking, uploader=marking.created_by)
        result = str(image)
        self.assertIn("test.jpg", result)
        self.assertIn(str(marking.pk), result)

    def test_generate_checksum_is_deterministic(self):
        import io

        buf = io.BytesIO(b"hello world")
        digest = Image.generate_checksum(buf)
        # Cursor should reset for the next read.
        self.assertEqual(buf.tell(), 0)
        # Same bytes => same digest.
        self.assertEqual(digest, Image.generate_checksum(io.BytesIO(b"hello world")))
        # Different bytes => different digest.
        self.assertNotEqual(digest, Image.generate_checksum(io.BytesIO(b"hello world!")))
