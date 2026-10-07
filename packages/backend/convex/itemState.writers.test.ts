import { convexTest } from "convex-test";
import type { TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

type T = TestConvex<typeof schema>;

async function fixture(labelNames = ["Recipes", "Quick", "News"]) {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const itemId = await alice.mutation(api.items.create, {
    originalInput: "https://www.youtube.com/watch?v=1",
    inputType: "url",
    captureSource: "web",
    captureKey: "one",
  });
  const labels: Id<"labels">[] = [];
  for (const name of labelNames)
    labels.push(await alice.mutation(api.labels.create, { name }));
  return { t, alice, itemId, labels };
}
const item = (t: T, id: Id<"items">) => t.run((ctx) => ctx.db.get(id));
const links = (t: T, itemId: Id<"items">) =>
  t.run((ctx) =>
    ctx.db
      .query("itemLabels")
      .filter((q) => q.eq(q.field("itemId"), itemId))
      .collect(),
  );
// Owner ids are token identifiers ("<issuer>|<subject>").
const stats = async (t: T) =>
  (await t.run((ctx) => ctx.db.query("ownerStats").collect())).find((r) =>
    r.ownerId.endsWith("|alice"),
  );
const run = (t: T, itemId: Id<"items">, kind: "decision" | "enrichment") =>
  t.mutation(internal.processingRuns.start, {
    itemId,
    kind,
    provider: kind === "decision" ? "clef-flash" : undefined,
    model: kind === "decision" ? "clef-flash" : undefined,
    modality: "text",
    questionVersion: "v1",
  });
const complete = (
  t: T,
  runId: Id<"processingRuns">,
  itemId: Id<"items">,
  suggestions: { labelId: Id<"labels">; confidence: number }[],
) =>
  t.mutation(internal.decisions.complete, {
    runId,
    itemId,
    suggestions,
    model: "clef-flash",
  });

describe("label writers keep item state current", () => {
  it("attaching the first label leaves the inbox and removing the last returns", async () => {
    const { t, alice, itemId, labels } = await fixture();
    expect((await item(t, itemId))?.inbox).toBe(true);
    await alice.mutation(api.itemLabels.attach, {
      itemId,
      labelId: labels[0]!,
    });
    expect((await item(t, itemId))?.inbox).toBe(false);
    expect(await stats(t)).toMatchObject({ total: 1, inbox: 0 });
    await alice.mutation(api.itemLabels.remove, {
      itemId,
      labelId: labels[0]!,
    });
    expect((await item(t, itemId))?.inbox).toBe(true);
    expect(await stats(t)).toMatchObject({ inbox: 1 });
  });
  it("copies source and search text onto a manual link and clears unsure", async () => {
    const { t, alice, itemId, labels } = await fixture();
    await alice.mutation(api.itemLabels.attach, {
      itemId,
      labelId: labels[0]!,
    });
    const [link] = await links(t, itemId);
    expect(link).toMatchObject({
      sourceKind: "youtube",
      searchText: "https://www.youtube.com/watch?v=1",
      unsure: false,
    });
  });
  it("re-including a removed label refreshes the link fields", async () => {
    const { t, alice, itemId, labels } = await fixture();
    await alice.mutation(api.itemLabels.attach, {
      itemId,
      labelId: labels[0]!,
    });
    await alice.mutation(api.itemLabels.remove, {
      itemId,
      labelId: labels[0]!,
    });
    expect((await links(t, itemId))[0]?.unsure).toBeFalsy();
    await alice.mutation(api.itemLabels.attach, {
      itemId,
      labelId: labels[0]!,
    });
    expect((await links(t, itemId))[0]).toMatchObject({
      manualDecision: "include",
      unsure: false,
      sourceKind: "youtube",
    });
  });
  it("confirming the only unsure label clears needs review everywhere", async () => {
    const { t, alice, itemId, labels } = await fixture();
    const runId = await run(t, itemId, "decision");
    await complete(t, runId, itemId, [
      { labelId: labels[0]!, confidence: 0.6 },
    ]);
    expect(await item(t, itemId)).toMatchObject({
      needsReview: true,
      inbox: true,
    });
    expect(await stats(t)).toMatchObject({ inbox: 1, needsReview: 1 });
    await alice.mutation(api.itemLabels.confirm, {
      itemId,
      labelId: labels[0]!,
    });
    expect((await links(t, itemId))[0]?.unsure).toBe(false);
    expect(await item(t, itemId)).toMatchObject({
      needsReview: false,
      inbox: false,
    });
    expect(await stats(t)).toMatchObject({ inbox: 0, needsReview: 0 });
  });
  it("removing the only unsure label clears needs review", async () => {
    const { t, alice, itemId, labels } = await fixture();
    const runId = await run(t, itemId, "decision");
    await complete(t, runId, itemId, [
      { labelId: labels[0]!, confidence: 0.6 },
    ]);
    await alice.mutation(api.itemLabels.remove, {
      itemId,
      labelId: labels[0]!,
    });
    expect((await item(t, itemId))?.needsReview).toBe(false);
  });
  it("sees an unsure link beyond the fourth", async () => {
    const { t, alice, itemId, labels } = await fixture([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
    ]);
    for (const labelId of labels.slice(0, 5))
      await alice.mutation(api.itemLabels.attach, { itemId, labelId });
    const runId = await run(t, itemId, "decision");
    await complete(t, runId, itemId, [
      { labelId: labels[5]!, confidence: 0.55 },
    ]);
    expect((await item(t, itemId))?.needsReview).toBe(true);
  });
});

describe("decision writers keep item state current", () => {
  it("marks a 60% label unsure and a 90% label confident", async () => {
    const { t, itemId, labels } = await fixture();
    const runId = await run(t, itemId, "decision");
    await complete(t, runId, itemId, [
      { labelId: labels[0]!, confidence: 0.6 },
      { labelId: labels[1]!, confidence: 0.9 },
    ]);
    const byLabel = new Map(
      (await links(t, itemId)).map((l) => [l.labelId, l]),
    );
    expect(byLabel.get(labels[0]!)).toMatchObject({
      unsure: true,
      sourceKind: "youtube",
    });
    expect(byLabel.get(labels[1]!)?.unsure).toBe(false);
    expect((await item(t, itemId))?.needsReview).toBe(true);
  });
  it("a confident label alone settles the item", async () => {
    const { t, itemId, labels } = await fixture();
    const runId = await run(t, itemId, "decision");
    await complete(t, runId, itemId, [
      { labelId: labels[0]!, confidence: 0.9 },
    ]);
    expect(await item(t, itemId)).toMatchObject({
      inbox: false,
      needsReview: false,
    });
  });
  it("a pending decision run keeps a labeled item in the inbox until it finishes", async () => {
    const { t, alice, itemId, labels } = await fixture();
    await alice.mutation(api.itemLabels.attach, {
      itemId,
      labelId: labels[0]!,
    });
    expect((await item(t, itemId))?.inbox).toBe(false);
    const runId = await run(t, itemId, "decision");
    expect((await item(t, itemId))?.inbox).toBe(true);
    await complete(t, runId, itemId, []);
    expect((await item(t, itemId))?.inbox).toBe(false);
  });
  it("a failed decision run releases the item", async () => {
    const { t, alice, itemId, labels } = await fixture();
    await alice.mutation(api.itemLabels.attach, {
      itemId,
      labelId: labels[0]!,
    });
    const runId = await run(t, itemId, "decision");
    await t.mutation(internal.processingRuns.finish, {
      runId,
      itemId,
      result: { status: "failed", error: "boom" },
    });
    expect((await item(t, itemId))?.inbox).toBe(false);
  });
  it("classify puts a labeled item back in the inbox while labeling runs", async () => {
    const { t, alice, itemId, labels } = await fixture();
    await alice.mutation(api.itemLabels.attach, {
      itemId,
      labelId: labels[0]!,
    });
    await alice.mutation(api.decisions.classify, {
      itemId,
      model: "clef-flash",
    });
    expect((await item(t, itemId))?.inbox).toBe(true);
  });
});

describe("enrichment writers keep item state current", () => {
  const enrich = async (
    t: T,
    itemId: Id<"items">,
    enrichment: Record<string, unknown>,
  ) => {
    const runId = await run(t, itemId, "enrichment");
    await t.mutation(internal.processingRuns.finish, {
      runId,
      itemId,
      result: { status: "succeeded", suggestions: [], enrichment },
    });
  };
  it("pending enrichment is in the inbox even when labeled", async () => {
    const { t, alice, itemId, labels } = await fixture();
    await alice.mutation(api.itemLabels.attach, {
      itemId,
      labelId: labels[0]!,
    });
    await run(t, itemId, "enrichment");
    expect((await item(t, itemId))?.inbox).toBe(true);
  });
  it("a failed enrichment is not stuck pending", async () => {
    const { t, alice, itemId, labels } = await fixture();
    await alice.mutation(api.itemLabels.attach, {
      itemId,
      labelId: labels[0]!,
    });
    const runId = await run(t, itemId, "enrichment");
    await t.mutation(internal.processingRuns.finish, {
      runId,
      itemId,
      result: { status: "failed", error: "unreachable" },
    });
    expect((await item(t, itemId))?.inbox).toBe(false);
  });
  it("finished enrichment makes the item and its links searchable by the title", async () => {
    const { t, alice, itemId, labels } = await fixture();
    await alice.mutation(api.itemLabels.attach, {
      itemId,
      labelId: labels[0]!,
    });
    await enrich(t, itemId, {
      sourceMetadata: { title: "Spicy ramen", siteName: "Noodles" },
      extractedText: "Boil the broth",
    });
    const row = await item(t, itemId);
    expect(row?.searchText?.startsWith("Spicy ramen")).toBe(true);
    expect(row?.searchText).toContain("Boil the broth");
    const [link] = await links(t, itemId);
    expect(link?.searchText?.startsWith("Spicy ramen Noodles")).toBe(true);
    expect(link?.searchText).not.toContain("Boil the broth");
  });
  it("fans a text change out to 250 links, never more than 100 per transaction", async () => {
    const { t, itemId } = await fixture([]);
    const owner = (await item(t, itemId))!.ownerId;
    await t.run(async (ctx) => {
      for (let i = 0; i < 250; i++) {
        const labelId = await ctx.db.insert("labels", {
          ownerId: owner,
          name: `L${i}`,
          normalizedName: `l${i}`,
        });
        await ctx.db.insert("itemLabels", {
          ownerId: owner,
          itemId,
          labelId,
          manualDecision: "include",
          updatedAt: 0,
          sourceKind: "web",
          searchText: "stale",
        });
      }
    });
    await enrich(t, itemId, { sourceMetadata: { title: "Fresh title" } });
    const fresh = async () =>
      (await links(t, itemId)).filter((l) =>
        l.searchText?.startsWith("Fresh title"),
      ).length;
    expect(await fresh()).toBeLessThanOrEqual(100);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await fresh()).toBe(250);
    expect(
      (await links(t, itemId)).every((l) => l.sourceKind === "youtube"),
    ).toBe(true);
  });
});
