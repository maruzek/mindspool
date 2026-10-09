import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
it("sorts by item creation, retains empty continuation pages and scopes search", async () => {
  const a = convexTest(schema, modules).withIdentity({ subject: "alice" });
  const labelId = await a.mutation(api.labels.create, { name: "Design" });
  const board = await a.mutation(api.boards.open, { labelId });
  const ids = [];
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
