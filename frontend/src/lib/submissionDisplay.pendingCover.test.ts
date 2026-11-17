import { readSubmittedData } from "@/lib/submission";
// Trello T37 -- the Cover carried inside a new Marking submission.
import {
  createdFromSubmissionIdFromSubmittedData,
  pendingCoverSubmissionIdFromSubmittedData,
  pendingCoverFromSubmittedData,
} from "./submissionDisplay";

describe("pendingCoverFromSubmittedData", () => {
  it("reads the cover fields, date and saved uploads", () => {
    const summary = pendingCoverFromSubmittedData(readSubmittedData({
      submission_kind: "marking",
      pending_cover: {
        type: "env", cover_date_unknown: false, cover_date_year: "1851", cover_date_month: "", cover_date_day: "",
        is_institutional: "true", is_backstamp: false, description: "Whole cover",
        image_metas: [{ storage_filename: "/va/abc.png" }, { storage_filename: "va/def.png" }],
      },
    }).data);
    expect(summary).toEqual({
      type: "ENV",
      date: { unknown: false, year: "1851", month: "", day: "" },
      isInstitutional: true,
      isBackstamp: false,
      description: "Whole cover",
      imageStorageFilenames: ["va/abc.png", "va/def.png"],
      noImage: false,
    });
  });

  it("is null when the submission carries no cover", () => {
    expect(pendingCoverFromSubmittedData(readSubmittedData({ submission_kind: "marking" }).data)).toBeNull();
    expect(() => readSubmittedData({ pending_cover: "yes" })).toThrow(/Submission.pending_cover/);
    expect(pendingCoverFromSubmittedData(readSubmittedData(null).data)).toBeNull();
  });

  it("links the two submissions once approval created the cover", () => {
    expect(pendingCoverSubmissionIdFromSubmittedData(readSubmittedData({ pending_cover_submission_id: 42 }).data)).toBe(42);
    expect(pendingCoverSubmissionIdFromSubmittedData(readSubmittedData({}).data)).toBeNull();
    expect(createdFromSubmissionIdFromSubmittedData(readSubmittedData({ created_from_submission_id: "7" }).data)).toBe(7);
    expect(createdFromSubmissionIdFromSubmittedData(readSubmittedData({ created_from_submission_id: 0 }).data)).toBeNull();
  });
});
