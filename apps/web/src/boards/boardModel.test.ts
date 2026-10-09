import { expect, it } from "vitest";
import { layoutFromDocuments } from "./boardModel";
import { inverseOperations } from "./boardHistory";
it("normalizes persisted connection documents before editing or replay", () => {
  const doc = {
    _id: "db",
    _creationTime: 1,
    ownerId: "owner",
    boardId: "board",
    pairKey: '["a","b"]',
    key: "edge",
    source: "a",
    target: "b",
    arrows: "none",
    label: "",
    color: "ink",
  };
  const layout = layoutFromDocuments({
    revision: 0,
    elements: [],
    connections: [doc],
  } as never);
  expect(layout.connections[0]).toEqual({
    key: "edge",
    source: "a",
    target: "b",
    arrows: "none",
    label: "",
    color: "ink",
  });
  expect(
    inverseOperations({ elements: [], connections: [] }, layout)[0],
  ).toEqual({
    type: "edge",
    key: "edge",
    data: { source: "a", target: "b", arrows: "none", label: "", color: "ink" },
  });
});
