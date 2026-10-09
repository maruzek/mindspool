import { expect, it } from "vitest";
import {
  attachCard,
  detachCard,
  removeColumn,
  stackColumn,
} from "./columnLayout";
const column = {
  key: "column",
  data: { type: "column" as const, x: 100, y: 200, width: 400, title: "Ideas" },
};
const card = {
  key: "card",
  data: {
    type: "item" as const,
    itemId: "item" as never,
    membership: "one",
    x: 0,
    y: 0,
    width: 300,
    imageHeight: 200,
    textHeight: 120,
    mode: "combined" as const,
  },
};
it("stacks columns, remembers free geometry and restores it on ordinary detach", () => {
  const attached = attachCard(card, column, 0);
  expect(attached.data).toMatchObject({
    columnKey: "column",
    width: 368,
    freeWidth: 300,
  });
  const stacked = stackColumn(column, [
    attached,
    { ...attached, key: "second", data: { ...attached.data, order: 1 } },
  ]);
  expect(stacked[0]!.data).toMatchObject({ x: 116, y: 248 });
  expect(stacked[1]!.data.y).toBe(584);
  expect(detachCard(attached, { x: 1000, y: 1000 }).data).toMatchObject({
    x: 1000,
    y: 1000,
    width: 300,
  });
});
it("column deletion preserves current displayed dimensions and absolute position", () => {
  const attached = stackColumn(column, [attachCard(card, column, 0)])[0]!;
  const freed = removeColumn(column.key, [column, attached])[0]!;
  expect(freed.data).toMatchObject({ x: 116, y: 248, width: 368 });
  expect(freed.data).not.toHaveProperty("columnKey");
});
