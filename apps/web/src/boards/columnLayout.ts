import type { Element } from "./types";
import type { ItemData } from "./cardGeometry";
import { cardHeight } from "./cardGeometry";
import { columnPositions } from "../../../../packages/schema/src/boardLayout";
type Item = Element & { data: ItemData };
type Column = Element & { data: Extract<Element["data"], { type: "column" }> };
export function attachCard(card: Item, column: Column, order: number): Item {
  return {
    ...card,
    data: {
      ...card.data,
      columnKey: column.key,
      order,
      freeWidth: card.data.freeWidth ?? card.data.width,
      freeImageHeight: card.data.freeImageHeight ?? card.data.imageHeight,
      freeTextHeight: card.data.freeTextHeight ?? card.data.textHeight,
      width: column.data.width - 32,
    },
  };
}
export function detachCard(card: Item, point: { x: number; y: number }): Item {
  const {
    columnKey: _column,
    order: _order,
    freeWidth,
    freeImageHeight,
    freeTextHeight,
    ...data
  } = card.data;
  return {
    ...card,
    data: {
      ...data,
      ...point,
      width: freeWidth ?? 300,
      imageHeight: freeImageHeight ?? 200,
      textHeight: freeTextHeight ?? 120,
    },
  };
}
export function stackColumn(
  column: Column,
  cards: Item[],
  hasMedia: (id: string) => boolean = () => true,
): Item[] {
  const ordered = [...cards].sort(
    (a, b) =>
      (a.data.order ?? 0) - (b.data.order ?? 0) || a.key.localeCompare(b.key),
  );
  const positions = columnPositions(
    column.data,
    ordered.map((card) => cardHeight(card.data, hasMedia(card.data.itemId))),
  );
  return ordered.map((card, i) => ({
    ...card,
    data: { ...card.data, ...positions[i]!, order: i },
  }));
}
export function removeColumn(key: string, elements: Element[]): Element[] {
  return elements
    .filter((e) => e.key !== key)
    .map((e) => {
      if (e.data.type !== "item" || e.data.columnKey !== key) return e;
      const {
        columnKey: _column,
        order: _order,
        freeWidth: _width,
        freeImageHeight: _image,
        freeTextHeight: _text,
        ...data
      } = e.data;
      return { ...e, data };
    });
}
