import hashlib
import json
import tempfile
from io import StringIO
from pathlib import Path
from unittest.mock import patch

import reversion
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import transaction
from django.test import TestCase, override_settings
from reversion.models import Version

from common import models as m
from common.audit import build_marking_snapshot
from common.collection_archive import MODELS, digest, json_text


class CollectionTransferTests(TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source_media = self.root / "source"
        self.target_media = self.root / "target"
        self.source_media.mkdir()
        self.target_media.mkdir()
        self.bundle = self.root / "bundle"
        self.user = get_user_model().objects.create_user("transfer-editor")
        self.stamp = {"created_by": self.user, "modified_by": self.user}
        # Roll back only fixture rows, keeping the bundle files. The restore
        # then runs against a database with different auto-increment IDs.
        self.source_savepoint = transaction.savepoint()
        self.region = m.Region.objects.create(code="USA-HI1", name="Hawaii", abbrev="HI", region_tier="STATE", **self.stamp)
        self.collection = m.Collection.objects.create(name="Hawaii", region=self.region, **self.stamp)
        self.office = m.PostOffice.objects.create(code="USA-HI1-HON", name="Honolulu", **self.stamp)
        m.PostOfficeRegion.objects.create(post_office=self.office, region=self.region, **self.stamp)
        self.color = m.Color.objects.create(name="BLACK", **self.stamp)
        with reversion.create_revision():
            reversion.set_user(self.user)
            self.marking = m.Marking.objects.create(code="HI-M1", post_office=self.office, type="TOWNMARK", color=self.color, is_manuscript=False, catalog_txt="Honolulu", inscription_txt="HONOLULU", **self.stamp)
        self.cover = m.Cover.objects.create(code="HI-C1", description="A test Cover", **self.stamp)
        m.CoverMarking.objects.create(cover=self.cover, marking=self.marking, placement="upper right", **self.stamp)
        self.image = self.make_image(self.marking.pk, "current.jpg", b"original scan")
        self.crop = self.make_image(self.marking.pk, "crop.jpg", b"crop", cropped_from=self.image)
        self.reference = m.ReferenceWork.objects.create(code="HI-REF", title="Hawaii reference", authorship="Author", publisher="Publisher", publication_year=1900, **self.stamp)
        m.Citation.objects.create(subject_type="MARKING", subject_id=self.marking.pk, reference_work=self.reference, citation_detail="page 1", **self.stamp)
        m.DateSeen.objects.create(subject_type="COVER", subject_id=self.cover.pk, date_year=1850, granularity="YEAR", **self.stamp)
        m.CoverValuation.objects.create(cover=self.cover, amt="12.50", **self.stamp)
        postmaster = m.Postmaster.objects.create(name="A. Person", sort_name="Person, A.", **self.stamp)
        m.PostmasterTenure.objects.create(post_office=self.office, postmaster=postmaster, event="appointment", date_appointed="1850-01-01", date_appointed_granularity="DAY", **self.stamp)
        self.pending = m.Contribution.objects.create(collection=self.collection, contributor=self.user, status="pending", submitted_data={
            "submission_kind": "cover", "parent_marking_id": self.marking.pk,
            "edit_cover_id": str(self.cover.pk), "color_id": self.color.pk,
            "reference_work_ids": [self.reference.pk],
            "cover_image_metas": [{"storage_filename": "pending.jpg"}],
        }, **self.stamp)
        self.rejected = m.Contribution.objects.create(collection=self.collection, contributor=self.user, status="rejected", submitted_data={"town": "Honolulu"}, **self.stamp)
        m.ContributionRecycleBin.objects.create(contribution=self.rejected, archived_by=self.user)
        tx = m.SubmissionTransaction.objects.create(actor=self.user, contribution=self.pending, marking=self.marking, cover=self.cover, action="submit", after_payload=build_marking_snapshot(self.marking), extra_payload={"previous_storage_filename": "history.jpg"})
        m.MarkingVersion.objects.create(marking=self.marking, version_no=1, transaction=tx, created_by=self.user, snapshot=build_marking_snapshot(self.marking))
        m.CoverVersion.objects.create(cover=self.cover, version_no=1, transaction=tx, created_by=self.user, snapshot={"cover_id": self.cover.pk})
        m.MarkingRecycleBin.objects.create(marking=self.marking, removed_by=self.user, reason="Review later")
        self.source_media.joinpath("pending.jpg").write_bytes(b"pending scan")
        self.source_media.joinpath("history.jpg").write_bytes(b"old scan")

    def make_image(self, subject_id, name, data, **extra):
        self.source_media.joinpath(name).write_bytes(data)
        return m.Image.objects.create(subject_type="MARKING", subject_id=subject_id, storage_filename=name, original_filename=name, file_checksum=hashlib.sha256(data).hexdigest(), file_size_bytes=len(data), mime_type="image/jpeg", image_width=10, image_height=10, image_view="FULL", uploaded_by=self.user, **extra, **self.stamp)

    def backup(self):
        with override_settings(MEDIA_ROOT=self.source_media):
            call_command("backup_collection", self.collection.pk, str(self.bundle), stdout=StringIO())

    def clear_source(self):
        transaction.savepoint_rollback(self.source_savepoint)
        ContentType.objects.clear_cache()

    def restore(self, **options):
        with override_settings(MEDIA_ROOT=self.target_media):
            call_command("restore_collection", str(self.bundle), stdout=StringIO(), **options)

    def verify(self):
        with override_settings(MEDIA_ROOT=self.target_media):
            call_command("verify_collection", str(self.bundle), stdout=StringIO())

    def test_complete_round_trip_and_repeat_with_different_ids(self):
        self.backup()
        source_marking_id = self.marking.pk
        self.clear_source()
        self.restore()
        marking = m.Marking.all_objects.get(code="HI-M1")
        self.assertNotEqual(marking.pk, source_marking_id)
        cover = m.Cover.all_objects.get(code="HI-C1")
        contribution = m.Contribution.objects.get(status="pending")
        self.assertEqual(contribution.submitted_data["parent_marking_id"], marking.pk)
        self.assertEqual(contribution.submitted_data["edit_cover_id"], str(cover.pk))
        self.assertEqual(m.ContributionRecycleBin.objects.count(), 1)
        self.assertEqual(m.MarkingRecycleBin.objects.count(), 1)
        self.assertEqual(m.PostmasterTenure.objects.count(), 1)
        self.assertEqual(m.Image.objects.get(storage_filename="crop.jpg").cropped_from.storage_filename, "current.jpg")
        self.assertEqual(m.MarkingVersion.objects.get().snapshot["marking_id"], marking.pk)
        version_data = json.loads(Version.objects.get().serialized_data)
        self.assertEqual(version_data[0]["pk"], marking.pk)
        self.assertEqual(self.target_media.joinpath("history.jpg").read_bytes(), b"old scan")
        self.verify()
        counts = {label: model._base_manager.count() for label, model in MODELS.items()}
        self.restore()
        self.verify()
        for label, count in counts.items():
            self.assertEqual(MODELS[label]._base_manager.count(), count, label)

    def external_marking(self):
        region = m.Region.objects.create(code="USA-CA1", name="California", abbrev="CA", region_tier="STATE", **self.stamp)
        office = m.PostOffice.objects.create(code="USA-CA1-SF", name="San Francisco", **self.stamp)
        m.PostOfficeRegion.objects.create(post_office=office, region=region, **self.stamp)
        return m.Marking.objects.create(code="CA-M1", post_office=office, type="TOWNMARK", is_manuscript=False, catalog_txt="SF", inscription_txt="SF", **self.stamp)

    def verification_report(self):
        report = self.root / "verified.json"
        with override_settings(MEDIA_ROOT=self.source_media), patch("common.collection_restore.instance_identity", return_value="production-test"):
            call_command("restore_collection", str(self.bundle), stdout=StringIO())
            call_command("verify_collection", str(self.bundle), report=str(report), stdout=StringIO())
        return report

    def test_shared_cover_requires_existing_external_marking(self):
        external = self.external_marking()
        m.CoverMarking.objects.create(cover=self.cover, marking=external, **self.stamp)
        self.backup()
        self.clear_source()
        with self.assertRaisesMessage(CommandError, "Missing external target record"):
            self.restore()
        self.assertEqual(m.Collection.objects.count(), 0)

    def test_shared_cover_and_external_marking_survive_guarded_removal(self):
        external = self.external_marking()
        m.CoverMarking.objects.create(cover=self.cover, marking=external, **self.stamp)
        self.backup()
        report = self.verification_report()
        args = {"region_code": self.region.code, "bundle": str(self.bundle), "verification_report": str(report), "stdout": StringIO()}
        with override_settings(MEDIA_ROOT=self.source_media):
            call_command("drop_ascc_state", dry_run=True, **args)
            self.assertTrue(m.Marking.all_objects.filter(pk=self.marking.pk).exists())
            call_command("drop_ascc_state", **args)
        self.assertFalse(m.Marking.all_objects.filter(pk=self.marking.pk).exists())
        self.assertTrue(m.Marking.all_objects.filter(pk=external.pk).exists())
        self.assertTrue(m.Cover.all_objects.filter(pk=self.cover.pk).exists())
        self.assertEqual(list(m.CoverMarking.objects.values_list("marking_id", flat=True)), [external.pk])
        self.assertTrue(m.Collection.objects.filter(pk=self.collection.pk).exists())
        self.assertEqual(m.Contribution.objects.count(), 0)
        self.assertTrue(self.source_media.joinpath("current.jpg").exists())

    def test_guard_refuses_stale_source_and_unrelated_report(self):
        self.backup()
        report = self.verification_report()
        args = {"region_code": self.region.code, "bundle": str(self.bundle), "verification_report": str(report), "stdout": StringIO()}
        m.Cover.all_objects.filter(pk=self.cover.pk).update(description="New source work")
        with override_settings(MEDIA_ROOT=self.source_media):
            with self.assertRaisesMessage(CommandError, "changed after backup"):
                call_command("drop_ascc_state", **args)
        self.assertTrue(m.Marking.all_objects.filter(pk=self.marking.pk).exists())
        data = json.loads(report.read_text())
        data["manifest_sha256"] = "wrong"
        report.write_text(json_text(data), encoding="ascii")
        with self.assertRaisesMessage(CommandError, "does not match"):
            call_command("drop_ascc_state", **args)

    def test_multiple_uncoded_entries_and_pending_rows_remain_distinct(self):
        for _ in range(2):
            m.Marking.objects.create(post_office=self.office, type="TOWNMARK", is_manuscript=True, catalog_txt="Uncoded", inscription_txt="Honolulu", **self.stamp)
            m.Contribution.objects.create(collection=self.collection, contributor=self.user, submitted_data={"town": "Honolulu"}, **self.stamp)
        self.backup()
        self.clear_source()
        self.restore()
        self.restore()
        self.assertEqual(m.Marking.all_objects.filter(code__isnull=True).count(), 2)
        self.assertEqual(m.Contribution.objects.count(), 4)

    def test_archived_history_keeps_deleted_reference_identity(self):
        m.MarkingVersion.objects.filter(marking=self.marking).update(snapshot={"color_id": 2147483647})
        self.backup()
        self.clear_source()
        self.restore()
        snapshot = m.MarkingVersion.objects.get().snapshot
        self.assertEqual(snapshot["color_id"]["source_reference"]["source_id"], "2147483647")
        self.verify()

    def test_source_removal_retains_shared_post_office(self):
        other = m.Region.objects.create(code="OTHER", name="Another Region", abbrev="OT", region_tier="STATE", **self.stamp)
        m.PostOfficeRegion.objects.create(post_office=self.office, region=other, **self.stamp)
        self.backup()
        report = self.verification_report()
        with override_settings(MEDIA_ROOT=self.source_media):
            call_command("drop_ascc_state", region_code=self.region.code, bundle=str(self.bundle), verification_report=str(report), stdout=StringIO())
        self.assertTrue(m.PostOffice.objects.filter(pk=self.office.pk).exists())
        self.assertFalse(m.Marking.all_objects.filter(pk=self.marking.pk).exists())

    def test_source_removal_blocks_outside_crop_dependency(self):
        external = self.external_marking()
        self.make_image(external.pk, "outside.jpg", b"outside crop", cropped_from=self.image)
        self.backup()
        report = self.verification_report()
        with override_settings(MEDIA_ROOT=self.source_media):
            with self.assertRaisesMessage(CommandError, "crop source"):
                call_command("drop_ascc_state", region_code=self.region.code, bundle=str(self.bundle), verification_report=str(report), stdout=StringIO())
        self.assertTrue(m.Marking.all_objects.filter(pk=self.marking.pk).exists())

    def test_empty_collection_round_trip(self):
        empty_region = m.Region.objects.create(code="EMPTY", name="Empty", abbrev="EM", region_tier="STATE", **self.stamp)
        empty = m.Collection.objects.create(name="Empty", region=empty_region, **self.stamp)
        with override_settings(MEDIA_ROOT=self.source_media):
            call_command("backup_collection", empty.pk, str(self.bundle), stdout=StringIO())
        self.clear_source()
        self.restore()
        self.verify()
        self.assertEqual(m.Collection.objects.get().name, "Empty")
        self.assertEqual(list(self.target_media.iterdir()), [])

    def test_missing_live_reference_does_not_publish_backup(self):
        self.pending.submitted_data["parent_marking_id"] = 2147483647
        self.pending.save()
        with self.assertRaisesMessage(CommandError, "Missing required source record"):
            self.backup()
        self.assertFalse(self.bundle.exists())

    def test_missing_reviewer_is_not_replaced_by_an_administrator(self):
        reviewer = get_user_model().objects.create_user("source-reviewer")
        self.rejected.reviewer = reviewer
        self.rejected.save()
        self.backup()
        self.clear_source()
        with self.assertRaisesMessage(CommandError, "source-reviewer"):
            self.restore()

    def test_repeat_restore_reuses_complete_files_from_an_interrupted_run(self):
        self.backup()
        self.clear_source()
        self.target_media.joinpath("current.jpg").write_bytes(b"original scan")
        self.restore()
        self.verify()
        self.assertEqual(self.target_media.joinpath("current.jpg").read_bytes(), b"original scan")

    def test_backup_preserves_non_ascii_text_as_ascii_json(self):
        m.Cover.all_objects.filter(pk=self.cover.pk).update(description="Hawai\u02bbi")
        self.backup()
        self.assertTrue(self.bundle.joinpath("records.json").read_bytes().isascii())
        self.clear_source()
        self.restore()
        self.assertEqual(m.Cover.all_objects.get().description, "Hawai\u02bbi")

    def test_bundle_can_restore_records_after_guarded_source_removal(self):
        self.backup()
        report = self.verification_report()
        with override_settings(MEDIA_ROOT=self.source_media):
            call_command("drop_ascc_state", region_code=self.region.code, bundle=str(self.bundle), verification_report=str(report), stdout=StringIO())
            call_command("restore_collection", str(self.bundle), stdout=StringIO())
            call_command("verify_collection", str(self.bundle), stdout=StringIO())
        self.assertEqual(m.Contribution.objects.count(), 2)
        self.assertEqual(m.Marking.all_objects.get().code, "HI-M1")

    def test_bundle_cannot_bind_user_by_destination_integer_id(self):
        self.backup()
        records_path = self.bundle / "records.json"
        manifest_path = self.bundle / "manifest.json"
        records = json.loads(records_path.read_text())
        key = f"common.contribution:{self.pending.pk}"
        records[key]["fields"]["contributor"] = self.user.pk
        manifest = json.loads(manifest_path.read_text())
        manifest["records_sha256"] = digest(records)
        records_path.write_text(json_text(records), encoding="ascii")
        manifest_path.write_text(json_text(manifest), encoding="ascii")
        with self.assertRaisesMessage(CommandError, "Invalid foreign key"):
            self.restore()

    def test_reversion_preserves_retired_fields_and_deleted_foreign_keys(self):
        version = Version.objects.get()
        data = json.loads(version.serialized_data)
        data[0]["fields"]["color"] = 2147483647
        data[0]["fields"]["retired_field"] = "Original source text"
        version.serialized_data = json.dumps(data)
        version.save()
        self.backup()
        self.clear_source()
        self.restore()
        restored = json.loads(Version.objects.get().serialized_data)[0]["fields"]
        self.assertEqual(restored["retired_field"], "Original source text")
        self.assertEqual(restored["color"]["source_reference"]["source_id"], "2147483647")
        self.verify()

    def test_crop_source_outside_collection_requires_target_match(self):
        external = self.external_marking()
        outside_image = self.make_image(external.pk, "outside-source.jpg", b"outside original")
        m.Image.objects.filter(pk=self.crop.pk).update(cropped_from=outside_image)
        self.backup()
        with override_settings(MEDIA_ROOT=self.source_media):
            call_command("restore_collection", str(self.bundle), stdout=StringIO())
            call_command("verify_collection", str(self.bundle), stdout=StringIO())
        self.assertEqual(m.Marking.all_objects.count(), 2)
        self.assertEqual(m.Image.objects.count(), 3)

    def test_county_entries_and_region_ancestors_are_included(self):
        country = m.Region.objects.create(code="USA", name="United States", abbrev="US", region_tier="COUNTRY", **self.stamp)
        self.region.parent_region = country
        self.region.save()
        county = m.Region.objects.create(code="USA-HI-COUNTY", name="Test County", abbrev="HI", region_tier="COUNTY", parent_region=self.region, **self.stamp)
        office = m.PostOffice.objects.create(name="County Office", **self.stamp)
        m.PostOfficeRegion.objects.create(post_office=office, region=county, **self.stamp)
        m.Marking.objects.create(code="COUNTY-M1", post_office=office, type="TOWNMARK", is_manuscript=True, catalog_txt="County Office", inscription_txt="County", **self.stamp)
        self.backup()
        self.clear_source()
        self.restore()
        self.verify()
        self.assertEqual(m.Marking.all_objects.count(), 2)
        self.assertEqual(m.Region.objects.count(), 3)

    def test_other_collection_contribution_blocks_state_removal(self):
        external = self.external_marking()
        region = external.post_office.post_office_regions.get().region
        other = m.Collection.objects.create(name="California", region=region, **self.stamp)
        m.Contribution.objects.create(collection=other, contributor=self.user, marking=self.marking, status="approved", **self.stamp)
        with self.assertRaisesMessage(CommandError, "Another Collection"):
            call_command("drop_ascc_state", region_code=self.region.code, stdout=StringIO())
        self.assertTrue(m.Marking.all_objects.filter(pk=self.marking.pk).exists())

    def test_pending_cover_aliases_include_an_unlinked_cover(self):
        orphan = m.Cover.objects.create(code="HI-C2", description="Unlinked Cover", **self.stamp)
        self.pending.submitted_data = {
            "submission_kind": "cover", "coverId": orphan.pk,
            "parentMarkingId": self.marking.pk,
        }
        self.pending.save()
        self.backup()
        self.clear_source()
        self.restore()
        self.verify()
        self.assertEqual(m.Cover.all_objects.count(), 2)
        self.assertEqual(
            m.Contribution.objects.get(status="pending").submitted_data["coverId"],
            m.Cover.all_objects.get(code="HI-C2").pk,
        )

    def test_dry_run_does_not_write_records_mappings_or_media(self):
        self.backup()
        self.clear_source()
        self.restore(dry_run=True)
        self.assertEqual(m.Marking.all_objects.count(), 0)
        self.assertEqual(m.CollectionTransferMap.objects.count(), 0)
        self.assertEqual(list(self.target_media.iterdir()), [])

    def test_conflicting_record_rolls_back_entire_graph(self):
        self.backup()
        m.Marking.all_objects.filter(pk=self.marking.pk).update(desc="Local edit")
        with self.assertRaisesMessage(CommandError, "Target differs"):
            self.restore()
        self.assertEqual(m.Marking.all_objects.get(pk=self.marking.pk).desc, "Local edit")
        self.assertEqual(m.CollectionTransferMap.objects.count(), 0)
        self.assertEqual(list(self.target_media.iterdir()), [])

    def test_missing_user_stops_without_fallback(self):
        self.backup()
        self.clear_source()
        get_user_model().objects.filter(pk=self.user.pk).update(username="different-user")
        with self.assertRaisesMessage(CommandError, "Missing target user"):
            self.restore()
        self.assertEqual(m.Collection.objects.count(), 0)

    def test_corrupt_bundle_file_is_rejected(self):
        self.backup()
        self.bundle.joinpath("media/current.jpg").write_bytes(b"bad")
        with self.assertRaisesMessage(CommandError, "damaged bundle media"):
            self.restore()

    def test_different_existing_media_is_not_overwritten(self):
        self.backup()
        self.clear_source()
        self.target_media.joinpath("current.jpg").write_bytes(b"unrelated")
        with self.assertRaisesMessage(CommandError, "conflicting target media"):
            self.restore()
        self.assertEqual(self.target_media.joinpath("current.jpg").read_bytes(), b"unrelated")

    def test_missing_source_file_does_not_publish_bundle(self):
        self.source_media.joinpath("pending.jpg").unlink()
        with self.assertRaisesMessage(CommandError, "Missing source media"):
            self.backup()
        self.assertFalse(self.bundle.exists())

    def test_existing_destination_is_refused(self):
        self.bundle.mkdir()
        with self.assertRaisesMessage(CommandError, "already exists"):
            self.backup()

    def test_damaged_records_and_unsupported_schema_are_rejected(self):
        self.backup()
        path = self.bundle / "records.json"
        records = json.loads(path.read_text())
        records.pop(next(iter(records)))
        path.write_text(json_text(records), encoding="ascii")
        with self.assertRaisesMessage(CommandError, "checksum differs"):
            self.restore()
        manifest_path = self.bundle / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["schema"] = "unknown"
        manifest_path.write_text(json_text(manifest), encoding="ascii")
        with self.assertRaisesMessage(CommandError, "Unsupported"):
            self.restore()

    def test_path_traversal_is_rejected(self):
        self.backup()
        path = self.bundle / "manifest.json"
        manifest = json.loads(path.read_text())
        manifest["files"]["../outside.jpg"] = {"sha256": "", "size": 0}
        path.write_text(json_text(manifest), encoding="ascii")
        with self.assertRaisesMessage(CommandError, "Media manifest does not cover"):
            self.restore()

    def test_source_path_traversal_and_symlinks_are_rejected(self):
        m.Image.objects.filter(pk=self.image.pk).update(storage_filename="../outside.jpg")
        with self.assertRaisesMessage(CommandError, "Unsafe media path"):
            self.backup()
        m.Image.objects.filter(pk=self.image.pk).update(storage_filename="current.jpg")
        self.source_media.joinpath("current.jpg").unlink()
        self.source_media.joinpath("current.jpg").symlink_to(self.source_media / "crop.jpg")
        with self.assertRaisesMessage(CommandError, "Symlink"):
            self.backup()

    def test_extra_target_relationship_fails_verification(self):
        self.backup()
        self.clear_source()
        self.restore()
        cover = m.Cover.all_objects.get(code="HI-C1")
        m.DateSeen.objects.create(subject_type="COVER", subject_id=cover.pk, date_year=1851, granularity="YEAR", **self.stamp)
        with self.assertRaisesMessage(CommandError, "Target related records differ"):
            self.verify()

    def test_media_failure_rolls_back_and_retry_succeeds(self):
        self.backup()
        self.clear_source()
        from common.collection_restore import check_media
        def fail_after_install(manifest, root, require_all):
            if require_all:
                raise OSError("Simulated disk failure")
            return check_media(manifest, root, require_all)
        with patch("common.collection_restore.check_media", side_effect=fail_after_install):
            with self.assertRaisesMessage(CommandError, "Simulated disk failure"):
                self.restore()
        self.assertEqual(m.Collection.objects.count(), 0)
        self.assertEqual(m.CollectionTransferMap.objects.count(), 0)
        self.assertEqual(list(self.target_media.iterdir()), [])
        self.restore()
        self.verify()

    def test_verification_detects_changed_record_and_file(self):
        self.backup()
        self.clear_source()
        self.restore()
        self.target_media.joinpath("history.jpg").write_bytes(b"different")
        with self.assertRaisesMessage(CommandError, "conflicting target media"):
            self.verify()
        self.target_media.joinpath("history.jpg").write_bytes(b"old scan")
        m.Cover.all_objects.update(description="Changed")
        with self.assertRaisesMessage(CommandError, "Target differs"):
            self.verify()
