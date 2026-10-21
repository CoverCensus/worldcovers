"""The duplicate-Marking census (Trello T47).

Pins the match rules T48 will reuse: an EXACT group is byte-identical twins
on one post office; a NEAR group tolerates town spelling (#129), colour word
order, and 0.5 mm of size. Recycle-binned rows, other states (#94) and other
types never group. Dates are shown, and only filtered when asked.
"""
import csv
import os
import tempfile
from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from common.models import (
    Color,
    Marking,
    MarkingRecycleBin,
    PostOffice,
    PostOfficeRegion,
    Region,
    Shape,
)


class ReportDuplicateMarkingsTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("census", password="x")
        self.va = self._region("USA-VA1", "Virginia", "VA", "STATE")
        # The #103 trap: county rows carry the state's abbrev.
        self.accomack = self._region(
            "USA-VA1-C1", "Accomack County", "VA", "COUNTY", parent=self.va)
        self.wv = self._region("USA-WV1", "West Virginia", "WV", "STATE")

        self.office = self._office("USA-VA1-1", "Accomack C.H.", self.va, self.accomack)
        self.variant = self._office("USA-VA1-2", "ACCOMACK CH", self.va)
        self.martinsburg = self._office("USA-WV1-1", "Martinsburg", self.wv)

        self.blue_black = self._color("BLUE BLACK")
        self.black_blue = self._color("BLACK-BLUE")
        self.circle = Shape.objects.create(
            name="C - Circle", created_by=self.user, modified_by=self.user)

        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    # ------------------------------------------------------------ factories

    def _region(self, code, name, abbrev, tier, parent=None):
        return Region.objects.create(
            code=code, name=name, abbrev=abbrev, region_tier=tier,
            parent_region=parent, created_by=self.user, modified_by=self.user)

    def _office(self, code, name, *regions):
        office = PostOffice.objects.create(
            code=code, name=name, created_by=self.user, modified_by=self.user)
        for region in regions:
            PostOfficeRegion.objects.create(
                post_office=office, region=region,
                created_by=self.user, modified_by=self.user)
        return office

    def _color(self, name):
        return Color.objects.create(
            name=name, created_by=self.user, modified_by=self.user)

    def _marking(self, office, inscription, *, color=None, shape=None,
                 width=None, height=None, type="TOWNMARK", **extra):
        return Marking.objects.create(
            type=type, inscription_txt=inscription, color=color, shape=shape,
            width=width, height=height, is_manuscript=False, is_irreg=False,
            post_office=office, created_by=self.user, modified_by=self.user,
            **extra)

    def _dates(self, marking, earliest, latest):
        # editable=False cache columns; bypass save() like date_range does.
        Marking.objects.filter(pk=marking.pk).update(
            earliest_seen=earliest, latest_seen=latest)

    def _run(self, *args, **opts):
        out = StringIO()
        path = opts.pop("out", os.path.join(self.tmp.name, "dupes.csv"))
        call_command("report_duplicate_markings", *args, out=path,
                     stdout=out, **opts)
        rows = []
        if os.path.exists(path):
            with open(path, newline="") as fh:
                rows = list(csv.DictReader(fh))
        return out.getvalue(), rows

    @staticmethod
    def _groups(rows):
        groups = {}
        for row in rows:
            groups.setdefault(row["group_id"], []).append(row)
        return groups

    # ---------------------------------------------------------------- tests

    def test_exact_twins_on_one_office_form_an_exact_group(self):
        a = self._marking(self.office, "ACCOMACK C.H.", color=self.blue_black,
                          shape=self.circle, width=Decimal("20.00"))
        b = self._marking(self.office, "ACCOMACK C.H.", color=self.blue_black,
                          shape=self.circle, width=Decimal("20.00"))
        self._marking(self.office, "ACCOMACK C.H. PAID", color=self.blue_black)

        out, rows = self._run()

        groups = self._groups(rows)
        self.assertEqual(len(groups), 1)
        (members,) = groups.values()
        self.assertEqual({r["marking_id"] for r in members}, {str(a.pk), str(b.pk)})
        self.assertEqual({r["tier"] for r in members}, {"EXACT"})
        by_id = {r["marking_id"]: r for r in members}
        self.assertEqual(by_id[str(a.pk)]["exact_match_ids"], str(b.pk))
        self.assertEqual(by_id[str(b.pk)]["exact_match_ids"], str(a.pk))
        self.assertIn("groups 1 (exact 1, near 0)", out)

    def test_near_group_tolerates_spelling_colour_order_and_half_a_mm(self):
        a = self._marking(self.office, "Accomack C.H.", color=self.blue_black,
                          shape=self.circle, width=Decimal("20.00"))
        b = self._marking(self.variant, "ACCOMACK  C H", color=self.black_blue,
                          shape=self.circle, width=Decimal("20.40"))
        far = self._marking(self.variant, "ACCOMACK C.H.", color=self.black_blue,
                            shape=self.circle, width=Decimal("21.50"))

        _, rows = self._run()

        groups = self._groups(rows)
        self.assertEqual(len(groups), 1)
        (members,) = groups.values()
        self.assertEqual({r["marking_id"] for r in members}, {str(a.pk), str(b.pk)})
        self.assertEqual({r["tier"] for r in members}, {"NEAR"})
        self.assertEqual({r["exact_match_ids"] for r in members}, {""})
        self.assertNotIn(str(far.pk), {r["marking_id"] for r in rows})

    def test_binned_other_state_and_other_type_never_group(self):
        keep = self._marking(self.office, "ACCOMACK C.H.", color=self.blue_black)
        binned = self._marking(self.office, "ACCOMACK C.H.", color=self.blue_black)
        MarkingRecycleBin.objects.create(marking=binned, removed_by=self.user)
        self._marking(self.martinsburg, "ACCOMACK C.H.", color=self.blue_black)
        self._marking(self.office, "ACCOMACK C.H.", color=self.blue_black,
                      type="RATEMARK")
        wv_a = self._marking(self.martinsburg, "MARTINSBURG")
        wv_b = self._marking(self.martinsburg, "MARTINSBURG")

        _, rows = self._run()
        self.assertEqual({r["marking_id"] for r in rows}, {str(wv_a.pk), str(wv_b.pk)})
        self.assertNotIn(str(keep.pk), {r["marking_id"] for r in rows})

        # --state VA resolves to the STATE row despite the county's abbrev,
        # and WV groups drop out.
        va_twin = self._marking(self.variant, "ACCOMACK C.H.", color=self.blue_black)
        _, rows = self._run(state=["VA"])
        self.assertEqual({r["marking_id"] for r in rows}, {str(keep.pk), str(va_twin.pk)})
        self.assertEqual({r["state"] for r in rows}, {"VA"})

    def test_dates_are_shown_and_only_filtered_on_request(self):
        a = self._marking(self.office, "ACCOMACK C.H.")
        b = self._marking(self.office, "ACCOMACK C.H.")
        self._dates(a, date(1850, 1, 1), date(1852, 12, 31))
        self._dates(b, date(1855, 1, 1), date(1856, 6, 30))
        c = self._marking(self.variant, "ACCOMACK PAID")
        d = self._marking(self.variant, "ACCOMACK PAID")
        self._dates(c, date(1850, 1, 1), date(1850, 12, 31))

        _, rows = self._run()
        groups = self._groups(rows)
        self.assertEqual(len(groups), 2)
        overlap = {r["marking_id"]: r["dates_overlap"] for r in rows}
        self.assertEqual(overlap[str(a.pk)], "no")
        self.assertEqual(overlap[str(c.pk)], "unknown")
        by_id = {r["marking_id"]: r for r in rows}
        self.assertEqual(by_id[str(a.pk)]["earliest_seen"], "1850-01-01")
        self.assertEqual(by_id[str(d.pk)]["earliest_seen"], "")

        _, rows = self._run(require_date_overlap=True)
        self.assertEqual({r["marking_id"] for r in rows}, {str(c.pk), str(d.pk)})

    def test_csv_header_summary_and_unwritable_path(self):
        self._marking(self.office, "ACCOMACK C.H.")
        self._marking(self.office, "ACCOMACK C.H.")

        out, rows = self._run()
        self.assertEqual(list(rows[0].keys()), [
            "group_id", "tier", "group_size", "dates_overlap", "marking_id",
            "code", "exact_match_ids", "state", "state_code", "post_office_id",
            "town", "type", "inscription", "shape", "color", "width", "height",
            "lettering_id", "impression", "date_fmt", "rate_val",
            "is_manuscript", "is_irreg", "earliest_seen", "latest_seen", "desc",
        ])
        self.assertIn("markings scanned 2 | groups 1 (exact 1, near 0) | markings in groups 2", out)
        self.assertIn("report written to", out)

        # /proc is read-only: the census was already printed, so no error.
        out, rows = self._run(out="/proc/no-such-dir/dupes.csv")
        self.assertIn("could not write the report", out)
        self.assertEqual(rows, [])
