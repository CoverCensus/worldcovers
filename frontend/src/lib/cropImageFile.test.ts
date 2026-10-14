/** @jest-environment jsdom */
import { cropImageFile } from "./cropImageFile";

const drawImage = jest.fn();

beforeEach(() => {
  drawImage.mockClear();
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
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

it("returns the selection as a new file of the same kind, clamped to the image", async () => {
  const jpeg = await cropImageFile(image(1000, 800), { x: 900, y: 10, width: 300, height: 50 },
    new File(["a"], "cover scan.jpeg", { type: "image/jpeg" }));
  expect([jpeg.name, jpeg.type]).toEqual(["cover scan-crop.jpg", "image/jpeg"]);
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 900, 10, 100, 50, 0, 0, 100, 50);

  const png = await cropImageFile(image(100, 100), { x: 0, y: 0, width: 50, height: 50 },
    new File(["a"], "tracing.png", { type: "image/png" }));
  expect([png.name, png.type]).toEqual(["tracing-crop.png", "image/png"]);
});

it("rejects a selection too small to be a marking", async () => {
  await expect(cropImageFile(image(100, 100), { x: 0, y: 0, width: 4, height: 40 },
    new File(["a"], "a.jpg", { type: "image/jpeg" }))).rejects.toThrow("larger area");
});
