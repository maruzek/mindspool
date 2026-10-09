import { expect, it } from "vitest";
import { BoardHistory, inverseOperations } from "./boardHistory";
const heading = {
  key: "heading",
  data: { type: "heading" as const, text: "Ideas", x: 0, y: 0, width: 300 },
};
it("groups whole layouts, bounds history and clears redo on new edits", () => {
  const history = new BoardHistory();
  const empty = { elements: [], connections: [] };
  const after = { elements: [heading], connections: [] };
  history.record(empty, after);
  expect(history.undo()).toEqual(empty);
  expect(history.redo()).toEqual(after);
  history.undo();
  history.record(empty, {
    elements: [{ ...heading, key: "other" }],
    connections: [],
  });
  expect(history.canRedo).toBe(false);
  for (let i = 0; i < 120; i++) history.record(empty, after);
  expect(history.length).toBe(100);
});
it("inverse removes only organization and restores stable keys plus incident edges", () => {
  const empty = { elements: [], connections: [] };
  const placed = { elements: [heading], connections: [] };
  expect(inverseOperations(placed, empty)).toEqual([
    { type: "remove", key: "heading" },
  ]);
  expect(inverseOperations(empty, placed)).toEqual([
    { type: "restore", key: "heading", data: heading.data },
  ]);
});
