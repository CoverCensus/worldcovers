"""T72: keep Citation sets through submission, draft resume, and approval."""
import json

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from common.models import (
    Citation, Collection, Contribution, Cover, CoverMarking, Marking,
    PostOffice, PostOfficeRegion, ReferenceWork, Region,
)


class SubmissionCitationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user("contributor")
        self.editor = get_user_model().objects.create_superuser("editor")
        self.audit = {"created_by": self.editor, "modified_by": self.editor}
        region = Region.objects.create(
            name="Virginia", abbrev="VA", region_tier="STATE", **self.audit
        )
        Collection.objects.create(name="Virginia", region=region, **self.audit)
        office = PostOffice.objects.create(name="Richmond", **self.audit)
        PostOfficeRegion.objects.create(post_office=office, region=region, **self.audit)
        self.marking = Marking.objects.create(
            type="TOWNMARK", inscription_txt="RICHMOND", is_manuscript=True,
            post_office=office, **self.audit,
        )
        self.cover = Cover.objects.create(type="FC", **self.audit)
        CoverMarking.objects.create(cover=self.cover, marking=self.marking, **self.audit)
        self.refs = [
            ReferenceWork.objects.create(
                code=code, title=code, authorship="Author", publisher="Publisher",
                publication_year=1900, **self.audit,
            )
            for code in ("ASCC1", "VPHC1")
        ]
        self.details = [
            {"reference_work_id": ref.pk, "page_number": str(i + 10),
             "url": "https://example.com/source/" + str(i)}
            for i, ref in enumerate(self.refs)
        ]
        for kind, entry in (("MARKING", self.marking), ("COVER", self.cover)):
            for ref in self.refs:
                Citation.objects.create(
                    subject_type=kind, subject_id=entry.pk, reference_work=ref,
                    citation_detail="Original detail", **self.audit,
                )

    def payload(self, kind, edit=False):
        data = {"state": "VA"}
        if kind == "MARKING":
            data.update(town="Richmond", type="TOWNMARK", is_manuscript=True,
                        inscription_txt="RICHMOND", no_marking_image=True)
            if edit:
                data["edit_marking_id"] = self.marking.pk
        else:
            data.update(submission_kind="cover", parent_marking_id=self.marking.pk,
                        type="FC", cover_date_unknown=True, no_cover_image=True)
            if edit:
                data["edit_cover_id"] = self.cover.pk
        return data

    def post(self, payload, fmt):
        self.client.force_authenticate(self.user)
        response = self.client.post("/api/v2/contributions/", payload, format=fmt)
        self.assertEqual(response.status_code, 200 if "edit_contribution_id" in payload else 201, response.data)
        return Contribution.objects.get(pk=response.data["id"])

    def test_invalid_citation_inputs_do_not_create_a_submission(self):
        self.client.force_authenticate(self.user)
        for citation_fields in (
            {"reference_work_ids": [True]},
            {"reference_work_ids": ["bad"]},
            {"reference_work_ids": ["\u00b2"]},
            {"reference_work_ids": [-1]},
            {"reference_work_details": "bad JSON"},
            {"reference_work_details": ["not an object"]},
        ):
            with self.subTest(fields=citation_fields):
                response = self.client.post(
                    "/api/v2/contributions/",
                    {**self.payload("MARKING"), **citation_fields}, format="json",
                )
                self.assertEqual(response.status_code, 400, response.data)
                self.assertFalse(Contribution.objects.exists())

    def approve(self, contribution, kind):
        self.client.force_authenticate(self.editor)
        response = self.client.post(
            f"/api/v2/contributions/{contribution.pk}/approve/", {}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        contribution.refresh_from_db()
        return contribution.marking_id if kind == "MARKING" else response.data["coverId"]

    def test_multiple_citations_survive_create_and_edit_in_both_formats(self):
        for kind in ("MARKING", "COVER"):
            for fmt in ("multipart", "json"):
                for edit in (False, True):
                    with self.subTest(kind=kind, fmt=fmt, edit=edit):
                        payload = self.payload(kind, edit)
                        ids_key = "reference_work_ids[]" if fmt == "multipart" else "reference_work_ids"
                        payload[ids_key] = [ref.pk for ref in self.refs]
                        payload["reference_work_details"] = (
                            json.dumps(self.details) if fmt == "multipart" else self.details
                        )
                        payload["save_as_draft"] = True
                        draft = self.post(payload, fmt)
                        self.assertEqual(draft.status, Contribution.STATUS_DRAFT)
                        self.client.force_authenticate(self.user)
                        review = self.client.get(f"/api/v2/contributions/{draft.pk}/")
                        saved = review.data["submitted_data"]
                        self.assertEqual(
                            [int(value) for value in saved["reference_work_ids"]],
                            [ref.pk for ref in self.refs],
                        )
                        self.assertNotIn("reference_work_ids[]", saved)
                        # Resume without new Citation fields must retain all saved evidence.
                        resumed = self.payload(kind, edit)
                        resumed["edit_contribution_id"] = draft.pk
                        pending = self.post(resumed, fmt)
                        self.assertEqual(pending.status, Contribution.STATUS_PENDING)
                        pk = self.approve(pending, kind)
                        self.assertEqual(
                            dict(Citation.objects.filter(subject_type=kind, subject_id=pk)
                                 .values_list("reference_work_id", "citation_detail")),
                            {ref.pk: f"p. {i + 10} - https://example.com/source/{i}"
                             for i, ref in enumerate(self.refs)},
                        )

    def test_omission_preserves_and_explicit_empty_clears_citations(self):
        for kind, entry in (("MARKING", self.marking), ("COVER", self.cover)):
            for fmt in ("multipart", "json"):
                with self.subTest(kind=kind, fmt=fmt):
                    for ref in self.refs:
                        Citation.objects.update_or_create(
                            subject_type=kind, subject_id=entry.pk, reference_work=ref,
                            defaults={"citation_detail": "Original detail", **self.audit},
                        )
                    self.approve(self.post(self.payload(kind, edit=True), fmt), kind)
                    rows = Citation.objects.filter(subject_type=kind, subject_id=entry.pk)
                    self.assertEqual(rows.count(), 2)
                    self.assertEqual(set(rows.values_list("citation_detail", flat=True)), {"Original detail"})
                    payload = self.payload(kind, edit=True)
                    if fmt == "multipart":
                        payload["reference_work_ids[]"] = ""
                        payload["reference_work_details"] = "[]"
                    else:
                        payload["reference_work_ids"] = []
                        payload["reference_work_details"] = []
                    self.approve(self.post(payload, fmt), kind)
                    self.assertFalse(rows.exists())

    def test_resumed_draft_replaces_legacy_citation_key(self):
        draft = Contribution.objects.create(
            contributor=self.user, collection=Collection.objects.get(),
            status=Contribution.STATUS_DRAFT,
            submitted_data={**self.payload("MARKING"), "reference_work_ids[]": str(self.refs[0].pk)},
            **self.audit,
        )
        payload = {**self.payload("MARKING"), "edit_contribution_id": draft.pk,
                   "reference_work_ids": [], "reference_work_details": []}
        pending = self.post(payload, "json")
        self.assertNotIn("reference_work_ids[]", pending.submitted_data)
        self.assertEqual(pending.submitted_data["reference_work_ids"], [])
