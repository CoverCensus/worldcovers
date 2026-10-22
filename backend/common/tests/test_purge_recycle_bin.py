import hashlib
import json
import shutil
import tempfile
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from common.models import (
    Citation,
    Collection,
    Color,
    Contribution,
    ContributionRecycleBin,
    Cover,
    CoverMarking,
    CoverRecycleBin,
    CoverValuation,
    CoverVersion,
    DateSeen,
    Image,
    Marking,
    MarkingRecycleBin,
    MarkingVersion,
    PostOffice,
    ReferenceWork,
    Region,
    SubmissionTransaction,
)
from common.purge_archive import collect_scope, verify_bundle, write_bundle


User = get_user_model()


class PurgeRecycleBinCommandTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("purge-user", password="pw")
        self.color = Color.objects.create(
            name="Black",
            created_by=self.user,
            modified_by=self.user,
        )
        self.post_office = PostOffice.objects.create(
            name="Richmond",
            created_by=self.user,
            modified_by=self.user,
        )
        self.reference_work = ReferenceWork.objects.create(
            code="REF1",
            title="Reference Work",
            authorship="Author",
            publisher="Publisher",
            publication_year=1900,
            created_by=self.user,
            modified_by=self.user,
        )

    def test_dry_run_reports_deletions_and_leaves_records_restorable(self):
        binned_marking = self._marking("BINNED MARKING")
        binned_cover = self._cover("C-BINNED")
        self._bin_marking(binned_marking)
        self._bin_cover(binned_cover)

        out = StringIO()
        with patch("common.purge_archive.write_bundle") as write_bundle_mock:
            call_command("purge_recycle_bin", dry_run=True, no_input=True, stdout=out)

        # Scope is reported; no archive is written unless --archive-dir asks for one.
        self.assertIn("[DRY RUN]", out.getvalue())
        self.assertIn("common.marking                     deleted   rows=     1", out.getvalue())
        self.assertIn("no archive written", out.getvalue())
        write_bundle_mock.assert_not_called()
        self.assertTrue(Marking.all_objects.filter(pk=binned_marking.pk).exists())
        self.assertTrue(Cover.all_objects.filter(pk=binned_cover.pk).exists())
        self.assertTrue(
            MarkingRecycleBin.objects.filter(marking=binned_marking).exists()
        )
        self.assertTrue(CoverRecycleBin.objects.filter(cover=binned_cover).exists())
        self.assertFalse(Marking.objects.filter(pk=binned_marking.pk).exists())
        self.assertFalse(Cover.objects.filter(pk=binned_cover.pk).exists())

    def test_default_command_aborts_without_exact_confirmation(self):
        binned_marking = self._marking("BINNED MARKING")
        self._bin_marking(binned_marking)

        with patch("builtins.input", return_value="no"):
            with self.assertRaises(CommandError):
                call_command("purge_recycle_bin", stdout=StringIO())

        self.assertTrue(Marking.all_objects.filter(pk=binned_marking.pk).exists())
        self.assertTrue(
            MarkingRecycleBin.objects.filter(marking=binned_marking).exists()
        )

    def test_no_input_purges_only_binned_subjects_and_their_polymorphic_rows(self):
        binned_marking = self._marking("BINNED MARKING")
        kept_marking = self._marking("KEPT MARKING")
        binned_cover = self._cover("C-BINNED")
        kept_cover = self._cover("C-KEPT")
        self._bin_marking(binned_marking)
        self._bin_cover(binned_cover)
        binned_marking_txn = self._transaction(marking=binned_marking)
        binned_cover_txn = self._transaction(cover=binned_cover)

        self._polymorphic_rows("MARKING", binned_marking.pk, "binned-marking")
        self._polymorphic_rows("MARKING", kept_marking.pk, "kept-marking")
        self._polymorphic_rows("COVER", binned_cover.pk, "binned-cover")
        self._polymorphic_rows("COVER", kept_cover.pk, "kept-cover")

        # These Image rows have no files; the archive records them as missing.
        with tempfile.TemporaryDirectory() as archive_root:
            call_command(
                "purge_recycle_bin", no_input=True, allow_missing_media=True,
                archive_dir=str(Path(archive_root) / "bundle"), stdout=StringIO(),
            )

        self.assertFalse(Marking.all_objects.filter(pk=binned_marking.pk).exists())
        self.assertFalse(Cover.all_objects.filter(pk=binned_cover.pk).exists())
        self.assertFalse(
            MarkingRecycleBin.objects.filter(marking_id=binned_marking.pk).exists()
        )
        self.assertFalse(
            CoverRecycleBin.objects.filter(cover_id=binned_cover.pk).exists()
        )
        self.assert_subject_rows_deleted("MARKING", binned_marking.pk)
        self.assert_subject_rows_deleted("COVER", binned_cover.pk)

        self.assertTrue(Marking.objects.filter(pk=kept_marking.pk).exists())
        self.assertTrue(Cover.objects.filter(pk=kept_cover.pk).exists())
        self.assert_subject_rows_kept("MARKING", kept_marking.pk)
        self.assert_subject_rows_kept("COVER", kept_cover.pk)

        binned_marking_txn.refresh_from_db()
        binned_cover_txn.refresh_from_db()
        self.assertIsNone(binned_marking_txn.marking_id)
        self.assertIsNone(binned_cover_txn.cover_id)

    def _marking(self, text):
        return Marking.objects.create(
            type="TOWNMARK",
            inscription_txt=text,
            is_manuscript=True,
            color=self.color,
            post_office=self.post_office,
            created_by=self.user,
            modified_by=self.user,
        )

    def _cover(self, code):
        return Cover.objects.create(
            code=code,
            created_by=self.user,
            modified_by=self.user,
        )

    def _bin_marking(self, marking):
        return MarkingRecycleBin.objects.create(
            marking=marking,
            removed_by=self.user,
            reason="test",
        )

    def _bin_cover(self, cover):
        return CoverRecycleBin.objects.create(
            cover=cover,
            removed_by=self.user,
            reason="test",
        )

    def _transaction(self, *, marking=None, cover=None):
        return SubmissionTransaction.objects.create(
            actor=self.user,
            action=SubmissionTransaction.ACTION_MARKING_REMOVED,
            marking=marking,
            cover=cover,
            source=SubmissionTransaction.SOURCE_SYSTEM,
        )

    def _polymorphic_rows(self, subject_type, subject_id, label):
        Image.objects.create(
            subject_type=subject_type,
            subject_id=subject_id,
            original_filename=f"{label}.jpg",
            storage_filename=f"{label}.jpg",
            file_checksum=label,
            mime_type="image/jpeg",
            image_width=100,
            image_height=100,
            file_size_bytes=1000,
            image_view="FULL" if subject_type == "MARKING" else "FRONT",
            uploaded_by=self.user,
            created_by=self.user,
            modified_by=self.user,
        )
        DateSeen.objects.create(
            subject_type=subject_type,
            subject_id=subject_id,
            date="1860-01-01",
            granularity="DAY",
            created_by=self.user,
            modified_by=self.user,
        )
        Citation.objects.create(
            reference_work=self.reference_work,
            subject_type=subject_type,
            subject_id=subject_id,
            citation_detail="p. 1",
            created_by=self.user,
            modified_by=self.user,
        )

    def assert_subject_rows_deleted(self, subject_type, subject_id):
        self.assertFalse(
            Image.objects.filter(
                subject_type=subject_type,
                subject_id=subject_id,
            ).exists()
        )
        self.assertFalse(
            DateSeen.objects.filter(
                subject_type=subject_type,
                subject_id=subject_id,
            ).exists()
        )
        self.assertFalse(
            Citation.objects.filter(
                subject_type=subject_type,
                subject_id=subject_id,
            ).exists()
        )

    def assert_subject_rows_kept(self, subject_type, subject_id):
        self.assertTrue(
            Image.objects.filter(
                subject_type=subject_type,
                subject_id=subject_id,
            ).exists()
        )
        self.assertTrue(
            DateSeen.objects.filter(
                subject_type=subject_type,
                subject_id=subject_id,
            ).exists()
        )
        self.assertTrue(
            Citation.objects.filter(
                subject_type=subject_type,
                subject_id=subject_id,
            ).exists()
        )


class PurgeArchiveTests(TestCase):
    """The purge archives every row it deletes or relinks, verified first (T51)."""

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.media = self.root / "media"
        self.media.mkdir()
        override = override_settings(MEDIA_ROOT=self.media)
        override.enable()
        self.addCleanup(override.disable)

        self.user = User.objects.create_user("archive-user", password="pw")
        self.stamp = {"created_by": self.user, "modified_by": self.user}
        color = Color.objects.create(name="Black", **self.stamp)
        office = PostOffice.objects.create(name="Richmond", **self.stamp)
        region = Region.objects.create(
            code="USA-VA1", name="Virginia", abbrev="VA", region_tier="STATE", **self.stamp,
        )
        collection = Collection.objects.create(name="Virginia", region=region, **self.stamp)
        reference = ReferenceWork.objects.create(
            code="REF1", title="Reference Work", authorship="Author",
            publisher="Publisher", publication_year=1900, **self.stamp,
        )

        def marking(text):
            return Marking.objects.create(
                type="TOWNMARK", inscription_txt=text, is_manuscript=True,
                color=color, post_office=office, **self.stamp,
            )

        self.binned = marking("BINNED")
        self.kept = marking("KEPT")
        self.binned_cover = Cover.objects.create(code="C-BINNED", **self.stamp)
        self.kept_cover = Cover.objects.create(code="C-KEPT", **self.stamp)
        MarkingRecycleBin.objects.create(marking=self.binned, removed_by=self.user, reason="dupe")
        CoverRecycleBin.objects.create(cover=self.binned_cover, removed_by=self.user, reason="dupe")
        # The kept Cover's link to the binned Marking is a CASCADE casualty.
        self.kept_link = CoverMarking.objects.create(
            cover=self.kept_cover, marking=self.binned, **self.stamp,
        )
        CoverMarking.objects.create(cover=self.binned_cover, marking=self.binned, **self.stamp)
        # One file shared by a binned and a kept Image row (colour fan-out).
        self.shared_bytes = b"shared scan bytes"
        self.image = self._image(self.binned.pk, "va/shared.jpg", self.shared_bytes)
        self._image(self.kept.pk, "va/shared.jpg", self.shared_bytes)
        self.crop = self._image(self.kept.pk, "va/crop.jpg", b"crop", cropped_from=self.image)
        for subject_type, subject_id in (("MARKING", self.binned.pk), ("COVER", self.binned_cover.pk)):
            Citation.objects.create(
                reference_work=reference, subject_type=subject_type,
                subject_id=subject_id, citation_detail="p. 1", **self.stamp,
            )
            DateSeen.objects.create(
                subject_type=subject_type, subject_id=subject_id,
                date_year=1850, granularity="YEAR", **self.stamp,
            )
        self.contribution = Contribution.objects.create(
            marking=self.binned, collection=collection, contributor=self.user,
            status=Contribution.STATUS_APPROVED, submitted_data={"town": "Richmond"},
            **self.stamp,
        )
        ContributionRecycleBin.objects.create(contribution=self.contribution, archived_by=self.user)
        self.transaction = SubmissionTransaction.objects.create(
            actor=self.user, action=SubmissionTransaction.ACTION_APPROVE,
            marking=self.binned, cover=self.binned_cover, contribution=self.contribution,
            source=SubmissionTransaction.SOURCE_SYSTEM,
        )
        MarkingVersion.objects.create(
            marking=self.binned, version_no=1, transaction=self.transaction,
            created_by=self.user, snapshot={"inscription_txt": "BINNED"},
        )
        CoverVersion.objects.create(
            cover=self.binned_cover, version_no=1, transaction=self.transaction,
            created_by=self.user, snapshot={"code": "C-BINNED"},
        )
        CoverValuation.objects.create(cover=self.binned_cover, amt="12.50", **self.stamp)

    def _image(self, subject_id, name, data, **extra):
        path = self.media / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return Image.objects.create(
            subject_type="MARKING", subject_id=subject_id, original_filename=Path(name).name,
            storage_filename=name, file_checksum=hashlib.sha256(data).hexdigest(),
            file_size_bytes=len(data), mime_type="image/jpeg", image_width=10,
            image_height=10, image_view="FULL", uploaded_by=self.user, **extra, **self.stamp,
        )

    def _counts(self):
        return {
            model._meta.label_lower: model._base_manager.count()
            for model in apps.get_app_config("common").get_models()
            if not model._meta.proxy
        }

    def test_purge_archives_first_and_loaddata_restores_everything(self):
        before = self._counts()
        bundle = self.root / "bundle"

        out = StringIO()
        call_command("purge_recycle_bin", no_input=True, archive_dir=str(bundle), stdout=out)

        manifest = json.loads((bundle / "manifest.json").read_text())
        self.assertEqual(manifest["schema"], "worldcovers.purge_archive.v1")
        self.assertEqual(set(manifest["files"]), {"va/shared.jpg"})
        self.assertEqual(manifest["shared_files"], ["va/shared.jpg"])
        self.assertEqual(manifest["counts"]["deleted"]["common.marking"], 1)
        self.assertEqual(manifest["counts"]["relinked"]["common.submissiontransaction"], 1)
        self.assertEqual(manifest["counts"]["relinked"]["common.image"], 1)
        self.assertIn("Archive written and verified", out.getvalue())

        # Deleted, relinked, and the file left alone.
        self.assertFalse(Marking.all_objects.filter(pk=self.binned.pk).exists())
        self.assertFalse(Contribution.objects.filter(pk=self.contribution.pk).exists())
        self.assertFalse(CoverMarking.objects.filter(pk=self.kept_link.pk).exists())
        self.transaction.refresh_from_db()
        self.assertIsNone(self.transaction.marking_id)
        self.assertIsNone(self.transaction.contribution_id)
        self.crop.refresh_from_db()
        self.assertIsNone(self.crop.cropped_from_id)
        self.assertEqual((self.media / "va/shared.jpg").read_bytes(), self.shared_bytes)
        # Every model whose row count moved is named in the manifest: a
        # cascade the archive missed would show up here.
        after = self._counts()
        changed = {label for label in before if before[label] != after[label]}
        self.assertEqual(changed, {
            label for label, count in manifest["counts"]["deleted"].items() if count
        })

        # Restore: rows return with their original keys, still in the bin.
        (self.media / "va/shared.jpg").unlink()
        call_command("loaddata", str(bundle / "records.json"), verbosity=0)
        shutil.copytree(bundle / "media", self.media, dirs_exist_ok=True)

        self.assertEqual(self._counts(), before)
        self.assertTrue(MarkingRecycleBin.objects.filter(marking_id=self.binned.pk).exists())
        self.assertFalse(Marking.objects.filter(pk=self.binned.pk).exists())
        self.assertTrue(Contribution.objects.filter(pk=self.contribution.pk).exists())
        self.assertTrue(CoverMarking.objects.filter(pk=self.kept_link.pk).exists())
        self.transaction.refresh_from_db()
        self.assertEqual(self.transaction.marking_id, self.binned.pk)
        self.crop.refresh_from_db()
        self.assertEqual(self.crop.cropped_from_id, self.image.pk)
        self.assertEqual(
            hashlib.sha256((self.media / "va/shared.jpg").read_bytes()).hexdigest(),
            manifest["files"]["va/shared.jpg"]["sha256"],
        )

    def test_damaged_or_missing_archive_blocks_the_purge(self):
        scope = collect_scope([self.binned.pk], [self.binned_cover.pk])
        bundle = self.root / "bundle"
        write_bundle(scope, bundle)
        archived = bundle / "media" / "va" / "shared.jpg"
        archived.write_bytes(self.shared_bytes[:-1] + b"X")
        with self.assertRaisesMessage(CommandError, "damaged archive media"):
            verify_bundle(bundle, scope)

        (self.media / "va/shared.jpg").unlink()
        with self.assertRaisesMessage(CommandError, "Missing source media"):
            write_bundle(scope, self.root / "bundle-2")
        manifest = write_bundle(scope, self.root / "bundle-3", allow_missing_media=True)
        self.assertEqual(manifest["missing_files"], ["va/shared.jpg"])

        with patch(
            "common.management.commands.purge_recycle_bin.write_bundle",
            side_effect=CommandError("archive failed"),
        ):
            with self.assertRaisesMessage(CommandError, "archive failed"):
                call_command("purge_recycle_bin", no_input=True, archive_dir=str(self.root / "x"), stdout=StringIO())
        self.assertTrue(Marking.all_objects.filter(pk=self.binned.pk).exists())
        self.assertTrue(Contribution.objects.filter(pk=self.contribution.pk).exists())

    def test_dry_run_with_archive_dir_rehearses_the_archive(self):
        bundle = self.root / "rehearsal"
        out = StringIO()
        call_command("purge_recycle_bin", dry_run=True, no_input=True, archive_dir=str(bundle), stdout=out)
        self.assertTrue((bundle / "manifest.json").is_file())
        self.assertIn("[DRY RUN]", out.getvalue())
        self.assertTrue(Marking.all_objects.filter(pk=self.binned.pk).exists())
        self.assertTrue(Contribution.objects.filter(pk=self.contribution.pk).exists())
