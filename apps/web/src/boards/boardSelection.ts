import type { Layout, Operation } from "./types";
import { detachCard } from "./columnLayout";
export function groupMove(
  layout: Layout,
  selected: Set<string>,
  delta: { x: number; y: number },
): Operation[] {
  return layout.elements
    .filter(
      (e) =>
        selected.has(e.key) ||
        (e.data.type === "item" &&
          e.data.columnKey &&
          selected.has(e.data.columnKey)),
    )
    .map((e) => {
      const point = { x: e.data.x + delta.x, y: e.data.y + delta.y };
      return {
        type: "set",
        key: e.key,
        data:
          e.data.type === "item" &&
          e.data.columnKey &&
          !selected.has(e.data.columnKey)
            ? detachCard({ ...e, data: e.data }, point).data
            : { ...e.data, ...point },
      };
    });
}
export function groupRemove(
  layout: Layout,
  selected: Set<string>,
  edges: Set<string>,
): Operation[] {
  // Remove explicitly selected children before containers so preservation cannot undo their removal.
  const elements = layout.elements
    .filter((e) => selected.has(e.key))
    .sort(
      (a, b) =>
        Number(a.data.type === "column") - Number(b.data.type === "column"),
    );
  return [
    ...elements.map((e) => ({ type: "remove" as const, key: e.key })),
    ...layout.connections
      .filter((e) => edges.has(e.key))
      .map((e) => ({ type: "removeEdge" as const, key: e.key })),
  ];
}
