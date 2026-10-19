/** @jest-environment jsdom */
import { cropImageFile } from "./cropImageFile";

const drawImage = jest.fn();
const translate = jest.fn();
const ctx = {
  drawImage, translate, rotate: jest.fn(), fillRect: jest.fn(), save: jest.fn(), restore: jest.fn(),
  setTransform: jest.fn(), canvas: { width: 0, height: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  jest
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback, type?: string) {
      cb(new Blob(["x"], { type }));
    });
});

function image(width: number, height: number): HTMLImageElement {
  const img = document.createElement("img");
  Object.defineProperty(img, "naturalWidth", { value: width });
  Object.defineProperty(img, "naturalHeight", { value: height });
  return img;
}

it("returns the selection as a PNG, clamped to the image", async () => {
  const jpeg = await cropImageFile(image(1000, 800), { x: 900, y: 10, width: 300, height: 50 },
    new File(["a"], "cover scan.jpeg", { type: "image/jpeg" }));
  expect([jpeg.name, jpeg.type]).toEqual(["cover scan-crop.png", "image/png"]);
  expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 900, 10, 100, 50, 0, 0, 100, 50);

  const png = await cropImageFile(image(100, 100), { x: 0, y: 0, width: 50, height: 50 },
    new File(["a"], "tracing.png", { type: "image/png" }));
  expect([png.name, png.type]).toEqual(["tracing-crop.png", "image/png"]);
});

it("rejects a selection too small to be a marking", async () => {
  await expect(cropImageFile(image(100, 100), { x: 0, y: 0, width: 4, height: 40 },
    new File(["a"], "a.jpg", { type: "image/jpeg" }))).rejects.toThrow("larger area");
});

it("draws only the crop area of a turned image (issue #193)", async () => {
  // 80x60 turned 30 degrees is 100x92; the box is clamped to that, not to 80x60.
  await cropImageFile(image(80, 60), { x: 70, y: 10, width: 40, height: 20 },
    new File(["a"], "tilted.png", { type: "image/png" }), 30);
  const canvas = (HTMLCanvasElement.prototype.toBlob as jest.Mock).mock.contexts[0] as HTMLCanvasElement;
  expect([canvas.width, canvas.height]).toEqual([30, 20]);
  expect(translate.mock.calls).toEqual([[-70, -10], [50, 46]]);
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), -40, -30);
});
