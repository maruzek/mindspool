import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import type { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
it("sorts by item creation, retains empty continuation pages and scopes search", async () => {
  const a = convexTest(schema, modules).withIdentity({ subject: "alice" });
  const labelId = await a.mutation(api.labels.create, { name: "Design" });
  const board = await a.mutation(api.boards.open, { labelId });
  const ids: Id<"items">[] = [];
  for (let i = 0; i < 4; i++)
    ids.push(
      await a.mutation(api.items.create, {
        inputType: "text",
        originalInput: `Architecture ${i}`,
        captureKey: `${i}`,
        captureSource: "web",
      }),
    );
  await a.mutation(api.itemLabels.attach, { itemId: ids[1]!, labelId });
  await a.mutation(api.itemLabels.attach, { itemId: ids[0]!, labelId });
  const args = {
    boardId: board._id,
    scope: "label" as const,
    sort: "newest" as const,
    paginationOpts: { numItems: 2, cursor: null },
  };
  const empty = await a.query(api.boardTray.browse, args);
  expect(empty.page).toHaveLength(0);
  expect(empty.isDone).toBe(false);
  const next = await a.query(api.boardTray.browse, {
    ...args,
    paginationOpts: { numItems: 2, cursor: empty.continueCursor },
  });
  expect(next.page.map((p) => p.itemId)).toEqual([ids[1], ids[0]]);
  expect(
    (await a.query(api.boardTray.browse, { ...args, sort: "oldest" })).page.map(
      (p) => p.itemId,
    ),
  ).toEqual([ids[0], ids[1]]);
  expect(
    (
      await a.query(api.boardTray.browse, {
        ...args,
        scope: "all",
        labelId,
        query: "Architecture",
      })
    ).page.map((p) => p.itemId),
  ).toEqual(expect.arrayContaining([ids[0], ids[1]]));
});

it("excludes hidden roles from trays, existing cards, previews, and new placement", async () => {
  const a = convexTest(schema, modules).withIdentity({ subject: "alice" });
  const labelId = await a.mutation(api.labels.create, { name: "Resources" });
  const board = await a.mutation(api.boards.open, { labelId });
  const ids: Id<"items">[] = [];
  for (let i = 0; i < 3; i++) {
    const itemId = await a.mutation(api.items.create, {
      inputType: "text",
      originalInput: `resource ${i}`,
      captureKey: `role-${i}`,
      captureSource: "web",
    });
    ids.push(itemId);
    await a.mutation(api.boardOperations.apply, {
      boardId: board._id,
      expectedRevision: i,
      session: "roles",
      sequence: i + 1,
      operations: [
        { type: "place", key: `card-${i}`, itemId, x: i * 400, y: 0 },
      ],
    });
  }
  await a.run(async (ctx) => {
    await ctx.db.patch(ids[1]!, { libraryRole: "tweet_source" });
    await ctx.db.patch(ids[2]!, { libraryRole: "tweet_pending" });
  });
  for (const scope of ["all", "label"] as const)
    for (const sort of ["oldest", "newest"] as const)
      for (const query of [undefined, "resource"]) {
        const page = await a.query(api.boardTray.browse, {
          boardId: board._id,
          scope,
          sort,
          query,
          paginationOpts: { numItems: 20, cursor: null },
        });
        expect(page.page.map((row) => row.itemId)).toEqual([ids[0]]);
      }
  expect(
    (
      await a.query(api.boards.elements, {
        boardId: board._id,
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).page,
  ).toHaveLength(1);
  expect(
    await a.query(api.boardPreviews.placed, {
      boardId: board._id,
      keys: ["card-1", "card-2"],
    }),
  ).toEqual([]);
  await expect(
    a.mutation(api.boardOperations.apply, {
      boardId: board._id,
      expectedRevision: 3,
      session: "roles",
      sequence: 4,
      operations: [{ type: "place", key: "new", itemId: ids[1]!, x: 0, y: 0 }],
    }),
  ).rejects.toThrow();
});
