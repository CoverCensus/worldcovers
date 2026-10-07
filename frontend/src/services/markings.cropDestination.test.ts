/**
 * Trello T37 / workspace issues.md #182 -- cropImage sends the destination
 * only when one is given, so the endpoint's default (same subject) is
 * untouched for the marking screen.
 */
import { cropImage } from "./markings";
import apiClient from "@/lib/api";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { post: jest.fn() },
  ensureCsrfToken: jest.fn(),
}));

const mockedPost = apiClient.post as jest.Mock;

describe("cropImage destination", () => {
  beforeEach(() => mockedPost.mockReset());

  it("sends only the rectangle by default", async () => {
    mockedPost.mockResolvedValueOnce({ data: { image_id: 9 } });
    await cropImage(5, { x: 1.2, y: 2.7, width: 10.4, height: 8.6 });
    expect(mockedPost).toHaveBeenCalledWith("/images/5/crop/", { x: 1, y: 3, width: 10, height: 9 });
  });

  it("adds the Marking destination and its view when given", async () => {
    mockedPost.mockResolvedValueOnce({ data: { image_id: 9 } });
    const result = await cropImage(5, { x: 0, y: 0, width: 10, height: 8 }, { subjectType: "MARKING", subjectId: 42 });
    expect(result).toEqual({ ok: true, imageId: 9 });
    expect(mockedPost.mock.calls[0][1]).toMatchObject({ subject_type: "MARKING", subject_id: 42, image_view: "FULL" });
  });

  it("surfaces the server's reason when the destination is refused", async () => {
    mockedPost.mockRejectedValueOnce({ response: { data: { detail: "Marking 42 already has an image." } } });
    const result = await cropImage(5, { x: 0, y: 0, width: 10, height: 8 }, { subjectType: "MARKING", subjectId: 42 });
    expect(result).toEqual({ ok: false, message: "Marking 42 already has an image." });
  });
});
