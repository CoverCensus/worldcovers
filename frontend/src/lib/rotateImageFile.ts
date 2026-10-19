/**
 * Turn an upload that is not in the catalog yet clockwise by `quarterTurns`
 * (1, 2 or 3), returning a new File to submit in its place (Trello T66).
 *
 * `image` is the loaded preview element, so the turn starts from what the
 * contributor saw (browsers apply EXIF orientation to it). Saved as PNG like
 * an upload crop; a canvas keeps no metadata, so the result has no DPI or EXIF.
 */
export function rotateImageFile(
  image: HTMLImageElement,
  quarterTurns: 1 | 2 | 3,
  original: File,
): Promise<File> {
  const { naturalWidth: width, naturalHeight: height } = image;
  const sideways = quarterTurns % 2 === 1;

  const canvas = document.createElement("canvas");
  canvas.width = sideways ? height : width;
  canvas.height = sideways ? width : height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Your browser could not rotate this image."));
  // Turn about the canvas centre, then draw the image centred on it.
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((quarterTurns * Math.PI) / 2);
  ctx.drawImage(image, -width / 2, -height / 2);

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
