import csv
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from common.api.v2.views import _approve_contribution
from common.contribution_apply import ContributionApplyError
from common.models import (
    CatalogSourceItem,
    Citation,
    Color,
    Contribution,
    Cover,
    CoverMarking,
    DateSeen,
    Image,
    Marking,
    PostOffice,
    PostOfficeRegion,
    ReferenceWork,
    Region,
)


class FloridaReconciliationTests(TestCase):
    def setUp(self):
        self.actor = get_user_model().objects.create_user("fl-import")
        self.stamp = {"created_by": self.actor, "modified_by": self.actor}
        tmp = TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.bundle = Path(tmp.name)
        self.office = PostOffice.objects.create(code="ASCC-O1", name="Apalachicola", **self.stamp)
        fl = Region.objects.create(
            code="USA-FL1", name="Florida", abbrev="FL", region_tier="STATE", **self.stamp
        )
        PostOfficeRegion.objects.create(post_office=self.office, region=fl, **self.stamp)
        black = Color.objects.create(name="BLACK", **self.stamp)
        self.marking = Marking.objects.create(
            code="ASCC-M1",
            type="TOWNMARK",
            inscription_txt="APALACHICOLA/FLORIDA",
            is_manuscript=False,
            color=black,
            post_office=self.office,
            catalog_txt="Original ASCC listing",
            **self.stamp,
        )
        self.day = {
            "granularity": "DAY",
            "date": "1833-05-11",
            "date_year": 1833,
            "date_month": 5,
            "date_day": 11,
        }
        DateSeen.objects.create(
            subject_type="MARKING", subject_id=self.marking.pk, **self.day, **self.stamp
        )
        ref = ReferenceWork.objects.create(
            code="ASCC6",
            title="ASCC",
            authorship="A",
            publication_year=2026,
            publisher="B",
            **self.stamp,
        )
        for page in ("p. 1", "p. 2"):
            Citation.objects.create(
                subject_type="MARKING",
                subject_id=self.marking.pk,
                reference_work=ref,
                citation_detail=page,
                **self.stamp,
            )
        self.mark = "FPHC2-FL-0072-t001-r002"
        self.cover = "FPHC2-C-0072-i001"
        off = "FPHC2-0072-l001"
        self.row = {
            "code": self.mark,
            "type": "TOWNMARK",
            "post_office": off,
            "inscription_txt": "APALACHICOLA / FLORIDA",
            "width": "22",
            "height": "17",
            "color": "BLACK",
            "is_manuscript": "False",
            "is_irreg": "False",
            "catalog_txt": "Printed Florida listing",
        }
        (self.bundle / "fphc_manifest.json").write_text('{"catalog":"FPHC2"}')
        self.write(
            "reference_works",
            [
                {
                    "code": "FPHC2",
                    "title": "Florida",
                    "authorship": "A",
                    "publisher": "FPHS",
                    "publication_year": 2021,
                    "created_by": self.actor.pk,
                    "modified_by": self.actor.pk,
                }
            ],
        )
        for stem in ("colors", "shapes", "letterings"):
            (self.bundle / (stem + ".csv")).write_text("name\n")
        (self.bundle / "regions.csv").write_text("code\n")
        self.write("markings", [self.row])
        self.write("post_offices", [{"code": off, "name": "APALACHICOLA"}])
        self.write("post_office_regions", [{"post_office": off, "region": "USA-FL1"}])
        self.write(
            "covers",
            [
                {
                    "code": self.cover,
                    "type": "ENV",
                    "has_adhesive": "False",
                    "description": "Letter to Jones",
                }
            ],
        )
        self.write(
            "cover_markings", [{"cover": self.cover, "marking": self.mark, "is_backstamp": "False"}]
        )
        self.write("dates_seen", [dict(subject_type="MARKING", subject_id=self.mark, **self.day)])
        self.write(
            "citations",
            [
                {
                    "subject_type": k,
                    "subject_id": c,
                    "reference_work": "FPHC2",
                    "citation_detail": "p. 72",
                }
                for k, c in (("MARKING", self.mark), ("COVER", self.cover))
            ],
        )
        self.image = {
            "subject_type": "COVER",
            "subject_id": self.cover,
            "storage_filename": "fl/scan.png",
            "file_checksum": "a" * 64,
            "image_view": "FRONT",
            "original_filename": "scan.png",
            "mime_type": "image/png",
            "image_width": 100,
            "image_height": 80,
            "file_size_bytes": 300,
        }
        self.write("images", [self.image])

    def write(self, stem, rows):
        with (self.bundle / (stem + ".csv")).open("w", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)

    def load(self, *args):
        call_command(
            "fphc",
            "import",
            str(self.bundle),
            "--actor",
            str(self.actor.pk),
            *args,
            stdout=StringIO(),
        )

    def approve(self, code):
        source = CatalogSourceItem.objects.get(source_key=code)
        return _approve_contribution(
            source.contribution, actor=self.actor, review_notes="Checked against the source"
        )

    def test_preview_queue_approve_and_repeat(self):
        self.load("--dry-run")
        self.assertFalse(CatalogSourceItem.objects.exists())
        self.assertFalse(Contribution.objects.exists())
        self.load()
        self.load()
        self.assertEqual(Contribution.objects.filter(status="pending").count(), 2)
        self.assertEqual(PostOffice.objects.count(), 1)
        self.assertFalse(Cover.objects.exists())
        with self.assertRaisesMessage(ContributionApplyError, "Approve the linked"):
            self.approve(self.cover)
        self.approve(self.mark)
        self.approve(self.cover)
        self.load()
        self.marking.refresh_from_db()
        self.assertEqual((self.marking.width, self.marking.height), (22, 17))
        self.assertEqual(self.marking.catalog_txt, "Original ASCC listing")
        self.assertEqual(Marking.objects.count(), 1)
        self.assertEqual(CoverMarking.objects.get().marking_id, self.marking.pk)
        self.assertEqual(Image.objects.get().file_checksum, "a" * 64)
        self.assertEqual(DateSeen.objects.count(), 1)
        self.assertEqual(Citation.objects.count(), 4)
        self.assertEqual(Contribution.objects.count(), 2)
        self.assertEqual(CatalogSourceItem.objects.filter(applied=True).count(), 3)

    def test_changed_target_requires_review_then_separate_listing(self):
        self.load()
        self.marking.width = 29
        self.marking.save()
        with self.assertRaisesMessage(ContributionApplyError, "Refresh"):
            self.approve(self.mark)
        self.load("--refresh-pending")
        source = CatalogSourceItem.objects.get(source_key=self.mark)
        self.assertEqual(source.decision["action"], "create")
        self.approve(self.mark)
        self.marking.refresh_from_db()
        self.assertEqual(self.marking.width, 29)
        self.assertEqual(Marking.objects.count(), 2)
        self.row["width"] = "30"
        self.write("markings", [self.row])
        with self.assertRaisesMessage(CommandError, "changed"):
            self.load()

    def test_cover_reuse_requires_a_whole_cover_image_and_common_marking(self):
        original = Cover.objects.create(type="ENV", code="ASCC-C1", **self.stamp)
        CoverMarking.objects.create(cover=original, marking=self.marking, **self.stamp)
        self.write(
            "cover_markings",
            [
                {
                    "cover": self.cover,
                    "marking": self.mark,
                    "is_backstamp": "False",
                    "placement": "upper left",
                }
            ],
        )
        attrs = dict(self.image, subject_id=original.pk, uploaded_by=self.actor, **self.stamp)
        Image.objects.create(**attrs)
        self.load()
        self.approve(self.mark)
        self.approve(self.cover)
        self.assertEqual(Cover.objects.count(), 1)
        self.assertEqual(Image.objects.count(), 1)
        self.assertEqual(CoverMarking.objects.count(), 1)
        self.assertEqual(CoverMarking.objects.get().placement, "upper left")
        original.refresh_from_db()
        self.assertEqual(original.description, "Letter to Jones")

    def test_conflicting_printed_dimensions_keep_listings_separate(self):
        self.marking.catalog_txt = "Townmark (May 11, 1833;SL-28x3[MDD];Black)"
        self.marking.save()
        self.load()
        item = CatalogSourceItem.objects.get(source_key=self.mark)
        self.assertEqual(item.decision["action"], "create")
        self.assertIn("dimensions in catalog text", item.decision["reason"])
        self.approve(self.mark)
        self.marking.refresh_from_db()
        self.assertIsNone(self.marking.width)

    def test_ambiguous_markings_remain_separate(self):
        twin = Marking.objects.get(pk=self.marking.pk)
        twin.pk = None
        twin.code = "ASCC-M2"
        twin.save()
        DateSeen.objects.create(
            subject_type="MARKING", subject_id=twin.pk, **self.day, **self.stamp
        )
        self.load()
        source = CatalogSourceItem.objects.get(source_key=self.mark)
        self.assertEqual(source.decision["action"], "create")
        self.assertCountEqual(source.decision["candidates"], [self.marking.pk, twin.pk])
        self.approve(self.mark)
        self.assertEqual(Marking.objects.count(), 3)

    def test_collection_backup_includes_pending_source_and_target(self):
        from common.collection_archive import GraphExporter
        from common.models import Collection

        self.load()
        item = CatalogSourceItem.objects.get(source_key=self.mark)
        records = GraphExporter(Collection.objects.get(region__code="USA-FL1")).build()
        fields = records[f"common.catalogsourceitem:{item.pk}"]["fields"]
        self.assertEqual(fields["evidence"], item.evidence)
        self.assertEqual(
            fields["decision"]["target"], {"$record": f"common.marking:{self.marking.pk}"}
        )
        self.assertEqual(
            fields["contribution"], {"$record": f"common.contribution:{item.contribution_id}"}
        )

    def test_dated_office_spans_survive_repeat_import(self):
        spans = [
            {
                "post_office": self.office.code,
                "region": "USA-FL1",
                "valid_from": year + "-01-01",
                "created_by": self.actor.pk,
                "modified_by": self.actor.pk,
            }
            for year in ("1850", "1860")
        ]
        self.write("post_office_regions", spans)
        for _ in range(2):
            call_command(
                "import_ascc_bundle",
                str(self.bundle),
                only="post_office_regions",
                stdout=StringIO(),
            )
        self.assertEqual(PostOfficeRegion.objects.filter(post_office=self.office).count(), 3)
