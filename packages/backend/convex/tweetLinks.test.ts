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
    t.mutation(internal.tweetLinks.extract, { itemId });
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
    expect(scheduled.map((s) => s.name)).toContain("tweetLinks:extract");
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
    expect((await stats()).total).toBe(8);
  });

  it("does not expand a tweet with a single link", async () => {
    const { clip, extract, items } = setup();
    const tweet = await clip("1", "Read this: https://example.com/post");
    expect(await extract(tweet)).toEqual({ created: 0 });
    expect(await items()).toHaveLength(1);
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
        if (job.name === "tweetLinks:extract")
          await ctx.scheduler.cancel(job._id);
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
