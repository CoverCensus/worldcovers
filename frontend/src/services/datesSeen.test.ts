// issues.md 107 — the write client for /dates-seen/. The serializer derives
// granularity from the parts it receives and, on PATCH, keeps any part that is
// NOT sent, so every write sends all three parts and never a granularity.
import apiClient from "@/lib/api";
import {
  createDateSeen,
  dateSeenErrorMessage,
  deleteDateSeen,
  updateDateSeen,
} from "@/services/datesSeen";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  ensureCsrfToken: jest.fn().mockResolvedValue(undefined),
}));
const api = apiClient as unknown as { post: jest.Mock; patch: jest.Mock; delete: jest.Mock };

describe("datesSeen service", () => {
  beforeEach(() => {
    api.post.mockReset();
    api.patch.mockReset();
    api.delete.mockReset();
  });

  it("creates with subject and all three parts, null for blanks, and no date or granularity", async () => {
    api.post.mockResolvedValue({ data: { id: 9, date: null, granularity: "MONTH_ONLY", date_year: null, date_month: 6, date_day: null } });
    const row = await createDateSeen({
      subjectType: "MARKING",
      subjectId: 42,
      parts: { unknown: false, year: "", month: "6", day: "" },
    });
    expect(api.post).toHaveBeenCalledWith("/dates-seen/", {
      subject_type: "MARKING",
      subject_id: 42,
      date_year: null,
      date_month: 6,
      date_day: null,
    });
    expect(row).toEqual({ id: 9, date: null, granularity: "MONTH_ONLY", dateYear: null, dateMonth: 6, dateDay: null });
  });

  it("updates with all three parts so a cleared month or day really clears", async () => {
    api.patch.mockResolvedValue({ data: { id: 9, date: "1851-01-01", granularity: "YEAR", date_year: 1851, date_month: null, date_day: null } });
    await updateDateSeen(9, { unknown: false, year: "1851", month: "", day: "" });
    expect(api.patch).toHaveBeenCalledWith("/dates-seen/9/", {
      date_year: 1851,
      date_month: null,
      date_day: null,
    });
  });

  it("deletes by id", async () => {
    api.delete.mockResolvedValue({ status: 204 });
    await deleteDateSeen(9);
    expect(api.delete).toHaveBeenCalledWith("/dates-seen/9/");
  });

  it("normalises the three 400 shapes the API produces", () => {
    const wrap = (data: unknown) => ({ response: { data } });
    expect(dateSeenErrorMessage(wrap({ non_field_errors: ["This date is already recorded for this record."] })))
      .toBe("This date is already recorded for this record.");
    expect(dateSeenErrorMessage(wrap({ detail: "You are not assigned to the region this record belongs to." })))
      .toBe("You are not assigned to the region this record belongs to.");
    expect(dateSeenErrorMessage(wrap({ date_day: ["Day must be between 1 and 31."] })))
      .toBe("Day must be between 1 and 31.");
    expect(dateSeenErrorMessage(new Error("Network Error"))).toBe("Network Error");
  });
});
