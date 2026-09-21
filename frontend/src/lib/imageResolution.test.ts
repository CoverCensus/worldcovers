import {
  imageDpiFromBytes,
  isBelowPreferredImageDpi,
  measureImageDpi,
} from "./imageResolution";

function jpegWithJfifDensity(unit: number, horizontal: number, vertical: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, unit,
    horizontal >> 8, horizontal & 0xff,
    vertical >> 8, vertical & 0xff,
    0x00, 0x00, 0xff, 0xd9,
  ]);
}

function pngWithPixelsPerMetre(horizontal: number, vertical: number): Uint8Array {
  const bytes = new Uint8Array(8 + 4 + 4 + 9 + 4 + 4 + 4 + 4);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 9, false);
  bytes.set([0x70, 0x48, 0x59, 0x73], 12);
  view.setUint32(16, horizontal, false);
  view.setUint32(20, vertical, false);
  bytes[24] = 1;
  view.setUint32(29, 0, false);
  bytes.set([0x49, 0x45, 0x4e, 0x44], 33);
  return bytes;
}

function jpegWithExifDpi(dpi: number): Uint8Array {
  const tiff = new Uint8Array(66);
  const view = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 0x2a, 0x00]);
  view.setUint32(4, 8, true);
  view.setUint16(8, 3, true);

  view.setUint16(10, 282, true);
  view.setUint16(12, 5, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 50, true);
  view.setUint16(22, 283, true);
  view.setUint16(24, 5, true);
  view.setUint32(26, 1, true);
  view.setUint32(30, 58, true);
  view.setUint16(34, 296, true);
  view.setUint16(36, 3, true);
  view.setUint32(38, 1, true);
  view.setUint16(42, 2, true);
  view.setUint32(50, dpi, true);
  view.setUint32(54, 1, true);
  view.setUint32(58, dpi, true);
  view.setUint32(62, 1, true);

  const length = 2 + 6 + tiff.length;
  const jpeg = new Uint8Array(2 + 2 + length + 2);
  jpeg.set([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff]);
  jpeg.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 6);
  jpeg.set(tiff, 12);
  jpeg.set([0xff, 0xd9], jpeg.length - 2);
  return jpeg;
}

describe("imageDpiFromBytes", () => {
  it("reads JPEG pixels per inch", () => {
    expect(imageDpiFromBytes(jpegWithJfifDensity(1, 200, 200))).toEqual({
      horizontal: 200,
      vertical: 200,
    });
  });

  it("estimates 72 DPI for an unscaled 1 by 1 JFIF density", () => {
    expect(imageDpiFromBytes(jpegWithJfifDensity(0, 1, 1))).toEqual({
      horizontal: 72,
      vertical: 72,
    });
  });

  it("reads PNG pixels per metre", () => {
    const result = imageDpiFromBytes(pngWithPixelsPerMetre(11811, 11811));
    expect(result?.horizontal).toBeCloseTo(300, 0);
    expect(result?.vertical).toBeCloseTo(300, 0);
  });

  it("reads JPEG EXIF resolution", () => {
    expect(imageDpiFromBytes(jpegWithExifDpi(240))).toEqual({
      horizontal: 240,
      vertical: 240,
    });
  });

  it("returns null for data without supported resolution metadata", () => {
    expect(imageDpiFromBytes(Uint8Array.from([1, 2, 3, 4]))).toBeNull();
  });
});

describe("isBelowPreferredImageDpi", () => {
  it("flags a resolution below 300 DPI", () => {
    expect(isBelowPreferredImageDpi({ horizontal: 299, vertical: 300 })).toBe(true);
  });

  it("accepts 300 DPI and missing metadata", () => {
    expect(isBelowPreferredImageDpi({ horizontal: 300, vertical: 300 })).toBe(false);
    expect(isBelowPreferredImageDpi(null)).toBe(false);
  });
});

describe("measureImageDpi", () => {
  it("reads a file without throwing", async () => {
    const bytes = jpegWithJfifDensity(1, 150, 150);
    const buffer = new ArrayBuffer(bytes.length);
    new Uint8Array(buffer).set(bytes);
    const file = new Blob([buffer], { type: "image/jpeg" });
    await expect(measureImageDpi(file)).resolves.toEqual({ horizontal: 150, vertical: 150 });
  });
});
