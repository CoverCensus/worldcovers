/** Trello T66 -- rotateImage posts the clockwise quarter turns and relays the server's reason. */
import { rotateImage } from "./markings";
import apiClient from "@/lib/api";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { post: jest.fn() },
  ensureCsrfToken: jest.fn(),
}));

const mockedPost = apiClient.post as jest.Mock;

beforeEach(() => mockedPost.mockReset());

it("posts the quarter turns to the image's rotate action", async () => {
  mockedPost.mockResolvedValueOnce({ data: { image_id: 5 } });
  expect(await rotateImage(5, 3)).toEqual({ ok: true });
  expect(mockedPost).toHaveBeenCalledWith("/images/5/rotate/", { quarter_turns: 3 });
});

it("surfaces the server's reason when the rotation is refused", async () => {
  mockedPost.mockRejectedValueOnce({ response: { data: { detail: "Rotation is only available for Marking images." } } });
  expect(await rotateImage(5, 1)).toEqual({ ok: false, message: "Rotation is only available for Marking images." });
});
