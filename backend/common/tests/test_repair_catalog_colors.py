"""The colour repair (Trello T65).

Pins what the old admin action got wrong and what would be expensive to get
wrong again: a Cover holding the colour (ProtectedError), a recycle-binned
Marking holding it, a version snapshot or a pending contribution still naming
a row that no longer exists, a dry run that writes, and a stale --expect that
is trusted anyway.
"""
import csv
import io
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from rest_framework.test import APIClient

from common.audit import build_marking_snapshot, restore_marking_from_snapshot
from common.contribution_apply import _resolve_fk
from common.models import (
    Collection,
    Contribution,
    Cover,
    CoverVersion,
    Color,
    Marking,
    MarkingRecycleBin,
    MarkingVersion,
    PostOffice,
    PostOfficeRegion,
    Region,
)


class RepairCatalogColorsTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("importer", password="x")
        self.va = Region.objects.create(
            code="USA-VA1", name="Virginia", abbrev="VA", region_tier="STATE",
            created_by=self.user, modified_by=self.user)
        self.collection = Collection.objects.create(
            name="Virginia", region=self.va, is_active=True,
            created_by=self.user, modified_by=self.user)
        self.office = PostOffice.objects.create(
            code="USA-VA1-1", name="Abingdon",
            created_by=self.user, modified_by=self.user)
        PostOfficeRegion.objects.create(
            post_office=self.office, region=self.va,
            created_by=self.user, modified_by=self.user)

        self.black = self._color("BLACK")
        self.red = self._color("RED")
        self.blue = self._color("BLUE")
        self.red35 = self._color("RED 35")
        self.paid = self._color("PAID")
        self.dashes = self._color("--")

        self.marking = self._marking("ABINGDON", self.red35, code="ASCC6-VA-M1")
        self.cover = Cover.objects.create(
            type="FL", color=self.red35,
            created_by=self.user, modified_by=self.user)
        self.binned = self._marking("ABINGDON PAID", self.paid, code="ASCC6-VA-M2")
        MarkingRecycleBin.objects.create(marking=self.binned, removed_by=self.user)

        self.version = MarkingVersion.objects.create(
            marking=self.marking, version_no=1,
            snapshot=build_marking_snapshot(self.marking),
            created_by=self.user)
        self.cover_version = CoverVersion.objects.create(
            cover=self.cover, version_no=1,
            snapshot={"color_id": self.red35.pk, "type": "FL"},
            created_by=self.user)

        self.pending = self._contribution(
            {"submission_kind": "marking", "type": "TOWNMARK", "town": "Abingdon",
             "color": "Red 35", "color_id": str(self.red35.pk)})
        self.name_only = self._contribution(
            {"submission_kind": "marking", "type": "TOWNMARK", "town": "Abingdon",
             "color": "PAID"})
        self.approved = self._contribution(
            {"submission_kind": "marking", "type": "TOWNMARK", "town": "Abingdon",
             "color": "RED 35", "color_id": self.red35.pk},
            status=Contribution.STATUS_APPROVED)

        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    # ------------------------------------------------------------ factories

    def _color(self, name):
        return Color.objects.create(
            name=name, created_by=self.user, modified_by=self.user)

    def _marking(self, inscription, color, code):
        return Marking.objects.create(
            code=code, type="TOWNMARK", inscription_txt=inscription,
            color=color, is_manuscript=False, is_irreg=False,
            post_office=self.office, created_by=self.user, modified_by=self.user)

    def _contribution(self, submitted_data, status=Contribution.STATUS_PENDING):
        return Contribution.objects.create(
            contributor=self.user, collection=self.collection,
            submitted_data=submitted_data, status=status,
            created_by=self.user, modified_by=self.user)

    def _mapping(self, rows):
        """Write a mapping CSV the way an operator would after editing the report."""
        path = os.path.join(self.tmp.name, "mapping.csv")
        with open(path, "w", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=["name", "action", "target"])
            writer.writeheader()
            for name, action, target in rows:
                writer.writerow({"name": name, "action": action, "target": target})
        return path

    def _run(self, *args, **kwargs):
        out = io.StringIO()
        call_command("repair_catalog_colors", *args, stdout=out, **kwargs)
        return out.getvalue()

    STANDARD = (("RED 35", "merge", "RED"), ("PAID", "null", ""), ("--", "null", ""))

    # -------------------------------------------------------------- report

    def test_report_lists_every_colour_with_usage_and_a_suggestion(self):
        path = os.path.join(self.tmp.name, "census.csv")
        self._run("--report", path)
        with open(path, newline="") as fh:
            rows = {r["name"]: r for r in csv.DictReader(fh)}
        self.assertEqual(set(rows), {"BLACK", "RED", "BLUE", "RED 35", "PAID", "--"})
        red35 = rows["RED 35"]
        self.assertEqual(red35["is_suspect"], "yes")
        self.assertEqual(red35["suggested_target"], "RED")
        self.assertEqual(red35["action"], "merge")
        self.assertEqual(red35["n_markings"], "1")
        self.assertEqual(red35["n_covers"], "1")
        self.assertEqual(red35["n_marking_versions"], "1")
        self.assertEqual(red35["n_cover_versions"], "1")
        self.assertEqual(red35["n_contributions"], "2")
        paid = rows["PAID"]
        self.assertEqual(paid["action"], "null")
        self.assertEqual(paid["suggested_target"], "")
        # The recycle-binned marking still holds the FK and must be counted.
        self.assertEqual(paid["n_markings"], "1")
        self.assertEqual(rows["RED"]["action"], "keep")
        self.assertEqual(rows["RED"]["is_suspect"], "no")

    # -------------------------------------------------------------- dry run

    def test_dry_run_writes_nothing(self):
        out = self._run("--mapping", self._mapping(self.STANDARD), "--expect", "3",
                        "--actor", str(self.user.pk))
        self.assertIn("DRY RUN", out)
        self.marking.refresh_from_db()
        self.cover.refresh_from_db()
        self.assertEqual(self.marking.color_id, self.red35.pk)
        self.assertEqual(self.cover.color_id, self.red35.pk)
        self.assertEqual(Color.objects.count(), 6)
        self.version.refresh_from_db()
        self.assertEqual(self.version.snapshot["color_id"], self.red35.pk)
        self.pending.refresh_from_db()
        self.assertEqual(self.pending.submitted_data["color"], "Red 35")

    # --------------------------------------------------------------- commit

    def test_commit_repoints_marking_and_cover_and_deletes_the_colour(self):
        self._run("--mapping", self._mapping(self.STANDARD), "--expect", "3",
                  "--commit", "--actor", str(self.user.pk))
        self.marking.refresh_from_db()
        self.cover.refresh_from_db()
        self.assertEqual(self.marking.color_id, self.red.pk)
        # The admin action nulled markings only; a cover holding the colour
        # made it raise ProtectedError. Both FKs are repointed here.
        self.assertEqual(self.cover.color_id, self.red.pk)
        self.assertFalse(Color.objects.filter(name__in=["RED 35", "PAID", "--"]).exists())
        self.assertEqual(Color.objects.count(), 3)

    def test_recycle_binned_marking_is_repointed_too(self):
        self._run("--mapping", self._mapping(self.STANDARD), "--expect", "3",
                  "--commit", "--actor", str(self.user.pk))
        binned = Marking.all_objects.get(pk=self.binned.pk)
        self.assertIsNone(binned.color_id)

    def test_snapshots_are_rewritten_and_restore_still_works(self):
        self._run("--mapping", self._mapping(self.STANDARD), "--expect", "3",
                  "--commit", "--actor", str(self.user.pk))
        self.version.refresh_from_db()
        self.cover_version.refresh_from_db()
        self.assertEqual(self.version.snapshot["color_id"], self.red.pk)
        self.assertEqual(self.cover_version.snapshot["color_id"], self.red.pk)
        restored = restore_marking_from_snapshot(
            Marking.objects.get(pk=self.marking.pk), self.version.snapshot, self.user)
        self.assertEqual(restored.color_id, self.red.pk)

    def test_contribution_payloads_are_rewritten_and_still_resolve(self):
        self._run("--mapping", self._mapping(self.STANDARD), "--expect", "3",
                  "--commit", "--actor", str(self.user.pk))
        self.pending.refresh_from_db()
        self.assertEqual(self.pending.submitted_data["color"], "RED")
        # The string form the form posts is preserved as a string.
        self.assertEqual(self.pending.submitted_data["color_id"], str(self.red.pk))
        self.assertEqual(
            _resolve_fk(Color, self.pending.submitted_data, "color_id", "color"),
            self.red)
        self.name_only.refresh_from_db()
        self.assertNotIn("color", self.name_only.submitted_data)
        self.assertNotIn("color_id", self.name_only.submitted_data)
        self.assertIsNone(
            _resolve_fk(Color, self.name_only.submitted_data, "color_id", "color"))
        # Approved payloads are history, but a dangling id there would break
        # a future re-apply, so they are rewritten as well.
        self.approved.refresh_from_db()
        self.assertEqual(self.approved.submitted_data["color_id"], self.red.pk)

    def test_search_filter_and_dropdown_after_repair(self):
        self._run("--mapping", self._mapping(self.STANDARD), "--expect", "3",
                  "--commit", "--actor", str(self.user.pk))
        client = APIClient()
        markings = client.get("/api/v2/markings/", {"color": "RED"})
        self.assertEqual(markings.status_code, 200)
        ids = {row["id"] for row in markings.json()["results"]}
        self.assertIn(self.marking.pk, ids)
        colors = client.get("/api/v2/colors/")
        self.assertEqual(colors.status_code, 200)
        names = {row["name"] for row in colors.json()["results"]}
        self.assertEqual(names, {"BLACK", "RED", "BLUE"})

    # -------------------------------------------------------------- refusals

    def test_refuses_a_missing_self_or_chained_target(self):
        for rows in (
            (("RED 35", "merge", "CRIMSON"),),                     # missing
            (("RED 35", "merge", "RED 35"),),                      # self
            (("RED 35", "merge", "PAID"), ("PAID", "null", "")),   # chained
            (("RED 35", "bogus", ""),),                            # bad action
        ):
            with self.subTest(rows=rows):
                with self.assertRaises(CommandError):
                    self._run("--mapping", self._mapping(rows), "--commit",
                              "--actor", str(self.user.pk))
                self.assertTrue(Color.objects.filter(name="RED 35").exists())

    def test_stale_expect_aborts(self):
        with self.assertRaises(CommandError):
            self._run("--mapping", self._mapping(self.STANDARD), "--expect", "99",
                      "--commit", "--actor", str(self.user.pk))
        self.assertEqual(Color.objects.count(), 6)

    def test_black_is_never_a_source(self):
        with self.assertRaises(CommandError):
            self._run("--mapping", self._mapping((("black", "null", ""),)),
                      "--commit", "--actor", str(self.user.pk))
        self.assertTrue(Color.objects.filter(name="BLACK").exists())

    def test_target_is_resolved_case_insensitively(self):
        self._run("--mapping", self._mapping((("red 35", "merge", "red"),)),
                  "--expect", "1", "--commit", "--actor", str(self.user.pk))
        self.marking.refresh_from_db()
        self.assertEqual(self.marking.color_id, self.red.pk)

    # ------------------------------------------------------ recurrence guard

    def test_api_refuses_to_create_a_colour_that_is_not_a_colour(self):
        # Editors can write to /colors/. A digit or a bare dash is how the bad
        # rows looked; the guard keeps the dropdown clean after the repair.
        admin = get_user_model().objects.create_superuser("root", "r@x.test", "x")
        client = APIClient()
        client.force_authenticate(admin)
        for bad in ("RED 35", "--", "30", "PAID"):
            with self.subTest(bad=bad):
                res = client.post("/api/v2/colors/", {"name": bad}, format="json")
                self.assertEqual(res.status_code, 400, res.content)
        res = client.post("/api/v2/colors/", {"name": "Crimson"}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        res = client.post("/api/v2/colors/", {"name": "Red-orange"}, format="json")
        self.assertEqual(res.status_code, 201, res.content)


    def test_id_mapping_checks_escaped_name_and_writes_ascii(self):
        bad = self._color("MS\u00b7BLACK")
        marking = self._marking("TEST", bad, "TEST-ID")
        path = os.path.join(self.tmp.name, "ids.csv")
        with open(path, "w", encoding="ascii", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(["color_id", "name", "action", "target"])
            writer.writerow([bad.pk, r"MS\u00b7BLACK", "merge", "BLACK"])
        report = os.path.join(self.tmp.name, "report.csv")
        self._run("--report", report).encode("ascii")
        Path(report).read_bytes().decode("ascii")
        self._run("--mapping", path, "--commit",
                  "--actor", str(self.user.pk)).encode("ascii")
        marking.refresh_from_db()
        self.assertEqual(marking.color_id, self.black.pk)

    def test_wrong_site_id_is_rejected(self):
        path = os.path.join(self.tmp.name, "wrong.csv")
        with open(path, "w", encoding="ascii") as fh:
            fh.write("color_id,name,action,target\n")
            fh.write(f"{self.blue.pk},RED 35,merge,RED\n")
        with self.assertRaisesMessage(CommandError, "color_id/name mismatch"):
            self._run("--mapping", path, "--commit", "--actor", str(self.user.pk))
        self.assertTrue(Color.objects.filter(pk=self.red35.pk).exists())

    def test_conflicting_submission_aborts_before_changes(self):
        self.pending.submitted_data["color_id"] = self.blue.pk
        self.pending.save()
        with self.assertRaisesMessage(CommandError, "color and color_id disagree"):
            self._run("--mapping", self._mapping(self.STANDARD), "--commit",
                      "--actor", str(self.user.pk))
        self.marking.refresh_from_db()
        self.assertEqual(self.marking.color_id, self.red35.pk)

    def test_failure_rolls_back_earlier_repairs(self):
        from common.management.commands.repair_catalog_colors import Command
        original = Command._apply_one

        def fail_on_second(command, bad, target, actor):
            if bad.name == "PAID":
                raise CommandError("test failure")
            return original(command, bad, target, actor)

        with patch.object(Command, "_apply_one", fail_on_second):
            with self.assertRaisesMessage(CommandError, "test failure"):
                self._run("--mapping", self._mapping(self.STANDARD), "--commit",
                          "--actor", str(self.user.pk))
        self.marking.refresh_from_db()
        self.version.refresh_from_db()
        self.pending.refresh_from_db()
        self.assertEqual(self.marking.color_id, self.red35.pk)
        self.assertEqual(self.version.snapshot["color_id"], self.red35.pk)
        self.assertEqual(self.pending.submitted_data["color"], "Red 35")
        self.assertTrue(Color.objects.filter(pk=self.red35.pk).exists())

    def test_reviewed_map_preserves_shades_and_source_text(self):
        # Test inputs belong here, not in ignored operator working files.
        mapping = (
            ("[DATE MS IN RED]", "RED"), ("BLACH", "BLACK"),
            ("BLACK --", "BLACK"), ("BLUE 20", "BLUE"),
            ("BLUE SOLDIER\u2019S MAIL", "BLUE"), ("MS\u00b7BLACK", "BLACK"),
            ("RED 35", "RED"), ("RED 60", "RED"),
            ("--", ""), ("-- --", ""), ("10", ""), ("50", ""), ("6", ""),
            ("CIRCULAR MAIL", ""), ("DATELINED LISBON --", ""),
            ("DUE/4[C]", ""), ("MS", ""), ("PAID", ""),
            ("SEE MARITIME MAIL LISTING --", ""), ("SEE WAY MAIL LISTING --", ""),
        )
        shades = [self._color(n) for n in ("CLARET", "GREENISH BLUE", "BRIGHT RED")]
        rows = []
        expected = []
        for i, (name, target_name) in enumerate(mapping):
            bad = Color.objects.filter(name=name).first() or self._color(name)
            marking = self._marking("SOURCE", bad, f"MAP-{i}")
            marking.catalog_txt = "Original source text"
            marking.save()
            target = Color.objects.get(name=target_name) if target_name else None
            expected.append((marking, target.pk if target else None))
            rows.append((name, "merge" if target else "null", target_name))
        path = os.path.join(self.tmp.name, "reviewed.csv")
        with open(path, "w", encoding="ascii", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(["color_id", "name", "action", "target"])
            for name, action, target in rows:
                writer.writerow([Color.objects.get(name=name).pk,
                                 json.dumps(name, ensure_ascii=True)[1:-1],
                                 action, target])
        models = (Color, Marking, Cover, MarkingVersion, CoverVersion, Contribution)
        before = {model: list(model._base_manager.order_by("pk").values())
                  for model in models}
        self._run("--mapping", path, "--expect", "20",
                  "--actor", str(self.user.pk))
        for model in models:
            self.assertEqual(list(model._base_manager.order_by("pk").values()),
                             before[model])
        self._run("--mapping", path, "--expect", "20", "--commit",
                  "--actor", str(self.user.pk))
        self.assertEqual(Color.objects.count(), len(before[Color]) - 20)
        self.assertEqual(Marking.all_objects.count(), len(before[Marking]))
        for marking, target_pk in expected:
            marking.refresh_from_db()
            self.assertEqual(marking.color_id, target_pk)
            self.assertEqual(marking.catalog_txt, "Original source text")
        self.assertEqual(Color.objects.filter(pk__in=[c.pk for c in shades]).count(), 3)
