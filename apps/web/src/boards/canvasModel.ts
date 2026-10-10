import type { Element, Layout, Operation, BoardPreview } from "./types";
import { attachCard, detachCard, stackColumn } from "./columnLayout";
import { effectiveCard } from "./cardContent";
import { cardHeight } from "./cardGeometry";
export function columnAt(
  layout: Layout,
  point: { x: number; y: number },
  previews: BoardPreview[],
  excludeKey?: string,
) {
  for (const column of [...layout.elements].reverse()) {
    if (column.data.type !== "column") continue;
    const children = layout.elements.filter(
      (e) => e.data.type === "item" && e.data.columnKey === column.key,
    );
    const height =
      80 +
      children.reduce(
        (n, e) =>
          n +
          (e.data.type === "item"
            ? cardHeight(
                effectiveCard(
                  e.data,
                  previews.find(
                    (p) =>
                      p.itemId ===
                      (e.data.type === "item" ? e.data.itemId : undefined),
                  ),
                ),
                Boolean(
                  previews.find(
                    (p) =>
                      p.itemId ===
                      (e.data.type === "item" ? e.data.itemId : undefined),
                  )?.imageUrl,
                ),
              ) + 16
            : 0),
        0,
      );
    if (
      point.x >= column.data.x &&
      point.x <= column.data.x + column.data.width &&
      point.y >= column.data.y &&
      point.y <= column.data.y + height
    ) {
      const order = children
        .filter((e) => e.key !== excludeKey)
        .filter(
          (e) =>
            point.y >
            e.data.y +
              (e.data.type === "item"
                ? cardHeight(
                    effectiveCard(
                      e.data,
                      previews.find(
                        (p) =>
                          p.itemId ===
                          (e.data.type === "item" ? e.data.itemId : undefined),
                      ),
                    ),
                    Boolean(
                      previews.find(
                        (p) =>
                          p.itemId ===
                          (e.data.type === "item" ? e.data.itemId : undefined),
                      )?.imageUrl,
                    ),
                  ) / 2
                : 0),
        ).length;
      return { column, order };
    }
  }
  return undefined;
}
export function moveCard(
  layout: Layout,
  card: Element,
  point: { x: number; y: number },
  previews: BoardPreview[],
): Operation[] {
  if (card.data.type !== "item") return [];
  const item = { ...card, data: card.data };
  const target = columnAt(layout, point, previews, card.key);
  const moved =
    target && target.column.data.type === "column"
      ? attachCard(
          item,
          { ...target.column, data: target.column.data },
          target.order,
        )
      : card.data.columnKey
        ? detachCard(item, point)
        : { ...item, data: { ...item.data, ...point } };
  const result = new Map<string, Element>([[card.key, moved]]);
  const columnKeys = new Set([card.data.columnKey, target?.column.key]);
  for (const columnKey of columnKeys) {
    const column = layout.elements.find((e) => e.key === columnKey);
    if (column?.data.type !== "column") continue;
    const siblings = layout.elements
      .filter(
        (e) =>
          e.key !== card.key &&
          e.data.type === "item" &&
          e.data.columnKey === columnKey,
      )
      .sort(
        (a, b) =>
          (a.data.type === "item" ? (a.data.order ?? 0) : 0) -
          (b.data.type === "item" ? (b.data.order ?? 0) : 0),
      );
    if (moved.data.columnKey === columnKey)
      siblings.splice(Math.min(target?.order ?? 0, siblings.length), 0, moved);
    const cards = siblings.flatMap((e, order) =>
      e.data.type === "item" ? [{ ...e, data: { ...e.data, order } }] : [],
    );
    for (const child of stackColumn(
      { ...column, data: column.data },
      cards.map((card) => ({
        ...card,
        data: effectiveCard(
          card.data,
          previews.find((p) => p.itemId === card.data.itemId),
        ),
      })),
      (id) => Boolean(previews.find((p) => p.itemId === id)?.imageUrl),
    ))
      result.set(child.key, child);
  }
  return [...result.values()].map((e) => ({
    type: "set",
    key: e.key,
    data: e.data,
  }));
}
export function reorderForInsertion(
  layout: Layout,
  columnKey: string,
  order: number,
): Operation[] {
  return layout.elements
    .filter((e) => e.data.type === "item" && e.data.columnKey === columnKey)
    .sort(
      (a, b) =>
        (a.data.type === "item" ? (a.data.order ?? 0) : 0) -
        (b.data.type === "item" ? (b.data.order ?? 0) : 0),
    )
    .map((e, i) => ({
      type: "set",
      key: e.key,
      data:
        e.data.type === "item"
          ? { ...e.data, order: i >= order ? i + 1 : i }
          : e.data,
    }));
}
