import { MIN_CROP_PX, type CropRect } from "@/components/CropSelectionDialog";

/**
 * Cut `rect` (natural pixels) out of an upload that is not in the catalog yet,
 * returning a new File to submit in its place.
 *
 * `image` is the element the selection was drawn on, so the crop uses exactly
 * the pixels the contributor saw (browsers apply EXIF orientation to it).
 * Save as PNG to avoid further compression loss. A canvas keeps no metadata,
 * so the result carries no DPI or EXIF.
 */
export function cropImageFile(image: HTMLImageElement, rect: CropRect, original: File): Promise<File> {
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const width = Math.min(Math.round(rect.width), image.naturalWidth - x);
  const height = Math.min(Math.round(rect.height), image.naturalHeight - y);
  if (width < MIN_CROP_PX || height < MIN_CROP_PX) {
    return Promise.reject(new Error("Drag a larger area to crop."));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Your browser could not crop this image."));
  ctx.drawImage(image, x, y, width, height, 0, 0, width, height);

  const type = "image/png";
  const base = original.name.replace(/\.[^.]+$/, "") || "image";
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // toBlob yields null when the canvas exceeds the browser's size limit
        // (iOS Safari caps it near 16 megapixels).
        if (!blob) {
          reject(new Error("This area is too large for your browser to crop. Select a smaller area."));
          return;
        }
        resolve(new File([blob], `${base}-crop.png`, { type }));
      },
      type,
    );
  });
}
