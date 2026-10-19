/** @jest-environment jsdom */
import { rotateImageFile } from "./rotateImageFile";

const ctx = {
  translate: jest.fn(),
  rotate: jest.fn(),
  drawImage: jest.fn(),
  fillRect: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  setTransform: jest.fn(),
  canvas: { width: 0, height: 0 },
};
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

function drawnCanvas(): HTMLCanvasElement {
  return (HTMLCanvasElement.prototype.toBlob as jest.Mock).mock.contexts[0] as HTMLCanvasElement;
}

it("turns a quarter clockwise onto a swapped canvas, as a PNG", async () => {
  const file = await rotateImageFile(image(400, 200), 90, new File(["a"], "sideways.jpg", { type: "image/jpeg" }));

  expect([file.name, file.type]).toEqual(["sideways-rotated.png", "image/png"]);
  expect([drawnCanvas().width, drawnCanvas().height]).toEqual([200, 400]);
  expect(ctx.translate).toHaveBeenCalledWith(100, 200);
  expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
  expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), -200, -100);
});

it("grows the canvas for any other angle, white behind the corners", async () => {
  await rotateImageFile(image(80, 60), 390, new File(["a"], "a.png", { type: "image/png" }));

  // 390 is 30 degrees; Pillow's expanded size for 80x60 is 100x92.
  expect([drawnCanvas().width, drawnCanvas().height]).toEqual([100, 92]);
  expect(ctx.fillRect).toHaveBeenCalled();
  expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 6);
});

it("rejects when the browser cannot encode an image that large", async () => {
  blob = null;
  await expect(
    rotateImageFile(image(9000, 9000), 270, new File(["a"], "huge.png", { type: "image/png" })),
  ).rejects.toThrow("too large");
});
