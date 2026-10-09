import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
async function setup() {
  const t = convexTest(schema, modules);
  const a = t.withIdentity({ subject: "alice" });
  const labelId = await a.mutation(api.labels.create, { name: "Design" });
  const board = await a.mutation(api.boards.open, { labelId });
  const itemId = await a.mutation(api.items.create, {
    inputType: "text",
    originalInput: "Hello",
    captureKey: "hello",
    captureSource: "web",
  });
  return { t, a, labelId, board, itemId };
}
it("places atomically, acknowledges identical retries and preserves content on removal", async () => {
  const { a, board, itemId, labelId } = await setup();
  const request = {
    boardId: board._id,
    expectedRevision: 0,
    session: "one",
    sequence: 1,
    operations: [{ type: "place" as const, key: "card", itemId, x: 20, y: 30 }],
  };
  const ack = await a.mutation(api.boardOperations.apply, request);
  expect(ack.revision).toBe(1);
  expect(await a.mutation(api.boardOperations.apply, request)).toEqual(ack);
  await expect(
    a.mutation(api.boardOperations.apply, {
      ...request,
      operations: [{ ...request.operations[0]!, x: 40 }],
    }),
  ).rejects.toThrow("identity");
  await expect(
    a.mutation(api.boardOperations.apply, { ...request, session: "two" }),
  ).rejects.toThrow("changed");
  const links = await a.query(api.itemLabels.listForItem, {
    itemId,
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(links.page.map((l) => l._id)).toContain(labelId);
  await a.mutation(api.boardOperations.apply, {
    ...request,
    expectedRevision: 1,
    sequence: 2,
    operations: [{ type: "remove", key: "card" }],
  });
  expect(
    (
      await a.query(api.boards.elements, {
        boardId: board._id,
        paginationOpts: { numItems: 50, cursor: null },
      })
    ).page,
  ).toEqual([]);
  expect(await a.query(api.items.get, { id: itemId })).toMatchObject({
    originalInput: "Hello",
  });
});
it("rolls back inclusion and placement if any operation fails", async () => {
  const { a, t, board, itemId } = await setup();
  const foreign = await t
    .withIdentity({ subject: "bob" })
    .mutation(api.items.create, {
      inputType: "text",
      originalInput: "private",
      captureKey: "foreign",
      captureSource: "web",
    });
  await expect(
    a.mutation(api.boardOperations.apply, {
      boardId: board._id,
      expectedRevision: 0,
      session: "one",
      sequence: 1,
      operations: [
        { type: "place", key: "one", itemId, x: 0, y: 0 },
        { type: "place", key: "two", itemId: foreign, x: 0, y: 0 },
      ],
    }),
  ).rejects.toThrow("Not found");
  expect(
    (
      await a.query(api.itemLabels.listForItem, {
        itemId,
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).page,
  ).toHaveLength(0);
  expect((await a.query(api.boards.get, { boardId: board._id })).revision).toBe(
    0,
  );
});
