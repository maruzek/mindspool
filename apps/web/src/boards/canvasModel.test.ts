import { expect, it } from "vitest";
import { moveCard } from "./canvasModel";
import type { Layout } from "./types";
it("excludes the moving card from its own column insertion index", () => {
  const layout: Layout = {
    connections: [],
    elements: [
      {
        key: "column",
        data: { type: "column", title: "Stack", x: 0, y: 0, width: 400 },
      },
      ...["a", "b", "c"].map((key, order) => ({
        key,
        data: {
          type: "item" as const,
          itemId: key as never,
          membership: "current",
          columnKey: "column",
          order,
          x: 16,
          y: 48 + order * 136,
          width: 368,
          imageHeight: 200,
          textHeight: 120,
          mode: "text" as const,
        },
      })),
    ],
  };
  const operations = moveCard(
    layout,
    layout.elements[1]!,
    { x: 16, y: 150 },
    [],
  );
  expect(
    operations
      .filter((op) => op.type === "set" && op.data.type === "item")
      .map((op) =>
        op.type === "set"
          ? [op.key, op.data.type === "item" ? op.data.order : -1]
          : [],
      ),
  ).toEqual([
    ["a", 0],
    ["b", 1],
    ["c", 2],
  ]);
});
