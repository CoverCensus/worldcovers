"""Trello T74: restoring an Entry version reconciles its relationships, previewed first."""
import shutil
import tempfile
from datetime import date
from decimal import Decimal
from pathlib import Path
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from common.audit import (
    build_marking_snapshot,
    create_cover_version,
    create_marking_version,
    restore_marking_from_snapshot,
)
from common.models import (
    Citation,
    Collection,
    CollectionAssignment,
    Cover,
    CoverMarking,
    CoverValuation,
    CoverVersion,
    DateSeen,
    Image,
    Marking,
    MarkingRecycleBin,
    MarkingVersion,
    PostOffice,
    PostOfficeRegion,
    ReferenceWork,
    Region,
    SubmissionTransaction,
)
from common.version_restore import (
    LIMIT_IMAGE_FILE_MISSING,
    LIMIT_MARKING_COVER_LINKS,
    LIMIT_NOT_RECORDED,
    apply_restore_plan,
    plan_marking_restore,
)

MEDIA_ROOT = tempfile.mkdtemp(prefix="woco-version-restore-tests-")


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class VersionRestoreTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_superuser("admin")
        self.editor = User.objects.create_user("editor")
        self.md_editor = User.objects.create_user("md-editor")
        self.contributor = User.objects.create_user("contributor")
        self.audit = {"created_by": self.admin, "modified_by": self.admin}

        offices = {}
        for name, abbrev, editor in (("Virginia", "VA", self.editor), ("Maryland", "MD", self.md_editor)):
            region = Region.objects.create(name=name, abbrev=abbrev, region_tier="STATE", **self.audit)
            collection = Collection.objects.create(name=name, region=region, **self.audit)
            CollectionAssignment.objects.create(user=editor, collection=collection, **self.audit)
            offices[abbrev] = PostOffice.objects.create(name=f"{name} Town", **self.audit)
            PostOfficeRegion.objects.create(post_office=offices[abbrev], region=region, **self.audit)
        self.marking = Marking.objects.create(
            type="TOWNMARK", inscription_txt="RICHMOND", is_manuscript=False,
            post_office=offices["VA"], **self.audit,
        )
        self.md_marking = Marking.objects.create(
            type="TOWNMARK", inscription_txt="BALTIMORE", is_manuscript=False,
            post_office=offices["MD"], **self.audit,
        )
        self.work = ReferenceWork.objects.create(
            title="ASCC", authorship="Society", publisher="Society", publication_year=1990, **self.audit,
        )

        self.image_one = self.image("MARKING", self.marking, "va/one.png", 0)
        self.image_two = self.image("MARKING", self.marking, "va/two.png", 1)
        self.date(DateSeen.SUBJECT_MARKING, self.marking, 1850, 1, 1)
        Citation.objects.create(
            reference_work_id=self.work.pk, subject_type="MARKING", subject_id=self.marking.pk,
            citation_detail="p. 12", **self.audit,
        )

        self.cover = Cover.objects.create(type="FC", **self.audit)
        CoverMarking.objects.create(cover=self.cover, marking=self.marking, is_backstamp=True, **self.audit)
        self.image("COVER", self.cover, "va/cover.png", 0)
        self.date(DateSeen.SUBJECT_COVER, self.cover, 1850, 3, None)
        CoverValuation.objects.create(cover=self.cover, amt=Decimal("25.00"), appraisal_date=date(2020, 1, 1), **self.audit)

        # Version 1 is the state above; version 2 records the mutations below.
        self.marking_v1 = create_marking_version(self.marking, None, self.admin)
        self.cover_v1 = create_cover_version(self.cover, None, self.admin)
        self.image_two.delete()
        self.date(DateSeen.SUBJECT_MARKING, self.marking, 1851, None, None)
        self.marking.inscription_txt = "CHANGED"
        self.marking.save()
        self.cover.cover_markings.all().delete()
        self.cover.valuations.all().delete()
        create_marking_version(self.marking, None, self.admin)
        create_cover_version(self.cover, None, self.admin)

    def image(self, kind, entry, storage, order):
        path = Path(MEDIA_ROOT) / storage
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"png")
        return Image.objects.create(
            subject_type=kind, subject_id=entry.pk, image_view="FULL" if kind == "MARKING" else "FRONT",
            original_filename=storage.rsplit("/", 1)[-1], storage_filename=storage, file_checksum="x",
            mime_type="image/png", image_width=10, image_height=10, file_size_bytes=3, display_order=order,
            uploaded_by=self.admin, **self.audit,
        )

    def date(self, kind, entry, year, month, day):
        return DateSeen.objects.create(
            subject_type=kind, subject_id=entry.pk, date_year=year, date_month=month, date_day=day, **self.audit,
        )

    def counts(self):
        return (
            MarkingVersion.objects.count(), CoverVersion.objects.count(), SubmissionTransaction.objects.count(),
            Image.objects.count(), DateSeen.objects.count(), Citation.objects.count(),
        )

    # -- direct calls ------------------------------------------------------------------------

    def test_missing_image_file_is_skipped_and_listed(self):
        (Path(MEDIA_ROOT) / "va/two.png").unlink()
        plan = plan_marking_restore(self.marking, self.marking_v1.snapshot)
        self.assertEqual(plan.relations["images"].counts(), {"added": 0, "removed": 0, "kept": 1, "skipped": 1})
        self.assertIn(LIMIT_IMAGE_FILE_MISSING.format(original="two.png", storage="va/two.png"), plan.limitations)
        apply_restore_plan(plan, self.editor)
        self.assertEqual(Image.objects.filter(subject_type="MARKING", subject_id=self.marking.pk).count(), 1)
        self.marking.refresh_from_db()
        self.assertEqual(self.marking.inscription_txt, "RICHMOND")

    def test_snapshot_without_relationship_keys_leaves_them_unchanged(self):
        before = self.counts()
        restore_marking_from_snapshot(self.marking, {"inscription_txt": "RICHMOND", "type": "TOWNMARK"}, self.editor)
        self.marking.refresh_from_db()
        self.assertEqual(self.marking.inscription_txt, "RICHMOND")
        self.assertEqual(self.counts(), before)
        plan = plan_marking_restore(self.marking, {"inscription_txt": "RICHMOND"})
        for what in ("images", "dates", "citations"):
            self.assertIn(LIMIT_NOT_RECORDED.format(what=what), plan.limitations)
        self.assertIn(LIMIT_MARKING_COVER_LINKS, plan.limitations)
