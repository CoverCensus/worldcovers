/**
 * Free rotation geometry shared by the Rotate tool and the crop dialogs
 * (workspace issue #193, which replaced T66's quarter turns).
 *
 * Angles are clockwise degrees, like CSS and canvas `rotate`. The rotate handle
 * keeps an unbounded running angle so it can go round any number of times;
 * only `normalizeAngle` of it is ever saved.
 *
 * `rotatedSize` repeats Pillow's `Image.rotate(expand=True)` arithmetic step by
 * step (backend/common/images.py `_rotated`), so a crop box drawn on the
 * browser preview lands on the same pixels when the server turns and crops.
 */

/** How close (degrees) the handle must come to upright or a right angle to snap to it. */
export const SNAP_DEGREES = 3;

/** Uncovered corners are filled white, like scan paper (matches the server). */
export const FILL_COLOUR = "#ffffff";

/** Clockwise degrees in (-180, 180], to a tenth of a degree. A non-finite angle is no turn. */
export function normalizeAngle(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  let turned = Math.round((((degrees % 360) + 360) % 360) * 10) / 10;
  turned %= 360;
  if (turned > 180) turned -= 360;
  return turned + 0; // -0 -> 0
}

/** Snap to the nearest multiple of 90 within `threshold`, keeping the number of full turns. */
export function snapAngle(degrees: number, threshold = SNAP_DEGREES): number {
  const nearest = Math.round(degrees / 90) * 90;
  return Math.abs(degrees - nearest) <= threshold ? nearest + 0 : degrees;
}

/** A right angle (or none) turns exactly, without resampling. */
export function isRightAngle(degrees: number): boolean {
  return normalizeAngle(degrees) % 90 === 0;
}

// Python's round(x, 15), which Pillow applies to the rotation matrix.
const round15 = (value: number) => Number(value.toFixed(15));

/** Size of the canvas that holds the whole image turned by `degrees`, as Pillow computes it. */
export function rotatedSize(width: number, height: number, degrees: number): { width: number; height: number } {
  const angle = normalizeAngle(degrees);
  if (angle % 180 === 0) return { width, height };
  if (angle % 90 === 0) return { width: height, height: width };

  // Pillow is called with the counter-clockwise angle -degrees; it reduces it
  // mod 360 and builds the inverse matrix from -radians of that.
  const counterClockwise = ((-angle % 360) + 360) % 360;
  const radians = -(counterClockwise * (Math.PI / 180));
  const a = round15(Math.cos(radians));
  const b = round15(Math.sin(radians));
  const d = round15(-Math.sin(radians));
  const e = a;
  const cx = width / 2;
  const cy = height / 2;
  const c = a * -cx + b * -cy + cx;
  const f = d * -cx + e * -cy + cy;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [[0, 0], [width, 0], [width, height], [0, height]]) {
    xs.push(a * x + b * y + c);
    ys.push(d * x + e * y + f);
  }
  return {
    width: Math.ceil(Math.max(...xs)) - Math.floor(Math.min(...xs)),
    height: Math.ceil(Math.max(...ys)) - Math.floor(Math.min(...ys)),
  };
}

/** Direction from `centre` to `point` in clockwise screen degrees (y points down). */
export function pointerAngle(centre: { x: number; y: number }, point: { x: number; y: number }): number {
  return (Math.atan2(point.y - centre.y, point.x - centre.x) * 180) / Math.PI;
}

/**
 * Signed change from one pointer direction to the next, in (-180, 180].
 * Adding these up keeps the running angle continuous across the +/-180 seam,
 * so the handle can be turned round and round in either direction.
 */
export function angleDelta(from: number, to: number): number {
  let delta = (to - from) % 360;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return delta;
}

/**
 * Draw `image` turned clockwise by `degrees` about the centre of an expanded
 * `rotatedSize` canvas, with white corners. A crop translates first, so only
 * its part of that canvas is drawn.
 */
export function drawRotated(ctx: CanvasRenderingContext2D, image: HTMLImageElement, degrees: number): void {
  const { naturalWidth: width, naturalHeight: height } = image;
  const turned = rotatedSize(width, height, degrees);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = FILL_COLOUR;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
  ctx.translate(turned.width / 2, turned.height / 2);
  ctx.rotate((normalizeAngle(degrees) * Math.PI) / 180);
  ctx.drawImage(image, -width / 2, -height / 2);
}
