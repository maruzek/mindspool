import { expect, it } from "vitest";
import { dropPosition } from "./BoardCanvas";
it("converts a drop using canvas transform rather than raw screen coordinates", () => {
  expect(
    dropPosition(
      { x: 500, y: 400 },
      { left: 100, top: 50 },
      { x: 20, y: 30, zoom: 2 },
    ),
  ).toEqual({ x: 190, y: 160 });
});
