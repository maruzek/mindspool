import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { GenericDatabaseWriter, SystemDataModel } from "convex/server";
import schema from "./schema";
import { modules } from "./test.setup";

describe("owned label boards", () => {
  it("keeps same-URL visual captures separate and requires manual aspect-derived image placement", async () => {
    const t = convexTest(schema, modules);
    const a = t.withIdentity({ subject: "alice" });
    const labelId = await a.mutation(api.labels.create, {
      name: "Design references",
    });
    const board = await a.mutation(api.boards.open, { labelId });
    const ids = [];
    for (let index = 0; index < 2; index++) {
      const context = {
        captureKey: `visual:${crypto.randomUUID()}`,
        kind: "full-page" as const,
        pageUrl: "https://design.example/#pricing",
        capturedAt: Date.now(),
      };
      const { captureId } = await a.mutation(api.visualCaptures.begin, {
        context,
      });
      const digest = "a".repeat(64);
      const attempt = await a.mutation(
        internal.visualCaptureState.claimUpload,
        { captureId, digest },
      );
      const type = `image/webp; mindspool-attempt=${attempt.nonce}`;
      const storageId = await t.run((ctx) =>
        ctx.storage.store(new Blob(["pixels"], { type })),
      );
      await t.run((ctx) =>
        (ctx.db as unknown as GenericDatabaseWriter<SystemDataModel>).patch(
          storageId,
          { contentType: type },
        ),
      );
      await a.mutation(internal.visualCaptureState.registerStaged, {
        captureId,
        attemptId: attempt.attemptId,
        storageId,
      });
      await a.mutation(internal.visualCaptureState.recordVerified, {
        captureId,
        attemptId: attempt.attemptId,
        digest,
        width: 1000,
        height: 2100,
        bytes: 6,
        contentType: "image/webp",
      });
      ids.push(
        (await a.mutation(api.visualCaptures.finalize, { captureId })).itemId,
      );
    }
    expect(ids[0]).not.toBe(ids[1]);
    expect(
      (
        await a.query(api.boards.elements, {
          boardId: board._id,
          paginationOpts: { numItems: 20, cursor: null },
        })
      ).page,
    ).toEqual([]);
    await a.mutation(api.boardOperations.apply, {
      boardId: board._id,
      expectedRevision: 0,
      session: "visual",
      sequence: 1,
      operations: ids.map((itemId, index) => ({
        type: "place" as const,
        key: `visual-${index}`,
        itemId,
        x: index * 330,
        y: 0,
      })),
    });
    const placed = await a.query(api.boards.elements, {
      boardId: board._id,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(placed.page).toHaveLength(2);
    for (const element of placed.page)
      expect(element.data).toMatchObject({
        mode: "image",
        imageHeight: 630,
        width: 300,
      });
  });
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
