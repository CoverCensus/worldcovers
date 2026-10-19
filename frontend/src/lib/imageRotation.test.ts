import { angleDelta, normalizeAngle, pointerAngle, rotatedSize, snapAngle } from "./imageRotation";

it("keeps only where the handle ended up, in (-180, 180]", () => {
  expect([0, 360, -720, 450, -90, 180, -180, 190, 17.04, -0.04].map(normalizeAngle)).toEqual([
    0, 0, 0, 90, -90, 180, 180, -170, 17, 0,
  ]);
});

it("snaps to upright and right angles nearby, keeping the full turns", () => {
  expect([2.9, 87.5, -92, 362, 4, 45].map((a) => snapAngle(a))).toEqual([0, 90, -90, 360, 4, 45]);
});

it("matches Pillow's expanded size (backend test_image_rotate / test_image_crop)", () => {
  expect(rotatedSize(80, 60, 30)).toEqual({ width: 100, height: 92 });
  expect(rotatedSize(200, 100, 10)).toEqual({ width: 216, height: 134 });
  // Right angles are exact swaps, like Pillow's transpose fast path.
  expect(rotatedSize(81, 60, -90)).toEqual({ width: 60, height: 81 });
  expect(rotatedSize(81, 60, 540)).toEqual({ width: 81, height: 60 });
});

it("adds up pointer moves across the +/-180 seam so the handle can keep turning", () => {
  const centre = { x: 0, y: 0 };
  // Pointer circling clockwise (screen y down) one and a half times.
  const path = Array.from({ length: 13 }, (_, i) => i * 45).map((deg) => ({
    x: Math.cos((deg * Math.PI) / 180),
    y: Math.sin((deg * Math.PI) / 180),
  }));
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += angleDelta(pointerAngle(centre, path[i - 1]), pointerAngle(centre, path[i]));
  }
  expect(total).toBeCloseTo(540);
  // And back the other way.
  expect(angleDelta(170, -170)).toBeCloseTo(20);
  expect(angleDelta(-170, 170)).toBeCloseTo(-20);
});
