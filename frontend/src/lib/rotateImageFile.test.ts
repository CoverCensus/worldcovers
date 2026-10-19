/** @jest-environment jsdom */
import { rotateImageFile } from "./rotateImageFile";

const ctx = { translate: jest.fn(), rotate: jest.fn(), drawImage: jest.fn() };
let blob: Blob | null;

beforeEach(() => {
  jest.clearAllMocks();
  blob = new Blob(["x"], { type: "image/png" });
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  jest
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation((cb: BlobCallback) => cb(blob));
});

function image(width: number, height: number): HTMLImageElement {
  const img = document.createElement("img");
  Object.defineProperty(img, "naturalWidth", { value: width });
  Object.defineProperty(img, "naturalHeight", { value: height });
  return img;
}

it("turns a quarter clockwise onto a swapped canvas, as a PNG", async () => {
  const file = await rotateImageFile(image(400, 200), 1, new File(["a"], "sideways.jpg", { type: "image/jpeg" }));

  expect([file.name, file.type]).toEqual(["sideways-rotated.png", "image/png"]);
  const canvas = (HTMLCanvasElement.prototype.toBlob as jest.Mock).mock.contexts[0] as HTMLCanvasElement;
  expect([canvas.width, canvas.height]).toEqual([200, 400]);
  expect(ctx.translate).toHaveBeenCalledWith(100, 200);
  expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
  expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), -200, -100);
});

it("keeps the canvas shape for a half turn", async () => {
  await rotateImageFile(image(400, 200), 2, new File(["a"], "a.png", { type: "image/png" }));

  const canvas = (HTMLCanvasElement.prototype.toBlob as jest.Mock).mock.contexts[0] as HTMLCanvasElement;
  expect([canvas.width, canvas.height]).toEqual([400, 200]);
});

it("rejects when the browser cannot encode an image that large", async () => {
  blob = null;
  await expect(
    rotateImageFile(image(9000, 9000), 3, new File(["a"], "huge.png", { type: "image/png" })),
  ).rejects.toThrow("too large");
});
