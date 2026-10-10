import type { BoardPreview } from "./types";
import type { ItemData } from "./cardGeometry";
export function hasCardText(preview?: BoardPreview) {
  return (
    preview?.hasText ?? Boolean(preview?.title.trim() || preview?.body.trim())
  );
}
/** Single-content cards always render their available content, even with an old saved mode. */
export function effectiveCard(
  card: ItemData,
  preview?: BoardPreview,
): ItemData {
  if (!preview) return card;
  const mode = !preview.imageUrl
    ? "text"
    : !hasCardText(preview)
      ? "image"
      : card.mode;
  return mode === card.mode ? card : { ...card, mode };
}
