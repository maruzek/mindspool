import { expect, it } from "vitest";
import { effectiveCard, hasCardText } from "./cardContent";
import { cardHeight } from "./cardGeometry";
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
const preview = {
  itemId: card.itemId,
  title: "URL fallback",
  body: "URL fallback",
  imageUrl: "https://example.com/image.png",
  hasText: false,
  source: "web" as const,
  originalUrl: null,
  labels: [],
};
it("renders only the available content despite a saved incompatible display mode", () => {
  expect(hasCardText(preview)).toBe(false);
  expect(effectiveCard({ ...card, mode: "text" }, preview).mode).toBe("image");
  expect(cardHeight(effectiveCard(card, preview), true)).toBe(200);
  expect(
    effectiveCard(
      { ...card, mode: "image" },
      { ...preview, imageUrl: null, hasText: true },
    ).mode,
  ).toBe("text");
  expect(effectiveCard(card, { ...preview, hasText: true }).mode).toBe(
    "combined",
  );
});
