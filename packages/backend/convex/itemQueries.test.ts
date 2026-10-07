import { convexTest } from "convex-test";
import type { TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

type T = TestConvex<typeof schema>;
const opts = (numItems = 50, cursor: string | null = null) => ({
  numItems,
  cursor,
});

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  let n = 0;
  const save = (
    who: typeof alice,
    originalInput: string,
    inputType: "url" | "text" = "text",
  ) =>
    who.mutation(api.items.create, {
      originalInput,
      inputType,
      captureSource: "web",
      captureKey: `k${n++}`,
    });
  const label = (who: typeof alice, name: string) =>
    who.mutation(api.labels.create, { name });
  /** A model label at the given confidence (below 0.65 is unsure). */
  const modelLabel = async (
    itemId: Id<"items">,
    labelId: Id<"labels">,
    confidence: number,
  ) => {
    const runId = await t.mutation(internal.processingRuns.start, {
      itemId,
      kind: "decision",
      provider: "clef-flash",
      model: "clef-flash",
      modality: "text",
      questionVersion: "v1",
    });
    await t.mutation(internal.decisions.complete, {
      runId,
      itemId,
      suggestions: [{ labelId, confidence }],
      model: "clef-flash",
    });
  };
  return { t, alice, bob, save, label, modelLabel };
}
const ids = (page: { page: { _id: Id<"items"> }[] }) =>
  page.page.map((i) => i._id);

describe("items.list filters", () => {
  it("returns today's result with no filters", async () => {
    const { alice, save } = await setup();
    const a = await save(alice, "one");
    const b = await save(alice, "https://x.com/a", "url");
    const page = await alice.query(api.items.list, {
      paginationOpts: opts(),
    });
    expect(ids(page)).toEqual([b, a]);
  });
  it("filters by source, newest first, only the owner's", async () => {
    const { alice, bob, save } = await setup();
    const x1 = await save(alice, "https://x.com/1", "url");
    await save(alice, "https://example.com/2", "url");
    const note = await save(alice, "a note");
    const x2 = await save(alice, "https://twitter.com/3", "url");
    await save(bob, "https://x.com/bob", "url");
    expect(
      ids(
        await alice.query(api.items.list, {
          paginationOpts: opts(),
          source: "x",
        }),
      ),
    ).toEqual([x2, x1]);
    expect(
      ids(
        await alice.query(api.items.list, {
          paginationOpts: opts(),
          source: "note",
        }),
      ),
    ).toEqual([note]);
  });
  it("filters needs review and inbox, alone and with a source", async () => {
    const { alice, save, label, modelLabel } = await setup();
    // Items are saved before any label exists, so no automatic labeling run is pending.
    const settled = await save(alice, "https://x.com/settled", "url");
    const reviewX = await save(alice, "https://x.com/review", "url");
    const reviewNote = await save(alice, "review note");
    const unlabeled = await save(alice, "https://x.com/unlabeled", "url");
    const l = await label(alice, "Recipes");
    await alice.mutation(api.itemLabels.attach, {
      itemId: settled,
      labelId: l,
    });
    await modelLabel(reviewX, l, 0.6);
    await modelLabel(reviewNote, l, 0.55);
    const list = (extra: object) =>
      alice.query(api.items.list, { paginationOpts: opts(), ...extra });
    expect(ids(await list({ needsReview: true }))).toEqual([
      reviewNote,
      reviewX,
    ]);
    expect(ids(await list({ needsReview: true, source: "x" }))).toEqual([
      reviewX,
    ]);
    expect(ids(await list({ inbox: true }))).toEqual([
      unlabeled,
      reviewNote,
      reviewX,
    ]);
    expect(ids(await list({ inbox: true, source: "x" }))).toEqual([
      unlabeled,
      reviewX,
    ]);
    expect(ids(await list({ inbox: true, needsReview: true }))).toEqual([
      reviewNote,
      reviewX,
    ]);
    // false means "no filter", never "only items that are not in the inbox".
    expect(ids(await list({ inbox: false, needsReview: false }))).toHaveLength(
      4,
    );
    expect(ids(await list({}))).toContain(settled);
  });
  it("pages ten at a time without duplicates", async () => {
    const { alice, save } = await setup();
    for (let i = 0; i < 13; i++) await save(alice, `https://x.com/${i}`, "url");
    const first = await alice.query(api.items.list, {
      paginationOpts: opts(50),
      source: "x",
    });
    expect(first.page).toHaveLength(10);
    const next = await alice.query(api.items.list, {
      paginationOpts: opts(50, first.continueCursor),
      source: "x",
    });
    expect(next.page).toHaveLength(3);
    expect(new Set([...ids(first), ...ids(next)]).size).toBe(13);
  });
  it("requires authentication", async () => {
    const { t } = await setup();
    await expect(
      t.query(api.items.list, { paginationOpts: opts(), inbox: true }),
    ).rejects.toThrow("Authentication required");
  });
});

describe("items.stats", () => {
  const stats = (who: ReturnType<T["withIdentity"]>) =>
    who.query(api.items.stats, {});
  it("is zero before anything is saved", async () => {
    const { alice } = await setup();
    expect(await stats(alice)).toEqual({ total: 0, inbox: 0, needsReview: 0 });
  });
  it("counts items, inbox and needs review, per owner", async () => {
    const { alice, bob, save, label, modelLabel } = await setup();
    const a = await save(alice, "one");
    const b = await save(alice, "two");
    await save(bob, "bobs");
    const l = await label(alice, "Recipes");
    await modelLabel(a, l, 0.6);
    await alice.mutation(api.itemLabels.attach, { itemId: b, labelId: l });
    expect(await stats(alice)).toEqual({ total: 2, inbox: 1, needsReview: 1 });
    expect(await stats(bob)).toEqual({ total: 1, inbox: 1, needsReview: 0 });
  });
  it("requires authentication", async () => {
    const { t } = await setup();
    await expect(t.query(api.items.stats, {})).rejects.toThrow(
      "Authentication required",
    );
  });
});

describe("items.search", () => {
  const search = (
    who: ReturnType<T["withIdentity"]>,
    query: string,
    extra: object = {},
    paginationOpts = opts(),
  ) => who.query(api.items.search, { query, paginationOpts, ...extra });

  it("finds items by note text, title and extracted text", async () => {
    const { t, alice, save } = await setup();
    const note = await save(alice, "spicy ramen recipe");
    const link = await save(alice, "https://example.com/a", "url");
    await save(alice, "something else");
    const runId = await t.mutation(internal.processingRuns.start, {
      itemId: link,
      kind: "enrichment",
      modality: "text",
      questionVersion: "v1",
    });
    await t.mutation(internal.processingRuns.finish, {
      runId,
      itemId: link,
      result: {
        status: "succeeded",
        suggestions: [],
        enrichment: {
          sourceMetadata: { title: "Weeknight dumplings" },
          extractedText: "fold the wrappers",
        },
      },
    });
    expect(ids(await search(alice, "ramen"))).toEqual([note]);
    expect(ids(await search(alice, "dumplings"))).toEqual([link]);
    expect(ids(await search(alice, "wrappers"))).toEqual([link]);
  });
  it("never returns another owner's items", async () => {
    const { alice, bob, save } = await setup();
    await save(bob, "secret ramen");
    expect((await search(alice, "ramen")).page).toEqual([]);
    expect((await search(bob, "ramen")).page).toHaveLength(1);
  });
  it("combines with source, needs review and inbox filters", async () => {
    const { alice, save, label, modelLabel } = await setup();
    // Saved before any label exists so no automatic labeling run is pending.
    // convex-test splits words on whitespace only, so every row shares the word "ramen".
    const xUrl = await save(alice, "https://x.com/a", "url");
    await save(alice, "https://example.com/b", "url");
    const noteRamen = await save(alice, "ramen note");
    const settled = await save(alice, "ramen settled");
    const l = await label(alice, "Recipes");
    await modelLabel(noteRamen, l, 0.6);
    await alice.mutation(api.itemLabels.attach, {
      itemId: settled,
      labelId: l,
    });
    // A URL is one "word" in convex-test, matched here by its scheme.
    expect(ids(await search(alice, "https", { source: "x" }))).toEqual([xUrl]);
    expect(ids(await search(alice, "ramen", { source: "note" }))).toHaveLength(
      2,
    );
    expect(ids(await search(alice, "ramen", { needsReview: true }))).toEqual([
      noteRamen,
    ]);
    const inbox = ids(await search(alice, "ramen", { inbox: true }));
    expect(inbox).toEqual([noteRamen]);
    expect(await search(alice, "ramen")).toMatchObject({
      page: expect.arrayContaining([expect.objectContaining({ _id: settled })]),
    });
  });
  it("rejects blank, over-long and over-wordy queries", async () => {
    const { alice } = await setup();
    await expect(search(alice, "   ")).rejects.toThrow("Search");
    await expect(search(alice, "a".repeat(201))).rejects.toThrow("Search");
    await expect(
      search(alice, Array.from({ length: 17 }, (_, i) => `w${i}`).join(" ")),
    ).rejects.toThrow("Search");
    await expect(
      search(alice, Array.from({ length: 16 }, (_, i) => `w${i}`).join(" ")),
    ).resolves.toBeDefined();
  });
  it("pages ten at a time and requires authentication", async () => {
    const { t, alice, save } = await setup();
    for (let i = 0; i < 12; i++) await save(alice, `ramen ${i}`);
    const first = await search(alice, "ramen", {}, opts(50));
    expect(first.page).toHaveLength(10);
    const next = await search(
      alice,
      "ramen",
      {},
      opts(50, first.continueCursor),
    );
    expect(next.page).toHaveLength(2);
    await expect(
      t.query(api.items.search, { query: "ramen", paginationOpts: opts() }),
    ).rejects.toThrow("Authentication required");
  });
  it("returns the same bounded previews as the library", async () => {
    const { alice, save, label } = await setup();
    const l = await label(alice, "Recipes");
    const id = await save(alice, "ramen");
    await alice.mutation(api.itemLabels.attach, { itemId: id, labelId: l });
    const [item] = (await search(alice, "ramen")).page;
    expect(item).toMatchObject({
      _id: id,
      labels: [{ name: "Recipes" }],
      labelCount: 1,
    });
    expect(item).not.toHaveProperty("searchText");
    expect(item).not.toHaveProperty("ownerId");
  });
});

describe("label-scoped list and search", () => {
  const inLabel = (
    who: ReturnType<T["withIdentity"]>,
    labelId: Id<"labels">,
    extra: object = {},
  ) =>
    who.query(api.itemLabels.listItemsForLabel, {
      labelId,
      paginationOpts: opts(),
      ...extra,
    });
  const searchLabel = (
    who: ReturnType<T["withIdentity"]>,
    labelId: Id<"labels">,
    query: string,
    extra: object = {},
    paginationOpts = opts(),
  ) =>
    who.query(api.itemLabels.searchItemsForLabel, {
      labelId,
      query,
      paginationOpts,
      ...extra,
    });

  async function labeled() {
    const ctx = await setup();
    const { alice, save, label, modelLabel } = ctx;
    // Saved before any label exists so no automatic labeling run is pending.
    const xUrl = await save(alice, "https://x.com/a", "url");
    const webUrl = await save(alice, "https://example.com/b", "url");
    const unsureNote = await save(alice, "ramen unsure");
    const sureNote = await save(alice, "ramen sure");
    const elsewhere = await save(alice, "ramen elsewhere");
    const recipes = await label(alice, "Recipes");
    const other = await label(alice, "Other");
    for (const itemId of [xUrl, webUrl, sureNote])
      await alice.mutation(api.itemLabels.attach, {
        itemId,
        labelId: recipes,
      });
    await modelLabel(unsureNote, recipes, 0.6);
    // Unsure in "Other" but confident in Recipes: review state is per label.
    await modelLabel(sureNote, other, 0.55);
    await alice.mutation(api.itemLabels.attach, {
      itemId: elsewhere,
      labelId: other,
    });
    return {
      ...ctx,
      xUrl,
      webUrl,
      unsureNote,
      sureNote,
      elsewhere,
      recipes,
      other,
    };
  }

  it("lists only the label's included items, optionally by source", async () => {
    const { alice, xUrl, webUrl, unsureNote, sureNote, recipes } =
      await labeled();
    expect(new Set(ids(await inLabel(alice, recipes)))).toEqual(
      new Set([xUrl, webUrl, unsureNote, sureNote]),
    );
    expect(ids(await inLabel(alice, recipes, { source: "x" }))).toEqual([xUrl]);
    expect(
      new Set(ids(await inLabel(alice, recipes, { source: "note" }))),
    ).toEqual(new Set([unsureNote, sureNote]));
  });
  it("filters needs review by this label's own link", async () => {
    const { alice, unsureNote, sureNote, recipes, other } = await labeled();
    expect(ids(await inLabel(alice, recipes, { needsReview: true }))).toEqual([
      unsureNote,
    ]);
    expect(ids(await inLabel(alice, other, { needsReview: true }))).toEqual([
      sureNote,
    ]);
    expect(
      ids(await inLabel(alice, recipes, { needsReview: true, source: "x" })),
    ).toEqual([]);
  });
  it("does not list an item whose link was removed", async () => {
    const { alice, xUrl, recipes } = await labeled();
    await alice.mutation(api.itemLabels.remove, {
      itemId: xUrl,
      labelId: recipes,
    });
    expect(ids(await inLabel(alice, recipes, { source: "x" }))).toEqual([]);
  });
  it("does not find an item through a removed label link", async () => {
    const { alice, unsureNote, recipes } = await labeled();
    expect(ids(await searchLabel(alice, recipes, "unsure"))).toEqual([
      unsureNote,
    ]);
    await alice.mutation(api.itemLabels.remove, {
      itemId: unsureNote,
      labelId: recipes,
    });
    expect(ids(await searchLabel(alice, recipes, "unsure"))).toEqual([]);
  });
  it("searches within the label only", async () => {
    const { alice, unsureNote, sureNote, recipes } = await labeled();
    expect(new Set(ids(await searchLabel(alice, recipes, "ramen")))).toEqual(
      new Set([unsureNote, sureNote]),
    );
  });
  it("combines search with source and needs review in a label", async () => {
    const { alice, xUrl, unsureNote, recipes } = await labeled();
    expect(
      ids(await searchLabel(alice, recipes, "https", { source: "x" })),
    ).toEqual([xUrl]);
    expect(
      ids(await searchLabel(alice, recipes, "ramen", { needsReview: true })),
    ).toEqual([unsureNote]);
    expect(
      ids(await searchLabel(alice, recipes, "ramen", { source: "x" })),
    ).toEqual([]);
  });
  it("hides foreign labels and requires authentication", async () => {
    const { t, alice, bob, label } = await labeled();
    const bobs = await label(bob, "Mine");
    await expect(inLabel(alice, bobs)).rejects.toThrow("Not found");
    await expect(searchLabel(alice, bobs, "ramen")).rejects.toThrow(
      "Not found",
    );
    await expect(
      t.query(api.itemLabels.searchItemsForLabel, {
        labelId: bobs,
        query: "ramen",
        paginationOpts: opts(),
      }),
    ).rejects.toThrow("Authentication required");
  });
  it("rejects bad queries and pages ten at a time", async () => {
    const { alice, save, label } = await setup();
    const ids12: Id<"items">[] = [];
    for (let i = 0; i < 12; i++) ids12.push(await save(alice, `ramen ${i}`));
    const l = await label(alice, "Big");
    for (const itemId of ids12)
      await alice.mutation(api.itemLabels.attach, { itemId, labelId: l });
    await expect(searchLabel(alice, l, "  ")).rejects.toThrow("Search");
    const first = await searchLabel(alice, l, "ramen", {}, opts(50));
    expect(first.page).toHaveLength(10);
    const next = await searchLabel(
      alice,
      l,
      "ramen",
      {},
      opts(50, first.continueCursor),
    );
    expect(next.page).toHaveLength(2);
    expect(new Set([...ids(first), ...ids(next)]).size).toBe(12);
  });
});
