import { convexTest } from "convex-test";
import type { TestConvex } from "convex-test";
import type { Id } from "./_generated/dataModel";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const capture = {
  inputType: "url" as const,
  originalInput: "https://example.com/recipe?keep=1",
  captureSource: "web" as const,
  captureKey: "capture-1",
};

describe("owned Item capture", () => {
  it("returns bounded list previews while preserving full original content in detail", async () => {
    const alice = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    const originalInput = "A".repeat(100000);
    const id = await alice.mutation(api.items.create, {
      ...capture,
      inputType: "text",
      originalInput,
    });
    const page = await alice.query(api.items.list, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(page.page[0]!.originalInput).toBe(originalInput.slice(0, 160));
    expect(page.page[0]).not.toHaveProperty("imageAssets");
    expect((await alice.query(api.items.get, { id })).originalInput).toBe(
      originalInput,
    );
  });
  it("includes the original URL in previews of link Items", async () => {
    const alice = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    await alice.mutation(api.items.create, capture);
    const page = await alice.query(api.items.list, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page[0]).toMatchObject({
      originalUrl: capture.originalInput,
      labels: [],
      labelCount: 0,
    });
  });
  it("paginates only the owner's newest Items", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    const ids = [];
    for (let i = 0; i < 3; i++)
      ids.push(
        await alice.mutation(api.items.create, {
          ...capture,
          captureKey: `page-${i}`,
        }),
      );
    await t
      .withIdentity({ subject: "bob" })
      .mutation(api.items.create, capture);
    const first = await alice.query(api.items.list, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(first.page.map((item) => item._id)).toEqual([ids[2], ids[1]]);
    const next = await alice.query(api.items.list, {
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect(next.page.map((item) => item._id)).toEqual([ids[0]]);
    expect(next.isDone).toBe(true);
    await expect(
      t.query(api.items.list, {
        paginationOpts: { numItems: 2, cursor: null },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      alice.query(api.items.list, {
        paginationOpts: { numItems: 101, cursor: null },
      }),
    ).rejects.toThrow("Page size");
  });
  it("preserves original input before enrichment", async () => {
    const asUser = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    const id = await asUser.mutation(api.items.create, capture);
    expect(await asUser.query(api.items.get, { id })).toMatchObject({
      originalInput: capture.originalInput,
      originalUrl: capture.originalInput,
      captureSource: "web",
      captureStatus: "captured",
      enrichmentStatus: "not_started",
      imageAssets: [],
    });
  });

  it("preserves whitespace in saved text", async () => {
    const asUser = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    const id = await asUser.mutation(api.items.create, {
      ...capture,
      inputType: "text",
      originalInput: "  Useful idea\n",
    });
    const item = await asUser.query(api.items.get, { id });
    expect(item.originalInput).toBe("  Useful idea\n");
    expect(item.originalUrl).toBeUndefined();
  });

  it("rejects anonymous capture and detail access", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.items.create, capture)).rejects.toThrow(
      "Authentication required",
    );
    const id = await t
      .withIdentity({ subject: "alice" })
      .mutation(api.items.create, capture);
    await expect(t.query(api.items.get, { id })).rejects.toThrow(
      "Authentication required",
    );
  });

  it("hides foreign and nonexistent ids behind the same error", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    const id = await alice.mutation(api.items.create, capture);
    await expect(
      t.withIdentity({ subject: "bob" }).query(api.items.get, { id }),
    ).rejects.toThrow("Not found");
    await t.run(async (ctx) => {
      await ctx.db.delete(id);
    });
    await expect(alice.query(api.items.get, { id })).rejects.toThrow(
      "Not found",
    );
  });

  it("replays the same capture while refusing key reuse with different input", async () => {
    const asUser = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    const id = await asUser.mutation(api.items.create, capture);
    expect(await asUser.mutation(api.items.create, capture)).toBe(id);
    await expect(
      asUser.mutation(api.items.create, {
        ...capture,
        originalInput: "https://example.com/other",
      }),
    ).rejects.toThrow("Capture key already used");
    expect(
      await asUser.mutation(api.items.create, {
        ...capture,
        captureKey: "capture-2",
      }),
    ).not.toBe(id);
  });

  it("scopes capture keys to the owner", async () => {
    const t = convexTest(schema, modules);
    const first = await t
      .withIdentity({ subject: "alice" })
      .mutation(api.items.create, capture);
    const second = await t
      .withIdentity({ subject: "bob" })
      .mutation(api.items.create, capture);
    expect(first).not.toBe(second);
  });

  it.each([
    "javascript:alert(1)",
    "file:///tmp/private",
    "not a URL",
    "https://user:password@example.com/",
  ])("rejects an unsafe URL: %s", async (originalInput) => {
    const asUser = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    await expect(
      asUser.mutation(api.items.create, { ...capture, originalInput }),
    ).rejects.toThrow("Invalid URL");
  });

  it("rejects blank or oversized input without writing", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "alice" });
    for (const originalInput of ["   ", "a".repeat(100001)]) {
      await expect(
        asUser.mutation(api.items.create, {
          ...capture,
          inputType: "text",
          originalInput,
        }),
      ).rejects.toThrow("Invalid input");
    }
    await expect(
      asUser.mutation(api.items.create, {
        ...capture,
        originalInput: "https://example.com/" + "a".repeat(8192),
      }),
    ).rejects.toThrow("Invalid input");
    expect(await t.run((ctx) => ctx.db.query("items").take(1))).toEqual([]);
  });

  it("rejects an owner supplied by the client", async () => {
    const asUser = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    await expect(
      asUser.mutation(api.items.create, {
        ...capture,
        ownerId: "bob",
      } as typeof capture),
    ).rejects.toThrow();
  });
});

describe("items.detail", () => {
  it("returns exactly the inspector fields", async () => {
    const alice = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    const id = await alice.mutation(api.items.create, capture);
    const detail = await alice.query(api.items.detail, { id });
    expect(Object.keys(detail!).sort()).toEqual(
      [
        "_creationTime",
        "_id",
        "captureSource",
        "enrichmentStatus",
        "inputType",
        "originalInput",
        "originalUrl",
      ].sort(),
    );
    expect(detail).toMatchObject({
      _id: id,
      originalInput: capture.originalInput,
    });
  });
  it("returns extracted text and image assets when present", async () => {
    const alice = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    const imageAssets = [
      {
        kind: "external" as const,
        url: "https://pbs.twimg.com/media/a.jpg",
        purpose: "image" as const,
      },
    ];
    const id = await alice.mutation(api.items.create, {
      ...capture,
      extractedText: "tweet text",
      imageAssets,
    });
    expect(await alice.query(api.items.detail, { id })).toMatchObject({
      extractedText: "tweet text",
      imageAssets,
    });
  });
  it("omits extracted text and image assets when there are none", async () => {
    const alice = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    const id = await alice.mutation(api.items.create, capture);
    const detail = await alice.query(api.items.detail, { id });
    expect(detail).not.toHaveProperty("extractedText");
    expect(detail).not.toHaveProperty("imageAssets");
  });
  it("returns null for foreign, missing and malformed ids", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    const bob = t.withIdentity({ subject: "bob" });
    const id = await alice.mutation(api.items.create, capture);
    expect(await bob.query(api.items.detail, { id })).toBeNull();
    expect(await alice.query(api.items.detail, { id: "nope" })).toBeNull();
    const labelId = await alice.mutation(api.labels.create, { name: "x" });
    expect(await alice.query(api.items.detail, { id: labelId })).toBeNull();
    await t.run((ctx) => ctx.db.delete(id));
    expect(await alice.query(api.items.detail, { id })).toBeNull();
  });
  it("requires authentication", async () => {
    await expect(
      convexTest(schema, modules).query(api.items.detail, { id: "x" }),
    ).rejects.toThrow("Authentication required");
  });
});

describe("items.remove", () => {
  async function setup() {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    const bob = t.withIdentity({ subject: "bob" });
    const id = await alice.mutation(api.items.create, capture);
    const otherId = await alice.mutation(api.items.create, {
      ...capture,
      captureKey: "capture-2",
    });
    const labelId = await alice.mutation(api.labels.create, { name: "L" });
    const { ownerId } = await alice.query(api.identity.current, {});
    return { t, alice, bob, id, otherId, labelId, ownerId };
  }
  const run = (ownerId: string, itemId: any) => ({
    ownerId,
    itemId,
    kind: "decision" as const,
    status: "succeeded" as const,
    modality: "text" as const,
    questionVersion: "v1",
    suggestions: [],
  });

  it("deletes the item, its links, runs and stored assets only", async () => {
    const { t, alice, id, otherId, labelId, ownerId } = await setup();
    await alice.mutation(api.itemLabels.attach, { itemId: id, labelId });
    await alice.mutation(api.itemLabels.attach, { itemId: otherId, labelId });
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["img"])),
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(id, {
        imageAssets: [{ kind: "stored", storageId, purpose: "image" }],
      });
      await ctx.db.insert("processingRuns", run(ownerId, id));
      await ctx.db.insert("processingRuns", run(ownerId, otherId));
    });
    await alice.mutation(api.items.remove, { id });
    const left = await t.run(async (ctx) => ({
      item: await ctx.db.get(id),
      other: await ctx.db.get(otherId),
      links: await ctx.db.query("itemLabels").collect(),
      runs: await ctx.db.query("processingRuns").collect(),
      blob: await ctx.storage.getUrl(storageId),
      labels: await ctx.db.query("labels").collect(),
    }));
    expect(left.item).toBeNull();
    expect(left.other).not.toBeNull();
    expect(left.links.map((l) => l.itemId)).toEqual([otherId]);
    expect(left.runs.map((r) => r.itemId)).toEqual([otherId]);
    expect(left.blob).toBeNull();
    expect(left.labels).toHaveLength(1);
  });
  it("disappears from items.list and label lists", async () => {
    const { alice, id, labelId } = await setup();
    await alice.mutation(api.itemLabels.attach, { itemId: id, labelId });
    await alice.mutation(api.items.remove, { id });
    const opts = { numItems: 10, cursor: null };
    expect(
      (await alice.query(api.items.list, { paginationOpts: opts })).page.map(
        (i) => i._id,
      ),
    ).not.toContain(id);
    expect(
      (
        await alice.query(api.itemLabels.listItemsForLabel, {
          labelId,
          paginationOpts: opts,
        })
      ).page,
    ).toEqual([]);
  });
  it("rejects foreign, missing and unauthenticated calls", async () => {
    const { t, bob, alice, id } = await setup();
    await expect(bob.mutation(api.items.remove, { id })).rejects.toThrow(
      "Not found",
    );
    await alice.mutation(api.items.remove, { id });
    await expect(alice.mutation(api.items.remove, { id })).rejects.toThrow(
      "Not found",
    );
    await expect(t.mutation(api.items.remove, { id })).rejects.toThrow(
      "Authentication required",
    );
  });
  it("deletes an item with more history than one batch, purging the rest in the background", async () => {
    vi.useFakeTimers();
    const { t, alice, id, ownerId } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 250; i++)
        await ctx.db.insert("processingRuns", run(ownerId, id));
      for (let i = 0; i < 250; i++) {
        const l = await ctx.db.insert("labels", {
          ownerId,
          name: `n${i}`,
          normalizedName: `n${i}`,
        });
        await ctx.db.insert("itemLabels", {
          ownerId,
          itemId: id,
          labelId: l,
          manualDecision: "include",
          updatedAt: 0,
        });
      }
    });
    await alice.mutation(api.items.remove, { id });
    expect(await t.run((ctx) => ctx.db.get(id))).toBeNull();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.query("itemLabels").collect())).toEqual(
      [],
    );
    expect(
      await t.run((ctx) => ctx.db.query("processingRuns").collect()),
    ).toEqual([]);
    vi.useRealTimers();
  });
});

describe("labeling state in previews", () => {
  it("flags a pending decision run and unsure model labels, then clears them", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    const recipes = await alice.mutation(api.labels.create, {
      name: "Recipes",
    });
    const quick = await alice.mutation(api.labels.create, { name: "Quick" });
    const itemId = await alice.mutation(api.items.create, {
      ...capture,
      inputType: "text",
      originalInput: "a recipe",
    });
    const list = async () =>
      (
        await alice.query(api.items.list, {
          paginationOpts: { numItems: 20, cursor: null },
        })
      ).page[0]!;
    // Capture started the automatic decision run.
    expect(await list()).toMatchObject({ labeling: true });
    const [run] = await t.run((ctx) =>
      ctx.db.query("processingRuns").collect(),
    );
    await t.mutation(internal.decisions.complete, {
      runId: run!._id,
      itemId,
      suggestions: [
        { labelId: recipes, confidence: 0.9 },
        { labelId: quick, confidence: 0.55 },
      ],
    });
    const done = await list();
    expect(done.labeling).toBeUndefined();
    expect(done.unsureCount).toBe(1);
    expect(done.labels.find((l) => l._id === quick)?.unsure).toBe(true);
    expect(done.labels.find((l) => l._id === recipes)?.unsure).toBeUndefined();
    await alice.mutation(api.itemLabels.confirm, { itemId, labelId: quick });
    const kept = await list();
    expect(kept.unsureCount).toBeUndefined();
    expect(kept.labels.every((l) => l.unsure === undefined)).toBe(true);
  });
});

describe("denormalized search state", () => {
  // Owner ids are token identifiers ("<issuer>|<subject>"), so match on the subject.
  const stats = async (t: TestConvex<typeof schema>, subject: string) =>
    (await t.run((ctx) => ctx.db.query("ownerStats").collect())).find((row) =>
      row.ownerId.endsWith(`|${subject}`),
    ) ?? null;
  const row = (t: TestConvex<typeof schema>, id: Id<"items">) =>
    t.run((ctx) => ctx.db.get(id));

  it("sets source, search text and inbox on a new item and counts it", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    const id = await alice.mutation(api.items.create, {
      ...capture,
      originalInput: "https://www.youtube.com/watch?v=1",
    });
    expect(await row(t, id)).toMatchObject({
      sourceKind: "youtube",
      searchText: "https://www.youtube.com/watch?v=1",
      inbox: true,
    });
    expect(await stats(t, "alice")).toMatchObject({
      total: 1,
      inbox: 1,
      needsReview: 0,
    });
  });
  it("classifies a note as a note", async () => {
    const t = convexTest(schema, modules);
    const id = await t
      .withIdentity({ subject: "alice" })
      .mutation(api.items.create, {
        ...capture,
        inputType: "text",
        originalInput: "buy milk",
      });
    expect(await row(t, id)).toMatchObject({
      sourceKind: "note",
      searchText: "buy milk",
    });
  });
  it("does not count a replayed capture twice", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    await alice.mutation(api.items.create, capture);
    await alice.mutation(api.items.create, capture);
    expect(await stats(t, "alice")).toMatchObject({ total: 1, inbox: 1 });
  });
  it("restores the counts when the item is deleted", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    await alice.mutation(api.items.create, { ...capture, captureKey: "keep" });
    const id = await alice.mutation(api.items.create, capture);
    expect(await stats(t, "alice")).toMatchObject({ total: 2, inbox: 2 });
    await alice.mutation(api.items.remove, { id });
    expect(await stats(t, "alice")).toMatchObject({ total: 1, inbox: 1 });
  });
  it("never touches another owner's stats", async () => {
    const t = convexTest(schema, modules);
    await t
      .withIdentity({ subject: "alice" })
      .mutation(api.items.create, capture);
    await t
      .withIdentity({ subject: "bob" })
      .mutation(api.items.create, { ...capture, captureKey: "b" });
    expect(await stats(t, "alice")).toMatchObject({ total: 1 });
    expect(await stats(t, "bob")).toMatchObject({ total: 1 });
  });
});

describe("items.create with extracted content", () => {
  const tweet = {
    ...capture,
    originalInput: "https://x.com/jane/status/123",
    captureSource: "extension" as const,
    captureKey: "x:123",
    sourceMetadata: {
      title: "Jane (@jane)",
      author: "Jane",
      siteName: "X",
    },
    extractedText: "Fresh sourdough starter, day three",
    imageAssets: [
      {
        kind: "external" as const,
        url: "https://pbs.twimg.com/media/a.jpg?name=large",
        purpose: "image" as const,
      },
    ],
  };
  const setup = () => {
    const t = convexTest(schema, modules);
    return { t, alice: t.withIdentity({ subject: "alice" }) };
  };

  it("stores the fields, classifies the source as x and makes the text searchable", async () => {
    const { alice } = setup();
    const id = await alice.mutation(api.items.create, tweet);
    const item = await alice.query(api.items.get, { id });
    expect(item).toMatchObject({
      sourceKind: "x",
      sourceMetadata: tweet.sourceMetadata,
      extractedText: tweet.extractedText,
      imageAssets: tweet.imageAssets,
    });
    const found = await alice.query(api.items.search, {
      query: "sourdough",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(found.page.map((i) => i._id)).toEqual([id]);
  });
  it("starts a labeling run on the stored item when the owner has labels", async () => {
    const { t, alice } = setup();
    await alice.mutation(api.labels.create, { name: "Baking" });
    await alice.mutation(api.items.create, tweet);
    const runs = await t.run((ctx) => ctx.db.query("processingRuns").collect());
    expect(runs).toHaveLength(1);
  });
  it("returns the stored item unchanged for a repeated key", async () => {
    const { alice } = setup();
    const id = await alice.mutation(api.items.create, tweet);
    const again = await alice.mutation(api.items.create, {
      ...tweet,
      extractedText: "edited later",
    });
    expect(again).toBe(id);
    expect((await alice.query(api.items.get, { id })).extractedText).toBe(
      tweet.extractedText,
    );
  });
  it("keeps the item private to its owner", async () => {
    const { t, alice } = setup();
    const id = await alice.mutation(api.items.create, tweet);
    await expect(
      t.withIdentity({ subject: "bob" }).query(api.items.get, { id }),
    ).rejects.toThrow();
  });
  it.each([
    ["long title", { sourceMetadata: { title: "t".repeat(301) } }],
    ["long author", { sourceMetadata: { author: "a".repeat(301) } }],
    ["long description", { sourceMetadata: { description: "d".repeat(1001) } }],
    ["long siteName", { sourceMetadata: { siteName: "s".repeat(301) } }],
    ["long text", { extractedText: "x".repeat(100001) }],
    [
      "too many images",
      {
        imageAssets: Array.from({ length: 11 }, (_, i) => ({
          kind: "external" as const,
          url: `https://pbs.twimg.com/media/${i}.jpg`,
          purpose: "image" as const,
        })),
      },
    ],
    [
      "http image",
      {
        imageAssets: [
          {
            kind: "external" as const,
            url: "http://a.test/a.jpg",
            purpose: "image" as const,
          },
        ],
      },
    ],
    [
      "long image url",
      {
        imageAssets: [
          {
            kind: "external" as const,
            url: `https://a.test/${"a".repeat(2048)}`,
            purpose: "image" as const,
          },
        ],
      },
    ],
  ])("rejects %s without writing", async (_name, bad) => {
    const { t, alice } = setup();
    await expect(
      alice.mutation(api.items.create, { ...tweet, ...bad }),
    ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
    expect(await t.run((ctx) => ctx.db.query("items").collect())).toEqual([]);
  });
  it("rejects stored assets from a client", async () => {
    const { t, alice } = setup();
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
    await expect(
      alice.mutation(api.items.create, {
        ...tweet,
        imageAssets: [{ kind: "stored", storageId, purpose: "image" }],
      }),
    ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
  });
  it("leaves plain captures as before", async () => {
    const { alice } = setup();
    const id = await alice.mutation(api.items.create, capture);
    const item = await alice.query(api.items.get, { id });
    expect(item.imageAssets).toEqual([]);
    expect(item).not.toHaveProperty("extractedText");
    expect(item).not.toHaveProperty("sourceMetadata");
  });
});
