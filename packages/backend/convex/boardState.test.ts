import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
it("exclusion then inclusion before cleanup never revives a placement", async () => {
  vi.useFakeTimers();
  try {
    const a = convexTest(schema, modules).withIdentity({ subject: "alice" });
    const labelId = await a.mutation(api.labels.create, { name: "Notes" });
    const board = await a.mutation(api.boards.open, { labelId });
    const itemId = await a.mutation(api.items.create, {
      inputType: "text",
      originalInput: "Hello",
      captureKey: "hello",
      captureSource: "web",
    });
    await a.mutation(api.boardOperations.apply, {
      boardId: board._id,
      expectedRevision: 0,
      session: "one",
      sequence: 1,
      operations: [{ type: "place", key: "card", itemId, x: 0, y: 0 }],
    });
    await a.mutation(api.itemLabels.remove, { itemId, labelId });
    await a.mutation(api.itemLabels.attach, { itemId, labelId });
    expect(
      (
        await a.query(api.boards.elements, {
          boardId: board._id,
          paginationOpts: { numItems: 50, cursor: null },
        })
      ).page,
    ).toHaveLength(0);
    await a.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }
});
it("item deletion hides every board immediately and drains bounded cleanup", async () => {
  vi.useFakeTimers();
  try {
    const a = convexTest(schema, modules).withIdentity({ subject: "alice" });
    const itemId = await a.mutation(api.items.create, {
      inputType: "text",
      originalInput: "Hello",
      captureKey: "hello",
      captureSource: "web",
    });
    const boards = [];
    for (let i = 0; i < 24; i++) {
      const labelId = await a.mutation(api.labels.create, {
        name: `Label ${i}`,
      });
      const board = await a.mutation(api.boards.open, { labelId });
      boards.push(board);
      await a.mutation(api.boardOperations.apply, {
        boardId: board._id,
        expectedRevision: 0,
        session: "one",
        sequence: 1,
        operations: [{ type: "place", key: "card", itemId, x: 0, y: 0 }],
      });
    }
    await a.mutation(api.items.remove, { id: itemId });
    for (const board of boards)
      expect(
        (
          await a.query(api.boards.elements, {
            boardId: board._id,
            paginationOpts: { numItems: 50, cursor: null },
          })
        ).page,
      ).toHaveLength(0);
    await a.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      await a.run((ctx) => ctx.db.query("boardElements").collect()),
    ).toHaveLength(0);
  } finally {
    vi.useRealTimers();
  }
});
