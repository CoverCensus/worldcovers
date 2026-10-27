import { readSubmission } from "@/lib/submission";
// Trello T37 -- the Cover carried inside a new Marking submission.
import {
  createdFromContributionIdFromSubmittedData,
  pendingCoverContributionIdFromSubmittedData,
  pendingCoverFromSubmittedData,
} from "./contributionDisplay";

describe("pendingCoverFromSubmittedData", () => {
  it("reads the cover fields, date and saved uploads", () => {
    const summary = pendingCoverFromSubmittedData(readSubmission({
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
    expect(pendingCoverFromSubmittedData(readSubmission({ submission_kind: "marking" }).data)).toBeNull();
    expect(() => readSubmission({ pending_cover: "yes" })).toThrow(/Submission.pending_cover/);
    expect(pendingCoverFromSubmittedData(readSubmission(null).data)).toBeNull();
  });

  it("links the two submissions once approval created the cover", () => {
    expect(pendingCoverContributionIdFromSubmittedData(readSubmission({ pending_cover_contribution_id: 42 }).data)).toBe(42);
    expect(pendingCoverContributionIdFromSubmittedData(readSubmission({}).data)).toBeNull();
    expect(createdFromContributionIdFromSubmittedData(readSubmission({ created_from_contribution_id: "7" }).data)).toBe(7);
    expect(createdFromContributionIdFromSubmittedData(readSubmission({ created_from_contribution_id: 0 }).data)).toBeNull();
  });
});
