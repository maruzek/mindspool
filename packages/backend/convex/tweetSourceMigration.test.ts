import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { adjustStats, refreshItemState } from "./itemState";
import schema from "./schema";
import { modules } from "./test.setup";

it("previews without writes and migrates legacy singles without resurrecting deleted multi-link resources", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules);
    const a = t.withIdentity({ subject: "alice" });
    const { ownerId } = await a.query(api.identity.current, {});
    const seed = (
      text: string,
      captureKey: string,
      linksExtracted?: boolean,
      owner = ownerId,
    ) =>
      t.run(async (ctx) => {
        const id = await ctx.db.insert("items", {
          ownerId: owner,
          inputType: "url",
          originalInput: `https://x.com/a/status/${captureKey}`,
          originalUrl: `https://x.com/a/status/${captureKey}`,
          captureKey,
          captureSource: "extension",
          extractedText: text,
          linksExtracted,
          captureStatus: "captured",
          enrichmentStatus: "not_started",
          imageAssets: [],
          updatedAt: 0,
        });
        await adjustStats(ctx, owner, { total: 1 });
        await refreshItemState(ctx, id);
        return id;
      });
    const single = await seed("https://example.org/single", "1", true);
    const multi = await seed(
      "https://example.org/survivor https://example.org/deleted",
      "2",
      true,
    );
    const fresh = await seed("https://example.org/new", "3");
    const noLinks = await seed("no resources here", "4", true);
    const foreign = await seed(
      "https://example.org/foreign",
      "5",
      true,
      "other-owner",
    );
    const survivor = await t.run(async (ctx) => {
      const id = await ctx.db.insert("items", {
        ownerId,
        inputType: "url",
        originalInput: "https://example.org/survivor",
        originalUrl: "https://example.org/survivor",
        captureKey: `xlink:${multi}:0`,
        captureSource: "extension",
        captureStatus: "captured",
        enrichmentStatus: "not_started",
        imageAssets: [],
        updatedAt: 0,
      });
      await adjustStats(ctx, ownerId, { total: 1 });
      await refreshItemState(ctx, id);
      return id;
    });
    const batch = makeFunctionReference<"mutation">(
      "tweetSourceMigration:batch",
    );
    const run = async (preview: boolean) => {
      let phase = "keys";
      let cursor: string | null = null;
      let pages = 0;
      let converted = 0;
      do {
        const result: {
          phase: string;
          cursor: string | null;
          isDone: boolean;
          converted: number;
        } = await t.mutation(batch, {
          ownerId,
          version: 2,
          preview,
          phase,
          cursor,
        });
        pages++;
        converted += result.converted;
        if (result.isDone) return { pages, converted };
        phase = result.phase;
        cursor = result.cursor;
      } while (pages < 30);
      throw new Error("Migration did not advance");
    };
    const before = await t.run(async (ctx) => ({
      items: await ctx.db.query("items").collect(),
      stats: await ctx.db.query("ownerStats").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    await run(true);
    expect(
      await t.run(async (ctx) => ({
        items: await ctx.db.query("items").collect(),
        stats: await ctx.db.query("ownerStats").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      })),
    ).toEqual(before);
    expect((await run(false)).converted).toBe(3);
    const rows = await t.run((ctx) => ctx.db.query("items").collect());
    expect(
      rows.some((row) => row.originalInput === "https://example.org/deleted"),
    ).toBe(false);
    expect(rows.find((row) => row._id === survivor)?.fromItemId).toBe(multi);
    for (const id of [single, multi, fresh])
      expect(rows.find((row) => row._id === id)).toMatchObject({
        libraryRole: "tweet_source",
        tweetLinksVersion: 2,
      });
    expect(
      rows.find((row) => row._id === noLinks)?.libraryRole,
    ).toBeUndefined();
    expect(
      rows.find((row) => row._id === foreign)?.tweetLinksVersion,
    ).toBeUndefined();
    const stats = await a.query(api.items.stats, {});
    expect(stats.total).toBe(4);
    expect((await run(false)).converted).toBe(0);
    expect(await a.query(api.items.stats, {})).toEqual(stats);
    expect(
      (await t.run((ctx) => ctx.db.get(multi)))?.linkedItemStats?.revision,
    ).toBe(1);
  } finally {
    vi.useRealTimers();
  }
});
