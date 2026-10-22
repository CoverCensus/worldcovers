"""verify_media_integrity reports child rows whose subject is gone (T51)."""
import json
import tempfile
from io import StringIO
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from common.models import Citation, Color, DateSeen, Image, Marking, PostOffice, ReferenceWork

User = get_user_model()
GONE_SUBJECT_ID = 999_999


class OrphanRowReportTests(TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.media = Path(self.temporary.name)
        override = override_settings(MEDIA_ROOT=self.media)
        override.enable()
        self.addCleanup(override.disable)
        self.user = User.objects.create_user("integrity-user", password="pw")
        self.stamp = {"created_by": self.user, "modified_by": self.user}
        color = Color.objects.create(name="Black", **self.stamp)
        office = PostOffice.objects.create(name="Richmond", **self.stamp)
        self.marking = Marking.objects.create(
            type="TOWNMARK", inscription_txt="KEPT", is_manuscript=True,
            color=color, post_office=office, **self.stamp,
        )
        self.reference = ReferenceWork.objects.create(
            code="REF1", title="Reference Work", authorship="Author",
            publisher="Publisher", publication_year=1900, **self.stamp,
        )
        self._rows("MARKING", self.marking.pk, "kept.jpg")
        self._rows("MARKING", GONE_SUBJECT_ID, "gone.jpg")
        self.assertFalse(Marking.all_objects.filter(pk=GONE_SUBJECT_ID).exists())

    def _rows(self, subject_type, subject_id, filename):
        self.media.joinpath(filename).write_bytes(b"scan")
        Image.objects.create(
            subject_type=subject_type, subject_id=subject_id,
            original_filename=filename, storage_filename=filename,
            file_checksum="", mime_type="image/jpeg", image_width=1,
            image_height=1, file_size_bytes=4, image_view="FULL",
            uploaded_by=self.user, **self.stamp,
        )
        Citation.objects.create(
            reference_work=self.reference, subject_type=subject_type,
            subject_id=subject_id, citation_detail="p. 1", **self.stamp,
        )
        DateSeen.objects.create(
            subject_type=subject_type, subject_id=subject_id,
            date_year=1850, granularity="YEAR", **self.stamp,
        )

    def test_orphan_rows_are_reported_and_fail_only_when_asked(self):
        report_path = self.media.parent / "report.json"
        out = StringIO()
        call_command("verify_media_integrity", json_out=str(report_path), stdout=out)

        report = json.loads(report_path.read_text())
        self.assertEqual(
            set(report["orphan_rows"]),
            {model._meta.db_table for model in (Image, Citation, DateSeen)},
        )
        orphans = {
            table: [(row["subject_type"], row["subject_id"], len(row["ids"])) for row in rows]
            for table, rows in report["orphan_rows"].items()
        }
        for table, rows in orphans.items():
            self.assertEqual(rows, [("MARKING", GONE_SUBJECT_ID, 1)], table)
        self.assertIn("orphan rows (images: row, no subject): 1", out.getvalue())
        self.assertIn("media integrity OK", out.getvalue())

        with self.assertRaisesMessage(CommandError, "FAILED"):
            call_command("verify_media_integrity", fail_on_orphans=True, stdout=StringIO())
