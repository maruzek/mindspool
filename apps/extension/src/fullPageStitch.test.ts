import { expect, it } from "vitest";
import { stitchGeometry } from "./fullPageStitch";
it("adds only the uncaptured strip of an overlapping final tile", () => {
  const result = stitchGeometry(
    [
      { width: 2560, height: 1305, y: 0 },
      { width: 2560, height: 1305, y: 795 },
    ],
    2560,
    2100,
    1305,
  );
  expect(result).toEqual({
    width: 2560,
    height: 2100,
    placements: [
      { sourceY: 0, destinationY: 0, height: 1305 },
      { sourceY: 510, destinationY: 1305, height: 795 },
    ],
  });
});
it("uses actual vertical scaling at fractional DPR without accumulating rounding gaps", () => {
  const result = stitchGeometry(
    [0, 700, 1400].map((y) => ({ width: 1254, height: 875, y })),
    1003,
    2100,
    700,
  );
  expect(result.height).toBe(2625);
  expect(result.placements[2]).toMatchObject({
    destinationY: 1750,
    height: 875,
  });
});
it("refuses partial output, gaps, unstable widths, and oversized canvases", () => {
  expect(() =>
    stitchGeometry([{ width: 1000, height: 700, y: 0 }], 1000, 2100, 700),
  ).toThrow();
  expect(() =>
    stitchGeometry(
      [
        { width: 1000, height: 700, y: 0 },
        { width: 1000, height: 700, y: 800 },
      ],
      1000,
      1500,
      700,
    ),
  ).toThrow();
  expect(() =>
    stitchGeometry(
      [
        { width: 1000, height: 700, y: 0 },
        { width: 1200, height: 700, y: 700 },
      ],
      1000,
      1400,
      700,
    ),
  ).toThrow();
  expect(() =>
    stitchGeometry([{ width: 5000, height: 700, y: 0 }], 5000, 10000, 700),
  ).toThrow("too_large");
});
