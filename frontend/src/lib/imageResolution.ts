export const PREFERRED_IMAGE_DPI = 300;

export interface ImageDpi {
  horizontal: number;
  vertical: number;
}

function validDpi(horizontal: number, vertical: number): ImageDpi | null {
  if (
    !Number.isFinite(horizontal) ||
    !Number.isFinite(vertical) ||
    horizontal <= 0 ||
    vertical <= 0
  ) {
    return null;
  }
  return { horizontal, vertical };
}

function jpegDpi(bytes: Uint8Array): ImageDpi | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  let estimatedDpi: ImageDpi | null = null;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) return estimatedDpi;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const length = view.getUint16(offset, false);
    if (length < 2 || offset + length > bytes.length) return null;
    const start = offset + 2;

    if (
      marker === 0xe0 &&
      length >= 14 &&
      bytes[start] === 0x4a &&
      bytes[start + 1] === 0x46 &&
      bytes[start + 2] === 0x49 &&
      bytes[start + 3] === 0x46 &&
      bytes[start + 4] === 0
    ) {
      const unit = bytes[start + 7];
      const horizontal = view.getUint16(start + 8, false);
      const vertical = view.getUint16(start + 10, false);
      if (unit === 1) estimatedDpi = validDpi(horizontal, vertical);
      if (unit === 2) estimatedDpi = validDpi(horizontal * 2.54, vertical * 2.54);
      // A 1 by 1 JFIF density has no physical unit. Image tools commonly
      // display these files at 72 DPI, so treat that value as an estimate.
      if (unit === 0 && horizontal === 1 && vertical === 1) {
        estimatedDpi = { horizontal: 72, vertical: 72 };
      }
    }

    if (
      marker === 0xe1 &&
      length >= 10 &&
      bytes[start] === 0x45 &&
      bytes[start + 1] === 0x78 &&
      bytes[start + 2] === 0x69 &&
      bytes[start + 3] === 0x66 &&
      bytes[start + 4] === 0 &&
      bytes[start + 5] === 0
    ) {
      const resolution = exifDpi(bytes, start + 6);
      if (resolution) return resolution;
    }
    offset += length;
  }
  return estimatedDpi;
}

function pngDpi(bytes: Uint8Array): ImageDpi | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    const start = offset + 8;
    if (start + length + 4 > bytes.length) return null;
    if (type === "pHYs" && length === 9 && bytes[start + 8] === 1) {
      const pixelsPerMetreX = view.getUint32(start, false);
      const pixelsPerMetreY = view.getUint32(start + 4, false);
      return validDpi(pixelsPerMetreX * 0.0254, pixelsPerMetreY * 0.0254);
    }
    if (type === "IEND") return null;
    offset = start + length + 4;
  }
  return null;
}

function exifDpi(bytes: Uint8Array, base = 0): ImageDpi | null {
  if (base + 8 > bytes.length) return null;
  const littleEndian = bytes[base] === 0x49 && bytes[base + 1] === 0x49;
  const bigEndian = bytes[base] === 0x4d && bytes[base + 1] === 0x4d;
  if (!littleEndian && !bigEndian) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(base + 2, littleEndian) !== 42) return null;
  const directory = base + view.getUint32(base + 4, littleEndian);
  if (directory + 2 > bytes.length) return null;
  const count = view.getUint16(directory, littleEndian);
  if (directory + 2 + count * 12 > bytes.length) return null;

  let horizontal: number | null = null;
  let vertical: number | null = null;
  let unit = 2;
  for (let index = 0; index < count; index += 1) {
    const entry = directory + 2 + index * 12;
    const tag = view.getUint16(entry, littleEndian);
    const type = view.getUint16(entry + 2, littleEndian);
    const valueCount = view.getUint32(entry + 4, littleEndian);
    if (tag === 296 && type === 3 && valueCount === 1) {
      unit = view.getUint16(entry + 8, littleEndian);
      continue;
    }
    if ((tag !== 282 && tag !== 283) || type !== 5 || valueCount !== 1) continue;
    const rational = base + view.getUint32(entry + 8, littleEndian);
    if (rational + 8 > bytes.length) return null;
    const numerator = view.getUint32(rational, littleEndian);
    const denominator = view.getUint32(rational + 4, littleEndian);
    if (denominator === 0) return null;
    if (tag === 282) horizontal = numerator / denominator;
    if (tag === 283) vertical = numerator / denominator;
  }
  if (horizontal == null || vertical == null || (unit !== 2 && unit !== 3)) return null;
  const scale = unit === 3 ? 2.54 : 1;
  return validDpi(horizontal * scale, vertical * scale);
}

export function imageDpiFromBytes(bytes: Uint8Array): ImageDpi | null {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return jpegDpi(bytes);
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return pngDpi(bytes);
  }
  return null;
}

export async function measureImageDpi(file: Blob): Promise<ImageDpi | null> {
  try {
    return imageDpiFromBytes(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return null;
  }
}

export function isBelowPreferredImageDpi(dpi: ImageDpi | null): boolean {
  return dpi != null &&
    Math.round(Math.min(dpi.horizontal, dpi.vertical)) < PREFERRED_IMAGE_DPI;
}
