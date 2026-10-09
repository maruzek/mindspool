import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("owned label boards", () => {
  it("opens lazily once, never places existing items and rejects foreign/anonymous access", async () => {
    const t = convexTest(schema, modules);
    const a = t.withIdentity({ subject: "alice" });
    const labelId = await a.mutation(api.labels.create, { name: "Design" });
    const board = await a.mutation(api.boards.open, { labelId });
    expect(await a.mutation(api.boards.open, { labelId })).toEqual(board);
    const page = await a.query(api.boards.elements, {
      boardId: board._id,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(page).toMatchObject({ page: [], isDone: true, revision: 0 });
    await expect(t.mutation(api.boards.open, { labelId })).rejects.toThrow(
      "Authentication required",
    );
    await expect(
      t.withIdentity({ subject: "bob" }).mutation(api.boards.open, { labelId }),
    ).rejects.toThrow("Not found");
  });
  it("returns bounded revisioned pages and validates viewport geometry", async () => {
    const a = convexTest(schema, modules).withIdentity({ subject: "alice" });
    const labelId = await a.mutation(api.labels.create, { name: "Design" });
    const board = await a.mutation(api.boards.open, { labelId });
    await a.run(async (ctx) => {
      for (let i = 0; i < 55; i++)
        await ctx.db.insert("boardElements", {
          ownerId: board.ownerId,
          boardId: board._id,
          key: `h${i}`,
          data: { type: "heading", x: i, y: 0, width: 300, text: "Hello" },
        });
    });
    const first = await a.query(api.boards.elements, {
      boardId: board._id,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(first.page).toHaveLength(50);
    expect(first.isDone).toBe(false);
    const next = await a.query(api.boards.elements, {
      boardId: board._id,
      paginationOpts: { numItems: 50, cursor: first.continueCursor },
    });
    expect(next.page).toHaveLength(5);
    expect(next.revision).toBe(first.revision);
    await expect(
      a.mutation(api.boards.setViewport, {
        boardId: board._id,
        viewport: { x: Infinity, y: 0, zoom: 1 },
      }),
    ).rejects.toThrow("geometry");
    await a.mutation(api.boards.setViewport, {
      boardId: board._id,
      viewport: { x: 20, y: 30, zoom: 0.5 },
    });
    expect(await a.query(api.boards.get, { boardId: board._id })).toMatchObject(
      { revision: 0, viewport: { x: 20, y: 30, zoom: 0.5 } },
    );
  });
});
