import { readSubmission, SubmissionFormData, type Submission, type SubmissionRequest } from "./submission";

it("reads legacy names once, including nested Cover and image fields", () => {
  const parsed = readSubmission({
    submissionKind: "marking", markingType: "TOWNMARK", inscriptionTxt: "BURLINGTON VT.",
    desc: "Blue circular marking", isManuscript: "false", lettering: "Serif",
    pendingCover: {
      type: "ENV", coverDateYear: "1851", coverDateUnknown: "false",
      imageMetas: [{ storageFilename: "vt/cover.png", originalFilename: "cover.png", imageWidth: 400 }],
    },
    pendingCoverContributionId: 42,
  });
  expect(parsed.unsupported).toEqual([]);
  expect(parsed.data).toMatchObject({
    submission_kind: "marking", type: "TOWNMARK", inscription_txt: "BURLINGTON VT.",
    description: "Blue circular marking", is_manuscript: false, lettering: "Serif",
    pending_cover: { cover_date_year: "1851", cover_date_unknown: false, image_metas: [{ storage_filename: "vt/cover.png" }] },
    pending_cover_contribution_id: 42,
  });
  expect(parsed.data).not.toHaveProperty("pendingCover");
});

it("preserves omission, explicit null, empty values, and false in sparse edits", () => {
  const { data } = readSubmission({ description: "", shape_id: null, is_irreg: false, is_backstamp: "" });
  expect(data).toEqual({ description: "", shape_id: null, is_irreg: false, is_backstamp: "" });
  expect(data).not.toHaveProperty("town");
});

it("matches Django's description choice when a record contains both names", () => {
  expect(readSubmission({ type: "TOWNMARK", desc: "Current text", description: "Old text" }).data.description).toBe("Current text");
  expect(readSubmission({ type: "TOWNMARK", desc: "", description: "Fallback text" }).data.description).toBe("Fallback text");
  expect(readSubmission({ submission_kind: "cover", desc: "Old text", description: "Current Cover text" }).data.description).toBe("Current Cover text");
});

it("reads multipart Citation and image fields into typed lists", () => {
  const { data, unsupported } = readSubmission({
    "reference_work_ids[]": ["3", "4"],
    reference_work_details: JSON.stringify([{ reference_work_id: 3, page_number: "12", url: "https://example.com" }]),
    cover_image_tags: '["photograph","tracing"]',
    marking_images: [{ imageUrl: "/media/marking.png" }],
  });
  expect(unsupported).toEqual([]);
  expect(data.reference_work_ids).toEqual([3, 4]);
  expect(data.reference_work_details).toEqual([{ reference_work_id: 3, page_number: "12", url: "https://example.com" }]);
  expect(data.cover_image_tags).toEqual(["photograph", "tracing"]);
  expect(data.marking_images).toEqual(["/media/marking.png"]);
});

it("accepts image metadata written by Django for uploads and catalog image edits", () => {
  const meta = {
    storage_filename: "vt/cover.png", original_filename: "cover.png", file_checksum: "abc123",
    mime_type: "image/png", image_width: 400, image_height: 250, file_size_bytes: 1024,
    image_description: "Front", tracing: false,
  };
  const parsed = readSubmission({ pending_cover: { type: "ENV", image_metas: [meta] }, marking_image_metas: [meta] });
  expect(parsed.unsupported).toEqual([]);
  expect(parsed.data.pending_cover?.image_metas).toEqual([meta]);
});

it.each([
  [], "not an object", { is_manuscript: "maybe" }, { pending_cover: [] },
  { reference_work_details: "invalid JSON" }, { cover_date_year: {} },
  { vphc: { flags: "missing list" } }, { submission_kind: "unknown" },
])("rejects malformed external data: %j", (raw) => {
  expect(() => readSubmission(raw)).toThrow(/Invalid Submission field/);
});

it("reports new fields without hiding known fields or losing the original object", () => {
  const raw = { town: "Burlington", new_field: "evidence", pending_cover: { type: "ENV", new_cover_field: true } };
  const parsed = readSubmission(raw);
  expect(parsed.data).toEqual({ town: "Burlington", pending_cover: { type: "ENV" } });
  expect(parsed.unsupported).toEqual(["Submission.pending_cover.new_cover_field", "Submission.new_field"]);
  expect(raw.new_field).toBe("evidence");
});

it("shares field names across JSON requests, multipart requests, and saved data", () => {
  const request: SubmissionRequest = { submission_kind: "marking", town: "Burlington", pending_cover: { type: "ENV" } };
  const form = new SubmissionFormData();
  form.append("submission_kind", request.submission_kind);
  form.append("town", request.town);
  form.append("pending_cover", JSON.stringify(request.pending_cover));
  expect(readSubmission(Object.fromEntries(form.entries())).data).toEqual(request);
});

it("checks Submission field names and values at compile time", () => {
  // @ts-expect-error A new field must be defined in submissionFields first.
  const wrongName: Submission = { pending_cover_typo: {} };
  // @ts-expect-error A Cover must have the defined object shape.
  const wrongCover: Submission = { pending_cover: "cover" };
  const form = new SubmissionFormData();
  // @ts-expect-error Multipart writers use the same field names.
  form.append("pending_cover_typo", "{}");
  expect(wrongName).toBeDefined();
  expect(wrongCover).toBeDefined();
});
