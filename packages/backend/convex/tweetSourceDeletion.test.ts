import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

it("releases an unsettled decision hold when a source is deleted before cleanup runs", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules);
    const a = t.withIdentity({ subject: "alice" });
    const itemId = await a.mutation(api.items.create, {
      inputType: "text",
      originalInput: "A saved legacy post awaiting a classification result",
      captureSource: "web",
      captureKey: "legacy",
    });
    await a.mutation(api.labels.create, { name: "Reading" });
    await a.mutation(api.decisions.classify, { itemId, model: "clef-flash" });
    expect(
      (await t.run((ctx) => ctx.db.query("aiUsage").first()))!.reserved,
    ).toBeGreaterThan(0);
    await t.mutation(internal.tweetSourceState.convert, { itemId });
    await a.mutation(api.items.remove, { id: itemId });
    expect(
      (await t.run((ctx) => ctx.db.query("aiUsage").first()))!.reserved,
    ).toBe(0);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (await t.run((ctx) => ctx.db.query("aiUsage").first()))!.reserved,
    ).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
