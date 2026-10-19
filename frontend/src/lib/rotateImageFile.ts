import { drawRotated, normalizeAngle, rotatedSize } from "@/lib/imageRotation";

/**
 * Turn an upload that is not in the catalog yet clockwise by `degrees`,
 * returning a new File to submit in its place (Trello T66; any angle since
 * workspace issue #193). The canvas grows to hold the whole turned image and
 * the uncovered corners are white, as on the server.
 *
 * `image` is the loaded preview element, so the turn starts from what the
 * contributor saw (browsers apply EXIF orientation to it). Saved as PNG like
 * an upload crop; a canvas keeps no metadata, so the result has no DPI or EXIF.
 */
export function rotateImageFile(image: HTMLImageElement, degrees: number, original: File): Promise<File> {
  if (normalizeAngle(degrees) === 0) return Promise.reject(new Error("Turn the image before saving."));
  const size = rotatedSize(image.naturalWidth, image.naturalHeight, degrees);

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Your browser could not rotate this image."));
  drawRotated(ctx, image, degrees);

  const type = "image/png";
  const base = original.name.replace(/\.[^.]+$/, "") || "image";
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // toBlob yields null when the canvas exceeds the browser's size limit
        // (iOS Safari caps it near 16 megapixels).
        if (!blob) {
          reject(new Error("This image is too large for your browser to rotate."));
          return;
        }
        resolve(new File([blob], `${base}-rotated.png`, { type }));
      },
      type,
    );
  });
}
