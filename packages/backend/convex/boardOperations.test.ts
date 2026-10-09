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
  const reordered = Object.fromEntries(
    Object.entries(request).reverse(),
  ) as typeof request;
  expect(await a.mutation(api.boardOperations.apply, reordered)).toEqual(ack);
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
it("saves a completed geometry operation once and rejects stale or invalid batches", async () => {
  const { a, board, itemId } = await setup();
  await a.mutation(api.boardOperations.apply, {
    boardId: board._id,
    expectedRevision: 0,
    session: "one",
    sequence: 1,
    operations: [{ type: "place", key: "card", itemId, x: 0, y: 0 }],
  });
  const before = (
    await a.query(api.boards.elements, {
      boardId: board._id,
      paginationOpts: { numItems: 50, cursor: null },
    })
  ).page[0]!;
  const move = {
    boardId: board._id,
    expectedRevision: 1,
    session: "one",
    sequence: 2,
    operations: [
      {
        type: "set" as const,
        key: "card",
        data: { ...before.data, x: 40, y: 60 },
      },
    ],
  };
  expect((await a.mutation(api.boardOperations.apply, move)).revision).toBe(2);
  expect((await a.mutation(api.boardOperations.apply, move)).revision).toBe(2);
  await expect(
    a.mutation(api.boardOperations.apply, { ...move, session: "two" }),
  ).rejects.toThrow("changed");
  await expect(
    a.mutation(api.boardOperations.apply, {
      ...move,
      expectedRevision: 2,
      sequence: 3,
      operations: [
        { ...move.operations[0]!, data: { ...before.data, width: 0 } },
      ],
    }),
  ).rejects.toThrow("geometry");
  expect((await a.query(api.boards.get, { boardId: board._id })).revision).toBe(
    2,
  );
});
it("creates one whitespace-preserving URL-looking note atomically and retries without extra captures", async () => {
  const { a, board } = await setup();
  const request = {
    boardId: board._id,
    expectedRevision: 0,
    session: "note",
    sequence: 1,
    operations: [
      {
        type: "note" as const,
        key: "note",
        originalInput: "  https://example.com\n  ",
        x: 10,
        y: 20,
      },
    ],
  };
  const ack = await a.mutation(api.boardOperations.apply, request);
  expect(await a.mutation(api.boardOperations.apply, request)).toEqual(ack);
  const elements = (
    await a.query(api.boards.elements, {
      boardId: board._id,
      paginationOpts: { numItems: 50, cursor: null },
    })
  ).page;
  const data = elements[0]!.data;
  expect(data.type).toBe("item");
  if (data.type !== "item") throw new Error("Expected note placement");
  expect(await a.query(api.items.get, { id: data.itemId })).toMatchObject({
    inputType: "text",
    originalInput: request.operations[0]!.originalInput,
  });
  const before = (await a.query(api.items.stats, {})).total;
  await expect(
    a.mutation(api.boardOperations.apply, {
      ...request,
      expectedRevision: 1,
      sequence: 2,
      operations: [
        { ...request.operations[0]!, key: "bad", originalInput: "  " },
      ],
    }),
  ).rejects.toThrow();
  expect((await a.query(api.items.stats, {})).total).toBe(before);
});
it("creates ordered columns, rejects nesting and preserves displayed children on container deletion", async () => {
  const { a, board, itemId } = await setup();
  await a.mutation(api.boardOperations.apply, {
    boardId: board._id,
    expectedRevision: 0,
    session: "one",
    sequence: 1,
    operations: [{ type: "place", key: "card", itemId, x: 0, y: 0 }],
  });
  const card = (
    await a.query(api.boards.elements, {
      boardId: board._id,
      paginationOpts: { numItems: 50, cursor: null },
    })
  ).page[0]!;
  if (card.data.type !== "item") throw new Error("item");
  await a.mutation(api.boardOperations.apply, {
    boardId: board._id,
    expectedRevision: 1,
    session: "one",
    sequence: 2,
    operations: [
      {
        type: "set",
        key: "column",
        data: { type: "column", title: "Ideas", x: 100, y: 200, width: 400 },
      },
      {
        type: "set",
        key: "card",
        data: { ...card.data, columnKey: "column", order: 0, freeWidth: 300 },
      },
    ],
  });
  const attached = (
    await a.query(api.boards.elements, {
      boardId: board._id,
      paginationOpts: { numItems: 50, cursor: null },
    })
  ).page.find((e) => e.key === "card")!;
  expect(attached.data).toMatchObject({ x: 116, y: 248, width: 368 });
  await expect(
    a.mutation(api.boardOperations.apply, {
      boardId: board._id,
      expectedRevision: 2,
      session: "one",
      sequence: 3,
      operations: [
        {
          type: "set",
          key: "card",
          data: { ...card.data, columnKey: "foreign", order: 0 },
        },
      ],
    }),
  ).rejects.toThrow("column");
  await a.mutation(api.boardOperations.apply, {
    boardId: board._id,
    expectedRevision: 2,
    session: "one",
    sequence: 4,
    operations: [{ type: "remove", key: "column" }],
  });
  const freed = (
    await a.query(api.boards.elements, {
      boardId: board._id,
      paginationOpts: { numItems: 50, cursor: null },
    })
  ).page[0]!;
  expect(freed.data).toMatchObject({ x: 116, y: 248, width: 368 });
  expect(freed.data).not.toHaveProperty("columnKey");
});
it("history restores organization only while the original membership generation remains eligible", async () => {
  const { a, board, itemId, labelId } = await setup();
  await a.mutation(api.boardOperations.apply, {
    boardId: board._id,
    expectedRevision: 0,
    session: "one",
    sequence: 1,
    operations: [{ type: "place", key: "card", itemId, x: 10, y: 20 }],
  });
  const card = (
    await a.query(api.boards.elements, {
      boardId: board._id,
      paginationOpts: { numItems: 50, cursor: null },
    })
  ).page[0]!;
  await a.mutation(api.boardOperations.apply, {
    boardId: board._id,
    expectedRevision: 1,
    session: "one",
    sequence: 2,
    operations: [{ type: "remove", key: "card" }],
  });
  await a.mutation(api.boardOperations.apply, {
    boardId: board._id,
    expectedRevision: 2,
    session: "one",
    sequence: 3,
    operations: [{ type: "restore", key: "card", data: card.data }],
  });
  await a.mutation(api.itemLabels.remove, { itemId, labelId });
  await a.mutation(api.itemLabels.attach, { itemId, labelId });
  const latest = await a.query(api.boards.get, { boardId: board._id });
  await expect(
    a.mutation(api.boardOperations.apply, {
      boardId: board._id,
      expectedRevision: latest.revision,
      session: "one",
      sequence: 4,
      operations: [{ type: "restore", key: "card", data: card.data }],
    }),
  ).rejects.toThrow("Membership");
  expect(await a.query(api.items.get, { id: itemId })).toMatchObject({
    originalInput: "Hello",
  });
});
it("bounds incident edges across a whole atomic removal and rolls back", async () => {
  const { t, a, board } = await setup();
  await t.run(async (ctx) => {
    for (const key of ["a", "b"])
      await ctx.db.insert("boardElements", {
        ownerId: board.ownerId,
        boardId: board._id,
        key,
        data: { type: "heading", text: key, x: 0, y: 0, width: 300 },
      });
    for (let i = 0; i < 102; i++)
      await ctx.db.insert("boardConnections", {
        ownerId: board.ownerId,
        boardId: board._id,
        key: `e${i}`,
        source: i < 51 ? "a" : "b",
        target: `t${i}`,
        pairKey: `pair${i}`,
        arrows: "none",
        color: "ink",
        label: "",
      });
  });
  await expect(
    a.mutation(api.boardOperations.apply, {
      boardId: board._id,
      expectedRevision: 0,
      session: "budget",
      sequence: 1,
      operations: [
        { type: "remove", key: "a" },
        { type: "remove", key: "b" },
      ],
    }),
  ).rejects.toThrow("atomic bounds");
  await t.run(async (ctx) => {
    expect(await ctx.db.query("boardConnections").collect()).toHaveLength(102);
    expect(await ctx.db.query("boardElements").collect()).toHaveLength(2);
  });
});
it("keeps one item's layout independent across labels and refuses expired stale retries", async () => {
  const { t, a, board, itemId } = await setup();
  const labelId = await a.mutation(api.labels.create, { name: "Other" });
  const other = await a.mutation(api.boards.open, { labelId });
  const request = {
    boardId: board._id,
    expectedRevision: 0,
    session: "independent",
    sequence: 1,
    operations: [{ type: "place" as const, key: "one", itemId, x: 10, y: 20 }],
  };
  await a.mutation(api.boardOperations.apply, request);
  await a.mutation(api.boardOperations.apply, {
    ...request,
    boardId: other._id,
    operations: [{ ...request.operations[0]!, x: 800, y: 900 }],
  });
  expect(
    (
      await a.query(api.boards.elements, {
        boardId: board._id,
        paginationOpts: { numItems: 50, cursor: null },
      })
    ).page[0]!.data.x,
  ).toBe(10);
  expect(
    (
      await a.query(api.boards.elements, {
        boardId: other._id,
        paginationOpts: { numItems: 50, cursor: null },
      })
    ).page[0]!.data.x,
  ).toBe(800);
  await t.run(async (ctx) => {
    for (const receipt of await ctx.db.query("boardReceipts").collect())
      await ctx.db.patch(receipt._id, { expiresAt: Date.now() - 1 });
  });
  await expect(a.mutation(api.boardOperations.apply, request)).rejects.toThrow(
    "changed",
  );
});
