import { expect, it } from "vitest";
import { cardHeight, resizeCard, finishResize } from "./cardGeometry";
const card = {
  type: "item" as const,
  itemId: "item" as never,
  membership: "one",
  x: 0,
  y: 0,
  width: 300,
  mode: "combined" as const,
  imageHeight: 200,
  textHeight: 120,
};
it("keeps equal text height without media and preserves regions across display modes", () => {
  expect(cardHeight(card, false)).toBe(120);
  expect(cardHeight(card, true)).toBe(320);
  expect(resizeCard(card, 400, 480, true)).toMatchObject({
    width: 400,
    imageHeight: 300,
    textHeight: 180,
  });
  expect(resizeCard({ ...card, mode: "text" }, 160, 160, true)).toMatchObject({
    imageHeight: 200,
    textHeight: 160,
  });
  expect(resizeCard(card, 100, 100, true)).toMatchObject({
    width: 160,
    imageHeight: 80,
    textHeight: 80,
  });
});

it("persists the origin when resizing from the top or left", () => {
  expect(
    finishResize(card, { x: -40, y: -20, width: 340, height: 340 }, true),
  ).toMatchObject({ x: -40, y: -20, width: 340 });
});
