import type { Element } from "./types";
export type ItemData = Extract<Element["data"], { type: "item" }>;
export function cardHeight(card: ItemData, media: boolean) {
  return card.mode === "image" && media
    ? card.imageHeight
    : card.mode === "combined" && media
      ? card.imageHeight + card.textHeight
      : card.textHeight;
}
export function resizeCard(
  card: ItemData,
  width: number,
  height: number,
  media: boolean,
): ItemData {
  width = Math.max(160, Math.min(10000, width));
  height = Math.min(10000, height);
  if (media && card.mode === "combined") {
    const ratio = height / (card.imageHeight + card.textHeight);
    return {
      ...card,
      width,
      imageHeight: Math.max(80, card.imageHeight * ratio),
      textHeight: Math.max(80, card.textHeight * ratio),
    };
  }
  return media && card.mode === "image"
    ? { ...card, width, imageHeight: Math.max(80, height) }
    : { ...card, width, textHeight: Math.max(80, height) };
}

export function finishResize(
  card: ItemData,
  bounds: { x: number; y: number; width: number; height: number },
  media: boolean,
): ItemData {
  return {
    ...resizeCard(card, bounds.width, bounds.height, media),
    x: bounds.x,
    y: bounds.y,
  };
}
