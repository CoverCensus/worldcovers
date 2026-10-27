/** @jest-environment jsdom */
import { readSubmission, SubmissionFormData } from "@/lib/submission";
import {
  appendSubmissionCitations, referenceDetailsForForm,
  submissionCitations, parseCitationDetail,
} from "./submissionCitations";

const details = [
  { reference_work_id: 11, page_number: "42", url: "https://example.com/first" },
  { reference_work_id: 22, page_number: "84", url: "https://example.com/second" },
];

it.each([
  ["p. 42 - https://example.com/first", "42", "https://example.com/first"],
  ["p. 42", "42", ""],
  ["https://example.com/first", "", "https://example.com/first"],
  ["Page number: 42\nCitation url: https://example.com/first", "42", "https://example.com/first"],
])("restores saved Citation detail %s", (text, pageNumber, citationUrl) => {
  expect(parseCitationDetail(text)).toEqual({ pageNumber, citationUrl });
});

it("sends every selected Reference Work with its page and URL", () => {
  const form = new SubmissionFormData();
  appendSubmissionCitations(form, [11, 22], details);
  expect(form.getAll("reference_work_ids[]")).toEqual(["11", "22"]);
  expect(JSON.parse(String(form.get("reference_work_details")))).toEqual(details);
});

it("sends an explicit clear when the last Citation is removed", () => {
  const form = new SubmissionFormData();
  appendSubmissionCitations(form, [], []);
  expect(form.has("reference_work_ids[]")).toBe(true);
  expect(form.getAll("reference_work_ids[]")).toEqual([""]);
  expect(form.get("reference_work_details")).toBe("[]");
});

it("restores canonical and legacy draft Citation selections and details", () => {
  expect(readSubmission({ reference_work_ids: ["11", "22"] }).data.reference_work_ids).toEqual([11, 22]);
  expect(readSubmission({ reference_work_ids: "11" }).data.reference_work_ids).toEqual([11]);
  expect(referenceDetailsForForm(readSubmission({ reference_work_details: JSON.stringify(details) }).data.reference_work_details)).toEqual({
    11: { pageNumber: "42", citationUrl: "https://example.com/first" },
    22: { pageNumber: "84", citationUrl: "https://example.com/second" },
  });
});

it("shows all Citation details for review, including both page and URL", () => {
  const citations = submissionCitations(readSubmission({
    reference_work_ids: [11, 22], reference_work_details: details,
  }).data, []);
  expect(citations.map((row) => row.citationDetail)).toEqual([
    "p. 42 - https://example.com/first", "p. 84 - https://example.com/second",
  ]);
  expect(submissionCitations(readSubmission({ "reference_work_ids[]": "22" }).data, []).map((row) => row.id))
    .toEqual([22]);
});

it("does not show stale details as selected after an explicit clear", () => {
  expect(submissionCitations(readSubmission({ reference_work_ids: [], reference_work_details: details }).data, []))
    .toEqual([]);
});
