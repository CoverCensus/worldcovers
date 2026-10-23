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
    RestorePlanError,
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
        # The VA link stays (a cover with no links answers only to a superuser);
        # version 2 flips its backstamp flag and drops the valuation.
        self.cover.cover_markings.update(is_backstamp=False)
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

    def test_unresolvable_image_path_counts_as_missing_and_bad_ids_are_refused(self):
        snapshot = dict(self.marking_v1.snapshot)
        snapshot["images"] = [{**snapshot["images"][0], "storage_filename": "../../etc/passwd", "original_filename": "x"}]
        plan = plan_marking_restore(self.marking, snapshot)
        self.assertEqual(plan.relations["images"].counts()["skipped"], 1)
        self.assertIn(LIMIT_IMAGE_FILE_MISSING.format(original="x", storage="../../etc/passwd"), plan.limitations)
        with self.assertRaises(RestorePlanError):
            plan_marking_restore(self.marking, {**snapshot, "citations": [{"reference_work_id": "abc"}]})

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

    # -- API -----------------------------------------------------------------------------

    def test_marking_preview_reports_fields_relationships_and_limitations_without_writing(self):
        before = self.counts()
        self.client.force_authenticate(self.editor)
        response = self.client.get(f"/api/v2/markings/{self.marking.pk}/restore-preview/?version_no=1")
        self.assertEqual(response.status_code, 200, response.data)
        rows = {row["key"]: row for row in response.data["fields"]}
        self.assertEqual((rows["inscription_txt"]["current"], rows["inscription_txt"]["proposed"]), ("CHANGED", "RICHMOND"))
        self.assertTrue(rows["inscription_txt"]["changed"])
        self.assertFalse(rows["post_office_id"]["changed"])
        self.assertEqual(response.data["relationships"]["images"], {"added": 1, "removed": 0, "kept": 1, "skipped": 0})
        self.assertEqual(response.data["relationships"]["dates_seen"]["removed"], 1)
        self.assertIn(LIMIT_MARKING_COVER_LINKS, response.data["limitations"])
        self.assertTrue(response.data["has_changes"])
        self.assertEqual(self.counts(), before)

    def test_marking_restore_reconciles_scalars_images_dates_citations_in_one_version(self):
        expected_before = build_marking_snapshot(self.marking)
        self.client.force_authenticate(self.editor)
        response = self.client.post(
            f"/api/v2/markings/{self.marking.pk}/restore-version/", {"version_no": 1}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["new_version_no"], 3)
        self.marking.refresh_from_db()
        self.assertEqual(self.marking.inscription_txt, "RICHMOND")
        images = Image.objects.filter(subject_type="MARKING", subject_id=self.marking.pk).order_by("display_order")
        self.assertEqual([img.storage_filename for img in images], ["va/one.png", "va/two.png"])
        self.assertEqual(images[1].uploaded_by, self.editor)
        dates = DateSeen.objects.filter(subject_type="MARKING", subject_id=self.marking.pk)
        self.assertEqual([(d.date_year, d.granularity) for d in dates], [(1850, "DAY")])
        self.assertEqual(Citation.objects.filter(subject_type="MARKING", subject_id=self.marking.pk).count(), 1)
        txns = SubmissionTransaction.objects.filter(action=SubmissionTransaction.ACTION_RESTORE_VERSION)
        self.assertEqual(txns.count(), 1)
        txn = txns.get()
        self.assertEqual(txn.extra_payload["restored_from_version_no"], 1)
        self.assertIn(LIMIT_MARKING_COVER_LINKS, txn.extra_payload["limitations"])
        self.assertEqual(txn.extra_payload["relationships"]["images"]["added"], 1)
        strip = lambda snap: {k: v for k, v in snap.items() if k != "captured_at"}
        self.assertEqual(strip(txn.before_payload), strip(expected_before))
        self.assertEqual(MarkingVersion.objects.filter(marking=self.marking).count(), 3)
        self.assertEqual(MarkingVersion.objects.get(marking=self.marking, version_no=3).transaction, txn)

    def test_cover_restore_reconciles_links_and_valuation(self):
        self.client.force_authenticate(self.editor)
        preview = self.client.get(f"/api/v2/covers/{self.cover.pk}/restore-preview/?version_no=1")
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data["relationships"]["cover_markings"], {"added": 0, "removed": 0, "kept": 1, "skipped": 0})
        self.assertEqual(preview.data["relationships"]["valuations"]["added"], 1)
        self.assertTrue(preview.data["has_changes"])
        response = self.client.post(
            f"/api/v2/covers/{self.cover.pk}/restore-version/", {"version_no": 1}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["relationships"], preview.data["relationships"])
        link = CoverMarking.objects.get(cover=self.cover)
        self.assertEqual((link.marking_id, link.is_backstamp), (self.marking.pk, True))
        valuation = CoverValuation.objects.get(cover=self.cover)
        self.assertEqual((valuation.amt, valuation.appraisal_date), (Decimal("25.00"), date(2020, 1, 1)))
        self.assertEqual(CoverVersion.objects.filter(cover=self.cover).count(), 3)

    def test_cover_restore_that_adds_an_outside_region_link_is_forbidden(self):
        cover = Cover.objects.create(type="FC", **self.audit)
        CoverMarking.objects.create(cover=cover, marking=self.marking, **self.audit)
        CoverMarking.objects.create(cover=cover, marking=self.md_marking, **self.audit)
        create_cover_version(cover, None, self.admin)
        cover.cover_markings.filter(marking=self.md_marking).delete()
        before = self.counts()
        self.client.force_authenticate(self.editor)
        preview = self.client.get(f"/api/v2/covers/{cover.pk}/restore-preview/?version_no=1")
        self.assertEqual(preview.status_code, 403, preview.data)
        response = self.client.post(f"/api/v2/covers/{cover.pk}/restore-version/", {"version_no": 1}, format="json")
        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(cover.cover_markings.count(), 1)
        self.assertEqual(self.counts(), before)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(f"/api/v2/covers/{cover.pk}/restore-preview/?version_no=1").status_code, 200)

    def test_permissions_and_lookups(self):
        before = self.counts()
        urls = {
            "marking": (f"/api/v2/markings/{self.marking.pk}/restore-preview/", f"/api/v2/markings/{self.marking.pk}/restore-version/"),
            "cover": (f"/api/v2/covers/{self.cover.pk}/restore-preview/", f"/api/v2/covers/{self.cover.pk}/restore-version/"),
        }
        for kind, (preview_url, restore_url) in urls.items():
            for user, expected in ((self.md_editor, 403), (self.contributor, 403), (None, (401, 403))):
                with self.subTest(kind=kind, user=getattr(user, "username", "anonymous")):
                    self.client.force_authenticate(user)
                    codes = (
                        self.client.get(f"{preview_url}?version_no=1").status_code,
                        self.client.post(restore_url, {"version_no": 1}, format="json").status_code,
                    )
                    for code in codes:
                        self.assertIn(code, expected if isinstance(expected, tuple) else (expected,))
            self.client.force_authenticate(self.editor)
            with self.subTest(kind=kind, case="bad version"):
                self.assertEqual(self.client.get(f"{preview_url}?version_no=abc").status_code, 400)
                self.assertEqual(self.client.post(restore_url, {"version_no": "abc"}, format="json").status_code, 400)
                self.assertEqual(self.client.get(f"{preview_url}?version_no=99999999999").status_code, 400)
                self.assertEqual(self.client.get(f"{preview_url}?version_no=99").status_code, 404)
                self.assertEqual(self.client.post(restore_url, {"version_no": 99}, format="json").status_code, 404)
        self.assertEqual(self.counts(), before)
        MarkingRecycleBin.objects.create(marking=self.marking, removed_by=self.admin)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(f"{urls['marking'][0]}?version_no=1").status_code, 404)
        self.assertEqual(self.client.post(urls["marking"][1], {"version_no": 1}, format="json").status_code, 404)

    def test_failure_after_restore_rolls_back_everything(self):
        before = self.counts()
        client = APIClient(raise_request_exception=False)
        client.force_authenticate(self.editor)
        with mock.patch("common.api.v2.views.create_marking_version", side_effect=RuntimeError("boom")):
            response = client.post(
                f"/api/v2/markings/{self.marking.pk}/restore-version/", {"version_no": 1}, format="json"
            )
        self.assertEqual(response.status_code, 500)
        self.marking.refresh_from_db()
        self.assertEqual(self.marking.inscription_txt, "CHANGED")
        self.assertEqual(Image.objects.filter(subject_type="MARKING", subject_id=self.marking.pk).count(), 1)
        self.assertEqual(self.counts(), before)
