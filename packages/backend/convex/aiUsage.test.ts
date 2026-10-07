import { convexTest } from "convex-test";
import type { TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { release, reserve, settle } from "./aiUsage";
import schema from "./schema";
import { modules } from "./test.setup";

const DAY = "2026-10-07";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  vi.stubEnv("AI_DAILY_NEURON_LIMIT", "100");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const rowOf = (t: TestConvex<typeof schema>, ownerId: string, day = DAY) =>
  t.run((ctx) =>
    ctx.db
      .query("aiUsage")
      .withIndex("by_owner_day", (q) => q.eq("ownerId", ownerId).eq("day", day))
      .unique(),
  );

describe("reserve / settle / release", () => {
  it("creates today's row on first reserve and adds to reserved", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => reserve(ctx, "a", 30));
    expect(await rowOf(t, "a")).toMatchObject({ neurons: 0, reserved: 30 });
  });

  it("throws LIMIT_REACHED over the limit and changes nothing", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => reserve(ctx, "a", 60));
    await expect(t.run((ctx) => reserve(ctx, "a", 50))).rejects.toThrow(
      /LIMIT_REACHED/,
    );
    expect(await rowOf(t, "a")).toMatchObject({ reserved: 60 });
    await t.run((ctx) => reserve(ctx, "a", 40)); // exactly at the limit is allowed
  });

  it("settle replaces the estimate with the actual figure", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => reserve(ctx, "a", 30));
    await t.run((ctx) => settle(ctx, "a", DAY, 30, 5, 600));
    expect(await rowOf(t, "a")).toMatchObject({
      neurons: 5,
      reserved: 0,
      inputTokens: 600,
      runs: 1,
    });
  });

  it("release removes the estimate", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => reserve(ctx, "a", 30));
    await t.run((ctx) => release(ctx, "a", DAY, 30));
    expect(await rowOf(t, "a")).toMatchObject({
      neurons: 0,
      reserved: 0,
      runs: 0,
    });
  });

  it("starts a fresh row on a new UTC day", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => reserve(ctx, "a", 90));
    vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
    await t.run((ctx) => reserve(ctx, "a", 90));
    expect(await rowOf(t, "a", "2026-10-08")).toMatchObject({ reserved: 90 });
    expect(await rowOf(t, "a")).toMatchObject({ reserved: 90 });
  });

  it("keeps owners independent", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => reserve(ctx, "a", 100));
    await t.run((ctx) => reserve(ctx, "b", 100));
    await expect(t.run((ctx) => reserve(ctx, "a", 1))).rejects.toThrow();
  });

  it("rejects negative and NaN amounts", async () => {
    const t = convexTest(schema, modules);
    for (const bad of [-1, NaN, Infinity])
      await expect(t.run((ctx) => reserve(ctx, "a", bad))).rejects.toThrow(
        /INVALID_INPUT/,
      );
    await expect(
      t.run((ctx) => settle(ctx, "a", DAY, 1, NaN, 1)),
    ).rejects.toThrow(/INVALID_INPUT/);
    await expect(t.run((ctx) => release(ctx, "a", DAY, -1))).rejects.toThrow(
      /INVALID_INPUT/,
    );
  });
});

describe("aiUsage.today", () => {
  it("is zero of the limit for a new owner", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    expect(await alice.query(api.aiUsage.today, { day: DAY })).toEqual({
      used: 0,
      limit: 100,
      fraction: 0,
      resetsAt: Date.UTC(2026, 9, 8),
      tokens: 0,
      runs: 0,
    });
  });

  it("reflects reserve and settle", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    const { tokenIdentifier } = await alice.run(
      async (ctx) => (await ctx.auth.getUserIdentity())!,
    );
    await t.run((ctx) => reserve(ctx, tokenIdentifier, 20));
    expect(await alice.query(api.aiUsage.today, { day: DAY })).toMatchObject({
      used: 20,
      fraction: 0.2,
    });
    await t.run((ctx) => settle(ctx, tokenIdentifier, DAY, 20, 5, 600));
    expect(await alice.query(api.aiUsage.today, { day: DAY })).toMatchObject({
      used: 5,
      tokens: 600,
      runs: 1,
    });
  });

  it("rejects a malformed or impossible day", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    for (const day of ["", "today", "2026-13-01", "2026-02-30", "2026-1-1"])
      await expect(alice.query(api.aiUsage.today, { day })).rejects.toThrow(
        /INVALID_INPUT/,
      );
  });

  it("shows another day's own row and its own reset time", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    expect(
      await alice.query(api.aiUsage.today, { day: "2026-12-31" }),
    ).toMatchObject({ used: 0, resetsAt: Date.UTC(2027, 0, 1) });
  });

  it("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.aiUsage.today, { day: DAY })).rejects.toThrow();
  });
});

describe("aiUsage.backfillToday", () => {
  it("adds today's costed runs once", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    const itemId = await alice.mutation(api.items.create, {
      originalInput: "note",
      inputType: "text",
      captureSource: "web",
      captureKey: "k",
    });
    const ownerId = (await t.run((ctx) => ctx.db.get(itemId)))!.ownerId;
    // Four recorded clef-flash runs of ~650 tokens (0.0000585 USD each).
    for (let i = 0; i < 4; i++)
      await t.run((ctx) =>
        ctx.db.insert("processingRuns", {
          ownerId,
          itemId,
          kind: "decision",
          status: "succeeded",
          provider: "clef-flash",
          modality: "text",
          questionVersion: "label-noul-v1",
          suggestions: [],
          costUsd: 0.0000585,
        }),
      );
    const first = await t.mutation(internal.aiUsage.backfillToday, { ownerId });
    expect(first.runs).toBe(4);
    expect(first.added).toBeCloseTo(21.3, 0);
    expect(await rowOf(t, ownerId)).toMatchObject({
      runs: 4,
      backfilled: true,
    });
    const again = await t.mutation(internal.aiUsage.backfillToday, { ownerId });
    expect(again).toEqual({ added: 0, runs: 0 });
    expect((await rowOf(t, ownerId))!.runs).toBe(4);
  });
});
