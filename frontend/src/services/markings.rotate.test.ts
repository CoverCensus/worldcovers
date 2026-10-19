/** Trello T66 / issue #193 -- rotateImage posts the clockwise angle and relays the server's reason. */
import { rotateImage } from "./markings";
import apiClient from "@/lib/api";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { post: jest.fn() },
  ensureCsrfToken: jest.fn(),
}));

const mockedPost = apiClient.post as jest.Mock;

beforeEach(() => mockedPost.mockReset());

it("posts where the handle ended up, however many times it went round", async () => {
  mockedPost.mockResolvedValueOnce({ data: { image_id: 5 } });
  expect(await rotateImage(5, -737)).toEqual({ ok: true });
  expect(mockedPost).toHaveBeenCalledWith("/images/5/rotate/", { angle: -17 });
});

it("surfaces the server's reason when the rotation is refused", async () => {
  mockedPost.mockRejectedValueOnce({ response: { data: { detail: "Source image file is missing." } } });
  expect(await rotateImage(5, 90)).toEqual({ ok: false, message: "Source image file is missing." });
});
