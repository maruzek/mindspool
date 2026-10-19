import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const noah = `7  Mockup tools every designer should bookmark.

1. https://mocku.com
2. https://studio.morflax.com
3. https://mockupfreak.com
4. https://phone.framer.website
5. https://artboard.studio
6. https://mockupanda.com
7. https://dynamicmockups.com

What did I miss?`;

function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const clip = (id: string, text: string) =>
    alice.mutation(api.items.create, {
      originalInput: `https://x.com/someone/status/${id}`,
      inputType: "url",
      captureSource: "extension",
      captureKey: `x:${id}`,
      sourceMetadata: { title: "Someone (@someone)", siteName: "X" },
      extractedText: text,
    });
  const paste = (url: string, captureKey: string = crypto.randomUUID()) =>
    alice.mutation(api.items.create, {
      originalInput: url,
      inputType: "url",
      captureSource: "web",
      captureKey,
    });
  const extract = (itemId: Id<"items">) =>
    t.mutation(internal.tweetLinks.apply, { itemId });
  const items = () => t.run((ctx) => ctx.db.query("items").collect());
  const links = async () =>
    (await items())
      .filter((i) => i.sourceKind !== "x")
      .map((i) => i.originalInput);
  const stats = () => alice.query(api.items.stats, {});
  return { t, alice, clip, paste, extract, items, links, stats };
}

describe("plain link dedupe", () => {
  it("stores a urlKey on links and none on notes", async () => {
    const { alice, paste, items } = setup();
    await paste("https://www.Mocku.com/?utm_source=x");
    await alice.mutation(api.items.create, {
      originalInput: "a note",
      inputType: "text",
      captureSource: "web",
      captureKey: "n",
    });
    expect((await items()).map((i) => i.urlKey)).toEqual([
      "mocku.com",
      undefined,
    ]);
  });

  it("returns the existing Item for the same link pasted again", async () => {
    const { paste, items, stats } = setup();
    const first = await paste("https://mocku.com");
    expect(await paste("http://www.mocku.com/")).toBe(first);
    expect(await paste("https://mocku.com", "retry")).toBe(first);
    expect(await paste("https://mocku.com", "retry")).toBe(first);
    expect(await items()).toHaveLength(1);
    expect((await stats()).total).toBe(1);
  });

  it("still saves a clip with content when a bare link exists", async () => {
    const { paste, clip, items } = setup();
    await paste("https://x.com/someone/status/1");
    await clip("1", "Just text");
    expect(await items()).toHaveLength(2);
  });

  it("a pasted tweet link opens the clipped tweet", async () => {
    const { paste, clip } = setup();
    const tweet = await clip("1", "Just text");
    expect(await paste("https://x.com/someone/status/1")).toBe(tweet);
  });
});

describe("tweet link extraction", () => {
  it("schedules extraction when a tweet is clipped", async () => {
    const { t, clip } = setup();
    await clip("1", noah);
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled.map((s) => s.name)).toContain("tweetLinks:run");
  });

  it("saves one link Item per resource, each being enriched", async () => {
    const { clip, extract, items, links, stats } = setup();
    const tweet = await clip("1", noah);
    expect(await extract(tweet)).toEqual({ created: 7 });
    expect(await links()).toEqual([
      "https://mocku.com",
      "https://studio.morflax.com",
      "https://mockupfreak.com",
      "https://phone.framer.website",
      "https://artboard.studio",
      "https://mockupanda.com",
      "https://dynamicmockups.com",
    ]);
    const saved = (await items()).filter((i) => i.sourceKind === "web");
    expect(saved.every((i) => i.enrichmentStatus === "pending")).toBe(true);
    expect(saved.every((i) => i.captureSource === "extension")).toBe(true);
    expect((await stats()).total).toBe(7);
  });

  it("expands a tweet with a single eligible link", async () => {
    const { clip, extract, items } = setup();
    const tweet = await clip("1", "Read this: https://example.com/post");
    expect(await extract(tweet)).toEqual({ created: 1 });
    expect(await items()).toHaveLength(2);
  });

  it("skips links already saved, from pastes or other tweets", async () => {
    const { clip, paste, extract, links } = setup();
    await paste("https://www.reactbits.dev/");
    const first = await clip(
      "1",
      "These two: https://ui.aceternity.com and https://reactbits.dev.",
    );
    expect(await extract(first)).toEqual({ created: 1 });
    const second = await clip(
      "2",
      "More: https://ui.aceternity.com, https://reactbits.dev, https://animos.app",
    );
    expect(await extract(second)).toEqual({ created: 1 });
    expect(await links()).toEqual([
      "https://www.reactbits.dev/",
      "https://ui.aceternity.com",
      "https://animos.app",
    ]);
  });

  it("runs once per tweet, so a deleted resource is not re-created", async () => {
    const { alice, clip, extract, items } = setup();
    const tweet = await clip("1", noah);
    await extract(tweet);
    const one = (await items()).find((i) => i.sourceKind === "web")!;
    await alice.mutation(api.items.remove, { id: one._id });
    expect(await extract(tweet)).toEqual({ created: 0 });
    expect(await clip("1", noah)).toBe(tweet);
    expect(await items()).toHaveLength(7);
  });

  it("ignores non-tweet Items", async () => {
    const { paste, extract } = setup();
    const item = await paste("https://example.com/a");
    expect(await extract(item)).toEqual({ created: 0 });
  });

  it("gives each resource the og:image of its page", async () => {
    const { t, clip, extract, items } = setup();
    vi.stubGlobal("fetch", (url: string) => {
      const host = new URL(url).hostname;
      return Promise.resolve(
        new Response(
          `<head><title>${host}</title><meta property="og:image" content="/og.png"></head>`,
          { headers: { "content-type": "text/html" } },
        ),
      );
    });
    const tweet = await clip(
      "1",
      "These two: https://ui.aceternity.com and https://reactbits.dev.",
    );
    await extract(tweet);
    // Run each fetch directly: draining timers would let the expiry win.
    const runs = await t.run((ctx) => ctx.db.query("processingRuns").collect());
    for (const run of runs.filter((r) => r.kind === "enrichment"))
      await t.action(internal.enrichment.run, {
        runId: run._id,
        itemId: run.itemId,
        thenLabel: true,
      });
    const saved = (await items()).filter((i) => i.sourceKind === "web");
    expect(
      saved.map((i) => [
        i.enrichmentStatus,
        i.sourceMetadata?.title,
        i.imageAssets,
      ]),
    ).toEqual([
      [
        "succeeded",
        "ui.aceternity.com",
        [
          {
            kind: "external",
            url: "https://ui.aceternity.com/og.png",
            purpose: "thumbnail",
          },
        ],
      ],
      [
        "succeeded",
        "reactbits.dev",
        [
          {
            kind: "external",
            url: "https://reactbits.dev/og.png",
            purpose: "thumbnail",
          },
        ],
      ],
    ]);
  });
});

describe("backfill", () => {
  it("keys old links, then expands old tweets once", async () => {
    const { t, clip, paste, items, links } = setup();
    await paste("https://mocku.com");
    const tweet = await clip("1", noah);
    // As saved before this feature: no keys, no extraction yet.
    await t.run(async (ctx) => {
      for (const item of await ctx.db.query("items").collect())
        await ctx.db.patch(item._id, {
          urlKey: undefined,
          linksExtracted: undefined,
        });
      for (const job of await ctx.db.system
        .query("_scheduled_functions")
        .collect())
        if (job.name === "tweetLinks:run") await ctx.scheduler.cancel(job._id);
    });
    await t.mutation(internal.tweetLinks.backfill, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await links()).toHaveLength(7);
    expect((await items()).every((i) => i.urlKey)).toBe(true);
    expect((await items()).find((i) => i._id === tweet)?.linksExtracted).toBe(
      true,
    );

    await t.mutation(internal.tweetLinks.backfill, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await links()).toHaveLength(7);
  });
});

const cut = `10 resources every AI designer should know👇

1. https://modulify.ai/templates — daily free builds
2. https://iconly.design — find brand references
3. https://fontinlogo.com — find the hottest typefaces
4. https://logotouse.com — find free logos
5. https://landdding.com — find`;
const full = `10 resources every AI designer should know👇

1. http://modulify.ai/templates — daily free builds
2. http://iconly.design — find brand references
3. http://fontinlogo.com — find the hottest typefaces
4. http://logotouse.com — find free logos
5. http://landdding.com — find landing page visuals
6. http://motionin.design — find motion sections
7. http://wonderlist.design — find premium Figma designs
8. http://wedoflow.com — discover website design inspiration
9. http://ikonik.modulify.ai — find icons for your next build
10. http://paperanimation.ai — create interactive animations`;

const fxTwitter = (id: string, text: string) =>
  vi.fn((url: string) =>
    Promise.resolve(
      url === `https://api.fxtwitter.com/someone/status/${id}`
        ? Response.json({ code: 200, tweet: { id, text } })
        : new Response("", { status: 404 }),
    ),
  );

describe('full text of a clip cut short by "Show more"', () => {
  it("fetches the post's full text and saves every link", async () => {
    const { t, clip, items, links } = setup();
    const fetch = fxTwitter("9", full);
    vi.stubGlobal("fetch", fetch);
    const tweet = await clip("9", cut);
    expect(await t.action(internal.tweetLinks.run, { itemId: tweet })).toEqual({
      created: 10,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.fxtwitter.com/someone/status/9",
      expect.anything(),
    );
    expect(await links()).toHaveLength(10);
    const saved = (await items()).find((i) => i._id === tweet)!;
    expect(saved.extractedText).toBe(full);
    expect(saved.searchText).toContain("paperanimation");
  });

  it("keeps the clip's text when the post cannot be fetched", async () => {
    const { t, clip, items, links } = setup();
    const tweet = await clip("9", cut);
    expect(await t.action(internal.tweetLinks.run, { itemId: tweet })).toEqual({
      created: 5,
    });
    expect(await links()).toHaveLength(5);
    expect((await items()).find((i) => i._id === tweet)!.extractedText).toBe(
      cut,
    );
  });

  it("keeps the clip's text when it is not shorter", async () => {
    const { t, clip, items } = setup();
    vi.stubGlobal("fetch", fxTwitter("9", "short"));
    const tweet = await clip("9", noah);
    await t.action(internal.tweetLinks.run, { itemId: tweet });
    expect((await items()).find((i) => i._id === tweet)!.extractedText).toBe(
      noah,
    );
  });

  it("re-running after the text grew adds only the new links", async () => {
    const { t, alice, clip, extract, items, links } = setup();
    const tweet = await clip("9", cut);
    await extract(tweet);
    const iconly = (await items()).find(
      (i) => i.originalInput === "https://iconly.design",
    )!;
    await alice.mutation(api.items.remove, { id: iconly._id });
    vi.stubGlobal("fetch", fxTwitter("9", full));
    expect(await t.action(internal.tweetLinks.run, { itemId: tweet })).toEqual({
      created: 5,
    });
    expect(await links()).toHaveLength(9);
    expect(await links()).not.toContain("http://iconly.design");
  });
});

describe("the post a link was found in", () => {
  it("is recorded on each link and shown in its detail", async () => {
    const { alice, clip, extract, items } = setup();
    const tweet = await clip("1", noah);
    await extract(tweet);
    const link = (await items()).find(
      (i) => i.originalInput === "https://mocku.com",
    )!;
    expect(link.fromItemId).toBe(tweet);
    const detail = await alice.query(api.items.detail, { id: link._id });
    expect(detail?.fromPost).toEqual({
      _id: tweet,
      url: "https://x.com/someone/status/1",
      title: "Someone (@someone)",
      excerpt: `${noah.slice(0, 200)}…`,
    });
  });

  it("fills missing provenance on a link that was already saved", async () => {
    const { clip, paste, extract, items } = setup();
    const pasted = await paste("https://mocku.com");
    const source = await clip("1", noah);
    await extract(source);
    expect((await items()).find((i) => i._id === pasted)?.fromItemId).toBe(
      source,
    );
  });

  it("disappears from the detail once the post is deleted", async () => {
    const { alice, clip, extract, items } = setup();
    const tweet = await clip("1", noah);
    await extract(tweet);
    const link = (await items()).find((i) => i.fromItemId === tweet)!;
    await alice.mutation(api.items.remove, { id: tweet });
    const detail = await alice.query(api.items.detail, { id: link._id });
    expect(detail).not.toBeNull();
    expect(detail?.fromPost).toBeUndefined();
  });

  it("is restored by the backfill from older capture keys", async () => {
    const { t, clip, extract, items } = setup();
    const tweet = await clip("1", noah);
    await extract(tweet);
    await t.run(async (ctx) => {
      for (const item of await ctx.db.query("items").collect())
        await ctx.db.patch(item._id, { fromItemId: undefined });
    });
    await t.mutation(internal.tweetLinks.backfill, {});
    const links = (await items()).filter((i) => i.sourceKind === "web");
    expect(links).toHaveLength(7);
    expect(links.every((i) => i.fromItemId === tweet)).toBe(true);
  });
});

it("maintains lightweight parent counts across extraction, deletion and retries", async () => {
  const { t, alice, clip, extract, items } = setup();
  const post = await clip(
    "987654",
    "https://example.org/one https://example.org/two",
  );
  await extract(post);
  expect((await t.run((ctx) => ctx.db.get(post)))!.linkedItemStats?.count).toBe(
    2,
  );
  const child = (await items()).find((item) => item.fromItemId === post)!;
  await alice.mutation(api.items.remove, { id: child._id });
  await extract(post);
  expect((await t.run((ctx) => ctx.db.get(post)))!.linkedItemStats?.count).toBe(
    1,
  );
  await t.run((ctx) => ctx.db.patch(post, { linkedItemStats: undefined }));
  await t.action(internal.mcpDiscovery.rebuildResourceCount, { itemId: post });
  expect((await t.run((ctx) => ctx.db.get(post)))!.linkedItemStats?.count).toBe(
    1,
  );
});

it("refuses stale backfill counts when children change during migration", async () => {
  const { t, alice, clip, extract, items } = setup();
  const post = await clip(
    "987655",
    "https://example.org/a https://example.org/b",
  );
  await extract(post);
  await t.run((ctx) => ctx.db.patch(post, { linkedItemStats: undefined }));
  const state = await t.query(internal.mcpDiscovery.resourceCountState, {
    itemId: post,
  });
  const child = (await items()).find((item) => item.fromItemId === post)!;
  await alice.mutation(api.items.remove, { id: child._id });
  expect(
    await t.mutation(internal.mcpDiscovery.saveResourceCount, {
      itemId: post,
      ownerId: state!.ownerId,
      revision: state!.revision,
      count: 2,
    }),
  ).toBe(false);
  expect(
    (await t.run((ctx) => ctx.db.get(post)))!.linkedItemStats?.count,
  ).toBeUndefined();
  await t.action(internal.mcpDiscovery.rebuildResourceCount, { itemId: post });
  expect((await t.run((ctx) => ctx.db.get(post)))!.linkedItemStats?.count).toBe(
    1,
  );
});

it("hides all-duplicate sources and preserves the first source including dangling references", async () => {
  const { t, alice, clip, paste, extract, items, stats } = setup();
  const first = await clip("1", "https://example.org/a");
  const resource = await paste("https://example.org/a");
  await Promise.all([extract(first), extract(first)]);
  expect((await items()).find((row) => row._id === resource)?.fromItemId).toBe(
    first,
  );
  expect((await stats()).total).toBe(1);
  await alice.mutation(api.items.remove, { id: first });
  const second = await clip("2", "https://example.org/a");
  expect(await extract(second)).toEqual({ created: 0 });
  expect((await items()).find((row) => row._id === resource)?.fromItemId).toBe(
    first,
  );
  expect((await t.run((ctx) => ctx.db.get(second)))?.libraryRole).toBe(
    "tweet_source",
  );
});

it("handles reordered growing text without reusing capture keys or recreating deleted resources", async () => {
  const { t, alice, clip, extract, items } = setup();
  const source = await clip("1", "https://example.org/a https://example.org/b");
  await extract(source);
  const removed = (await items()).find(
    (row) => row.originalInput === "https://example.org/a",
  )!;
  await alice.mutation(api.items.remove, { id: removed._id });
  await t.mutation(internal.tweetLinks.apply, {
    itemId: source,
    fullText:
      "New discovery https://example.org/b https://example.org/c https://example.org/a",
  });
  expect(
    (await items())
      .filter((row) => row.fromItemId === source)
      .map((row) => row.originalInput),
  ).toEqual(["https://example.org/b", "https://example.org/c"]);
  expect((await t.run((ctx) => ctx.db.get(source)))?.tweetLinksVersion).toBe(2);
});
