import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const paginationOpts = { numItems: 20, cursor: null };

async function fixture() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  const itemId = await alice.mutation(api.items.create, {
    originalInput: "A recipe",
    inputType: "text",
    captureSource: "web",
    captureKey: "one",
  });
  const labels = {
    recipes: await alice.mutation(api.labels.create, { name: "Recipes" }),
    quick: await alice.mutation(api.labels.create, { name: "Quick" }),
    news: await alice.mutation(api.labels.create, { name: "News" }),
  };
  const foreignLabelId = await bob.mutation(api.labels.create, { name: "X" });
  const startRun = (provider: "clef" | "clef-flash" = "clef-flash") =>
    t.mutation(internal.processingRuns.start, {
      itemId,
      kind: "decision",
      provider,
      model: provider,
      modality: "text",
      questionVersion: "label-noul-v1",
    });
  const labelsOf = async () =>
    (await alice.query(api.itemLabels.listForItem, { itemId, paginationOpts }))
      .page;
  return { t, alice, bob, itemId, labels, foreignLabelId, startRun, labelsOf };
}

describe("decisions.complete", () => {
  it("finishes the run and attaches labels with model attribution", async () => {
    const { t, alice, itemId, labels, startRun, labelsOf } = await fixture();
    const runId = await startRun();
    await t.mutation(internal.decisions.complete, {
      runId,
      itemId,
      suggestions: [
        { labelId: labels.recipes, confidence: 0.9 },
        { labelId: labels.quick, confidence: 0.55 },
      ],
      model: "@cf/cloudflare/clef-flash",
      labelsAsked: 3,
      labelsTotal: 3,
      latencyMs: 120,
      costUsd: 0.00001,
    });
    const attached = await labelsOf();
    expect(attached).toHaveLength(2);
    expect(attached.find((l) => l._id === labels.recipes)).toMatchObject({
      origin: "model",
      provider: "clef-flash",
      model: "@cf/cloudflare/clef-flash",
      confidence: 0.9,
    });
    const history = await alice.query(api.processingRuns.listForItem, {
      itemId,
      paginationOpts,
    });
    expect(history.page[0]).toMatchObject({
      status: "succeeded",
      labelsAsked: 3,
      labelsTotal: 3,
      latencyMs: 120,
      model: "@cf/cloudflare/clef-flash",
    });
    expect(history.page[0]?.suggestions).toHaveLength(2);
  });

  it("never modifies manual rows and never re-adds a removed label", async () => {
    const { t, alice, itemId, labels, startRun, labelsOf } = await fixture();
    await alice.mutation(api.itemLabels.attach, {
      itemId,
      labelId: labels.recipes,
    });
    await alice.mutation(api.itemLabels.remove, {
      itemId,
      labelId: labels.quick,
    });
    const suggestions = [
      { labelId: labels.recipes, confidence: 0.99 },
      { labelId: labels.quick, confidence: 0.99 },
      { labelId: labels.news, confidence: 0.7 },
    ];
    await t.mutation(internal.decisions.complete, {
      runId: await startRun(),
      itemId,
      suggestions,
    });
    // Re-run: no duplicates.
    await t.mutation(internal.decisions.complete, {
      runId: await startRun(),
      itemId,
      suggestions,
    });
    const attached = await labelsOf();
    expect(attached.map((l) => l._id).sort()).toEqual(
      [labels.recipes, labels.news].sort(),
    );
    const manual = attached.find((l) => l._id === labels.recipes);
    expect(manual?.origin).toBeUndefined();
    expect(manual?.confidence).toBeUndefined();
    const rows = await t.run((ctx) => ctx.db.query("itemLabels").collect());
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.labelId === labels.quick)).toMatchObject({
      manualDecision: "exclude",
    });
  });

  it("fails as a whole: invalid input leaves run pending and no labels", async () => {
    const { t, itemId, labels, foreignLabelId, startRun, labelsOf } =
      await fixture();
    const runId = await startRun();
    const attempt = (suggestions: { labelId: never; confidence: number }[]) =>
      t.mutation(internal.decisions.complete, { runId, itemId, suggestions });
    await expect(
      attempt([
        { labelId: labels.recipes, confidence: 0.9 },
        { labelId: labels.quick, confidence: 0.4 },
      ] as never),
    ).rejects.toThrow("Invalid result");
    await expect(
      attempt([{ labelId: foreignLabelId, confidence: 0.9 }] as never),
    ).rejects.toThrow("Not found");
    await expect(
      attempt([{ labelId: labels.recipes, confidence: 1.5 }] as never),
    ).rejects.toThrow("Invalid result");
    expect(await labelsOf()).toEqual([]);
    const run = await t.run((ctx) => ctx.db.get(runId));
    expect(run?.status).toBe("pending");
  });

  it("only completes decision runs of a Clef provider, once", async () => {
    const { t, itemId, labels, startRun } = await fixture();
    const enrichment = await t.mutation(internal.processingRuns.start, {
      itemId,
      kind: "enrichment",
      modality: "text",
      questionVersion: "v1",
    });
    await expect(
      t.mutation(internal.decisions.complete, {
        runId: enrichment,
        itemId,
        suggestions: [],
      }),
    ).rejects.toThrow("Invalid result");
    const runId = await startRun();
    const args = {
      runId,
      itemId,
      suggestions: [{ labelId: labels.recipes, confidence: 0.8 }],
    };
    await t.mutation(internal.decisions.complete, args);
    await expect(t.mutation(internal.decisions.complete, args)).rejects.toThrow(
      "already finished",
    );
  });
});
