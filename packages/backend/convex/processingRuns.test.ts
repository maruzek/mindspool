import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import type { enrichment as enrichmentValidator } from "./validators";
import { modules } from "./test.setup";

async function fixture() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  const itemId = await alice.mutation(api.items.create, {
    originalInput: "Original recipe",
    inputType: "text",
    captureSource: "web",
    captureKey: "original",
  });
  const labelId = await alice.mutation(api.labels.create, { name: "Recipes" });
  const otherLabelId = await alice.mutation(api.labels.create, {
    name: "Quick",
  });
  const foreignLabelId = await bob.mutation(api.labels.create, {
    name: "Private",
  });
  return { t, alice, bob, itemId, labelId, otherLabelId, foreignLabelId };
}
const attempt = {
  kind: "decision" as const,
  provider: "clef" as const,
  model: "clef",
  modality: "text" as const,
  questionVersion: "labels-v1",
  rubricVersion: "sorting-v1",
};
const paginationOpts = { numItems: 20, cursor: null };

describe("processing history and manual decisions", () => {
  it("bounds history joins even when a reactive page range grows", async () => {
    const { t, alice, itemId } = await fixture();
    const identity = await alice.query(api.identity.current, {});
    for (let i = 0; i < 12; i++)
      await t.mutation(internal.processingRuns.start, { ...attempt, itemId });
    const range = await t.run((ctx) =>
      ctx.db
        .query("processingRuns")
        .withIndex("by_owner_item", (q) =>
          q.eq("ownerId", identity.ownerId).eq("itemId", itemId),
        )
        .order("desc")
        .paginate({ numItems: 100, cursor: null }),
    );
    const first = await alice.query(api.processingRuns.listForItem, {
      itemId,
      paginationOpts: {
        numItems: 1,
        cursor: null,
        endCursor: range.continueCursor,
        maximumRowsRead: 1000,
      },
    });
    expect(first.page.length).toBeLessThanOrEqual(10);
    const next = await alice.query(api.processingRuns.listForItem, {
      itemId,
      paginationOpts: { numItems: 100, cursor: first.continueCursor },
    });
    expect(
      new Set([...first.page, ...next.page].map((run) => run._id)).size,
    ).toBe(12);
  });
  it("records a versioned attempt without fabricated measurements", async () => {
    const { t, alice, itemId, labelId } = await fixture();
    const runId = await t.mutation(internal.processingRuns.start, {
      ...attempt,
      itemId,
    });
    await t.mutation(internal.processingRuns.finish, {
      runId,
      itemId,
      result: {
        status: "succeeded",
        suggestions: [{ labelId, confidence: 0.9 }],
      },
    });
    const history = await alice.query(api.processingRuns.listForItem, {
      itemId,
      paginationOpts,
    });
    expect(history.page).toMatchObject([
      {
        status: "succeeded",
        provider: "clef",
        questionVersion: "labels-v1",
        suggestedLabels: [{ name: "Recipes" }],
      },
    ]);
    expect(history.page[0]?.latencyMs).toBeUndefined();
    expect(history.page[0]?.costUsd).toBeUndefined();
    expect(
      (
        await alice.query(api.itemLabels.listForItem, {
          itemId,
          paginationOpts,
        })
      ).page,
    ).toEqual([]);
  });

  it("preserves manual inclusions and exclusions across successive suggestions", async () => {
    const { t, alice, itemId, labelId, otherLabelId } = await fixture();
    await alice.mutation(api.itemLabels.attach, { itemId, labelId });
    await alice.mutation(api.itemLabels.remove, {
      itemId,
      labelId: otherLabelId,
    });
    for (let i = 0; i < 2; i++) {
      const runId = await t.mutation(internal.processingRuns.start, {
        ...attempt,
        itemId,
      });
      await t.mutation(internal.processingRuns.finish, {
        runId,
        itemId,
        result: {
          status: "succeeded",
          suggestions: [{ labelId: otherLabelId }],
        },
      });
    }
    expect(
      (
        await alice.query(api.itemLabels.listForItem, {
          itemId,
          paginationOpts,
        })
      ).page.map((label) => label._id),
    ).toEqual([labelId]);
    const decisions = await t.run((ctx) => ctx.db.query("itemLabels").take(10));
    expect(
      decisions.find((link) => link.labelId === otherLabelId)?.manualDecision,
    ).toBe("exclude");
  });

  it("keeps the original save after a failed enrichment and rejects terminal rewrites", async () => {
    const { t, alice, itemId } = await fixture();
    const runId = await t.mutation(internal.processingRuns.start, {
      itemId,
      kind: "enrichment",
      modality: "text",
      questionVersion: "capture-v1",
    });
    await t.mutation(internal.processingRuns.finish, {
      runId,
      itemId,
      result: { status: "failed", error: "Extraction unavailable" },
    });
    expect(await alice.query(api.items.get, { id: itemId })).toMatchObject({
      originalInput: "Original recipe",
      enrichmentStatus: "failed",
    });
    await expect(
      t.mutation(internal.processingRuns.finish, {
        runId,
        itemId,
        result: { status: "succeeded", suggestions: [] },
      }),
    ).rejects.toThrow("Run already finished");
  });

  it("does not let an older enrichment overwrite a newer attempt", async () => {
    const { t, alice, itemId } = await fixture();
    const args = {
      itemId,
      kind: "enrichment" as const,
      modality: "text" as const,
      questionVersion: "capture-v1",
    };
    const older = await t.mutation(internal.processingRuns.start, args);
    const newer = await t.mutation(internal.processingRuns.start, args);
    await t.mutation(internal.processingRuns.finish, {
      runId: newer,
      itemId,
      result: {
        status: "succeeded",
        suggestions: [],
        enrichment: { extractedText: "Extracted recipe" },
      },
    });
    await t.mutation(internal.processingRuns.finish, {
      runId: older,
      itemId,
      result: { status: "failed", error: "Old timeout" },
    });
    expect(await alice.query(api.items.get, { id: itemId })).toMatchObject({
      enrichmentStatus: "succeeded",
      extractedText: "Extracted recipe",
      originalInput: "Original recipe",
    });
  });

  it("refuses foreign suggestions, mixed Item/Run ids, and unauthorized history", async () => {
    const { t, alice, bob, itemId, foreignLabelId } = await fixture();
    const runId = await t.mutation(internal.processingRuns.start, {
      ...attempt,
      itemId,
    });
    await expect(
      t.mutation(internal.processingRuns.finish, {
        runId,
        itemId,
        result: {
          status: "succeeded",
          suggestions: [{ labelId: foreignLabelId }],
        },
      }),
    ).rejects.toThrow("Not found");
    await expect(
      bob.mutation(internal.processingRuns.finish, {
        runId,
        itemId,
        result: { status: "succeeded", suggestions: [] },
      }),
    ).rejects.toThrow("Not found");
    const otherItem = await alice.mutation(api.items.create, {
      originalInput: "Other",
      inputType: "text",
      captureSource: "web",
      captureKey: "other",
    });
    await expect(
      t.mutation(internal.processingRuns.finish, {
        runId,
        itemId: otherItem,
        result: { status: "succeeded", suggestions: [] },
      }),
    ).rejects.toThrow("Not found");
    await expect(
      t.query(api.processingRuns.listForItem, { itemId, paginationOpts }),
    ).rejects.toThrow("Authentication required");
    await expect(
      bob.query(api.processingRuns.listForItem, { itemId, paginationOpts }),
    ).resolves.toMatchObject({ page: [], isDone: true });
    expect(
      (
        await alice.query(api.processingRuns.listForItem, {
          itemId,
          paginationOpts,
        })
      ).page[0]?.status,
    ).toBe("pending");
  });

  it("rejects unbounded or invalid result values", async () => {
    const { t, itemId, labelId } = await fixture();
    const runId = await t.mutation(internal.processingRuns.start, {
      ...attempt,
      itemId,
    });
    await expect(
      t.mutation(internal.processingRuns.finish, {
        runId,
        itemId,
        result: {
          status: "succeeded",
          suggestions: [{ labelId, confidence: 2 }],
        },
      }),
    ).rejects.toThrow("Invalid result");
    await expect(
      t.mutation(internal.processingRuns.finish, {
        runId,
        itemId,
        result: { status: "succeeded", suggestions: [], costUsd: -1 },
      }),
    ).rejects.toThrow("Invalid result");
    await expect(
      t.mutation(internal.processingRuns.finish, {
        runId,
        itemId,
        result: {
          status: "succeeded",
          suggestions: Array.from({ length: 101 }, () => ({ labelId })),
        },
      }),
    ).rejects.toThrow("Invalid result");
  });
});

describe("enrichment merge", () => {
  const start = (
    t: Awaited<ReturnType<typeof fixture>>["t"],
    itemId: Id<"items">,
  ) =>
    t.mutation(internal.processingRuns.start, {
      itemId,
      kind: "enrichment",
      modality: "text",
      questionVersion: "og-v1",
    });
  const enrich = async (
    t: Awaited<ReturnType<typeof fixture>>["t"],
    itemId: Id<"items">,
    enrichment: Infer<typeof enrichmentValidator>,
  ) => {
    const runId = await start(t, itemId);
    await t.mutation(internal.processingRuns.finish, {
      runId,
      itemId,
      result: {
        status: "succeeded",
        suggestions: [],
        enrichment,
      },
    });
  };
  const thumb = (url: string) => ({
    kind: "external" as const,
    url,
    purpose: "thumbnail" as const,
  });

  it("keeps a clip's own data and adds at most one thumbnail", async () => {
    const { t, alice } = await fixture();
    const itemId = await alice.mutation(api.items.create, {
      originalInput: "https://x.com/a/status/1",
      inputType: "url",
      captureSource: "extension",
      captureKey: "tweet",
      sourceMetadata: { title: "Tweet", author: "@a" },
      imageAssets: [
        {
          kind: "external",
          url: "https://pbs.twimg.com/1.jpg",
          purpose: "image",
        },
        {
          kind: "external",
          url: "https://pbs.twimg.com/2.jpg",
          purpose: "image",
        },
      ],
    });
    await enrich(t, itemId, {
      canonicalUrl: "https://x.com/a/status/1",
      sourceMetadata: { title: "Page title", author: "Other", siteName: "X" },
      imageAssets: [thumb("https://x.com/og.png")],
    });
    const item = await alice.query(api.items.get, { id: itemId });
    expect(item).toMatchObject({
      enrichmentStatus: "succeeded",
      canonicalUrl: "https://x.com/a/status/1",
      sourceMetadata: { title: "Tweet", author: "@a", siteName: "X" },
    });
    expect(item?.imageAssets.map((a) => a.purpose)).toEqual([
      "image",
      "image",
      "thumbnail",
    ]);
  });

  it("fills a bare link and leaves one thumbnail after enriching twice", async () => {
    const { t, alice } = await fixture();
    const itemId = await alice.mutation(api.items.create, {
      originalInput: "https://example.com/soup",
      inputType: "url",
      captureSource: "web",
      captureKey: "bare",
    });
    await enrich(t, itemId, {
      sourceMetadata: {
        title: "Soup",
        description: "Hot",
        siteName: "Kitchen",
      },
      imageAssets: [thumb("https://example.com/a.png")],
    });
    await enrich(t, itemId, {
      sourceMetadata: { title: "Soup 2" },
      imageAssets: [thumb("https://example.com/b.png")],
    });
    const item = await alice.query(api.items.get, { id: itemId });
    expect(item?.sourceMetadata).toEqual({
      title: "Soup",
      description: "Hot",
      siteName: "Kitchen",
    });
    expect(item?.imageAssets).toEqual([thumb("https://example.com/b.png")]);
    const found = await alice.query(api.items.search, {
      query: "Soup",
      paginationOpts,
    });
    expect(found.page.map((i) => i._id)).toContain(itemId);
  });
});

it("refuses generic processing starts for hidden snapshots", async () => {
  const t = convexTest(schema, modules);
  const a = t.withIdentity({ subject: "alice" });
  const itemId = await a.mutation(api.items.create, {
    inputType: "text",
    originalInput: "snapshot",
    captureSource: "web",
    captureKey: "hidden",
  });
  await t.run((ctx) => ctx.db.patch(itemId, { libraryRole: "tweet_pending" }));
  for (const kind of ["decision", "enrichment"] as const)
    await expect(
      t.mutation(internal.processingRuns.start, {
        itemId,
        kind,
        modality: "text",
        questionVersion: "v1",
      }),
    ).rejects.toThrow("Not found");
});
