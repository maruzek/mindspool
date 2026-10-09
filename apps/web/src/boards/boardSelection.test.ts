import { expect, it } from "vitest";
import { groupMove, groupRemove } from "./boardSelection";
const column = {
  key: "column",
  data: { type: "column" as const, x: 100, y: 100, width: 400, title: "Ideas" },
};
const card = {
  key: "card",
  data: {
    type: "item" as const,
    itemId: "item" as never,
    membership: "one",
    x: 116,
    y: 148,
    width: 368,
    imageHeight: 200,
    textHeight: 120,
    mode: "combined" as const,
    columnKey: "column",
    order: 0,
  },
};
it("moves selected column children once and removes only explicitly selected placements", () => {
  const layout = { elements: [column, card], connections: [] };
  const ops = groupMove(layout, new Set(["column", "card"]), { x: 10, y: 20 });
  expect(ops).toHaveLength(2);
  expect(ops[1]).toMatchObject({ data: { x: 126, y: 168 } });
  expect(groupRemove(layout, new Set(["column"]), new Set())).toEqual([
    { type: "remove", key: "column" },
  ]);
  expect(
    groupRemove(layout, new Set(["column", "card"]), new Set()),
  ).toHaveLength(2);
});
it("detaches explicitly moved children when their container is not selected", () => {
  const ops = groupMove(
    { elements: [column, card], connections: [] },
    new Set(["card"]),
    { x: 500, y: 20 },
  );
  expect(ops[0]).toMatchObject({ data: { x: 616, y: 168, width: 300 } });
  expect(
    ops[0]!.type === "set" && ops[0]!.data.type === "item"
      ? ops[0]!.data.columnKey
      : "invalid",
  ).toBeUndefined();
});
