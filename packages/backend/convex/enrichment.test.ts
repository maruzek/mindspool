import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isBlockedUrl } from "./enrichment";
import schema from "./schema";
import { modules } from "./test.setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const page = `<head><title>Soup</title>
<meta property="og:description" content="Hot">
<meta property="og:image" content="/soup.png"></head>`;
const html = (body: string, init: ResponseInit = {}) =>
  new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });
const mockFetch = (impl: (url: string) => Response | Promise<Response>) => {
  const fn = vi.fn((url: string) => impl(url));
  vi.stubGlobal("fetch", fn);
  return fn;
};

async function fixture(input = "https://example.com/soup") {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  await alice.mutation(api.labels.create, { name: "Recipes" });
  const itemId = await alice.mutation(api.items.create, {
    originalInput: input,
    inputType: input.startsWith("http") ? "url" : "text",
    captureSource: "web",
    captureKey: "k",
  });
  const runs = () =>
    t.run((ctx) =>
      ctx.db
        .query("processingRuns")
        .collect()
        .then((all) => all.filter((r) => r.itemId === itemId)),
    );
  const item = () => alice.query(api.items.get, { id: itemId });
  const runEnrichment = async () => {
    const pending = (await runs()).find((r) => r.kind === "enrichment");
    await t.action(internal.enrichment.run, {
      runId: pending!._id as Id<"processingRuns">,
      itemId,
      thenLabel: true,
    });
  };
  return { t, alice, itemId, runs, item, runEnrichment };
}

describe("isBlockedUrl", () => {
  it.each([
    "ftp://example.com/",
    "file:///etc/passwd",
    "http://user:pw@example.com/",
    "http://localhost/",
    "http://app.localhost/",
    "http://127.0.0.1/",
    "http://10.1.2.3/",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest",
    "http://2130706433/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",
    "not a url",
  ])("blocks %s", (url) => expect(isBlockedUrl(url)).toBe(true));
  it.each([
    "https://example.com/a?b=1",
    "http://8.8.8.8/",
    "https://172.32.0.1/",
  ])("allows %s", (url) => expect(isBlockedUrl(url)).toBe(false));
});

describe("starting enrichment", () => {
  it("saving a link starts enrichment and defers labeling", async () => {
    const { runs, item } = await fixture();
    const all = await runs();
    expect(all.map((r) => r.kind)).toEqual(["enrichment"]);
    expect(all[0]).toMatchObject({
      status: "pending",
      model: "og-fetch",
      questionVersion: "og-v1",
    });
    expect(await item()).toMatchObject({ enrichmentStatus: "pending" });
  });

  it("notes start labeling immediately and never enrich", async () => {
    const { runs, item } = await fixture("buy soup");
    expect((await runs()).map((r) => r.kind)).toEqual(["decision"]);
    expect(await item()).toMatchObject({ enrichmentStatus: "not_started" });
  });
});

describe("enrichment.run", () => {
  it("stores metadata and a thumbnail, then starts labeling", async () => {
    const { item, runs, runEnrichment } = await fixture();
    mockFetch(() => html(page));
    await runEnrichment();
    const saved = await item();
    expect(saved).toMatchObject({
      enrichmentStatus: "succeeded",
      sourceMetadata: { title: "Soup", description: "Hot" },
      imageAssets: [
        {
          kind: "external",
          url: "https://example.com/soup.png",
          purpose: "thumbnail",
        },
      ],
    });
    const all = await runs();
    expect(all.map((r) => [r.kind, r.status]).sort()).toEqual([
      ["decision", "pending"],
      ["enrichment", "succeeded"],
    ]);
  });

  it.each([
    ["an HTTP error", () => html("no", { status: 500 })],
    [
      "a non-HTML response",
      () =>
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ],
  ])("fails on %s without touching the item", async (_name, respond) => {
    const { item, runs, runEnrichment } = await fixture();
    mockFetch(respond);
    await runEnrichment();
    expect(await item()).toMatchObject({
      enrichmentStatus: "failed",
      originalInput: "https://example.com/soup",
      imageAssets: [],
    });
    expect((await item())?.sourceMetadata).toBeUndefined();
    const all = await runs();
    expect(all.find((r) => r.kind === "enrichment")?.status).toBe("failed");
    // Failure still starts labeling.
    expect(all.some((r) => r.kind === "decision")).toBe(true);
  });

  it("fails when the request errors or times out", async () => {
    const { item, runEnrichment } = await fixture();
    mockFetch(() =>
      Promise.reject(new DOMException("timeout", "TimeoutError")),
    );
    await runEnrichment();
    expect(await item()).toMatchObject({ enrichmentStatus: "failed" });
  });

  it("follows redirects but refuses one to a private address", async () => {
    const { item, runs, runEnrichment } = await fixture();
    const fetchMock = mockFetch((url) =>
      url === "https://example.com/soup"
        ? new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1/admin" },
          })
        : html(page),
    );
    await runEnrichment();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await item()).toMatchObject({ enrichmentStatus: "failed" });
    const run = (await runs()).find((r) => r.kind === "enrichment");
    expect(run?.error).toBe("Address not allowed");
  });

  it("resolves a relative redirect and reads the final page", async () => {
    const { item, runEnrichment } = await fixture();
    mockFetch((url) =>
      url === "https://example.com/soup"
        ? new Response(null, { status: 301, headers: { location: "/final" } })
        : html(page),
    );
    await runEnrichment();
    expect(await item()).toMatchObject({
      enrichmentStatus: "succeeded",
      sourceMetadata: { title: "Soup" },
    });
  });

  it("gives up after too many redirects", async () => {
    const { item, runEnrichment } = await fixture();
    mockFetch(
      () => new Response(null, { status: 302, headers: { location: "/loop" } }),
    );
    await runEnrichment();
    expect(await item()).toMatchObject({ enrichmentStatus: "failed" });
  });
});

describe("labeling during enrichment", () => {
  it("does not start a second decision when the user already classified", async () => {
    const { alice, itemId, runs, runEnrichment } = await fixture();
    await alice.mutation(api.decisions.classify, {
      itemId,
      model: "clef-flash",
    });
    mockFetch(() => html(page));
    await runEnrichment();
    const decisions = (await runs()).filter((r) => r.kind === "decision");
    expect(decisions).toHaveLength(1);
  });
});

describe("enrichment.expire", () => {
  it("fails a lost run and still starts labeling", async () => {
    const { t, itemId, item, runs } = await fixture();
    const pending = (await runs()).find((r) => r.kind === "enrichment")!;
    await t.mutation(internal.enrichment.expire, {
      runId: pending._id,
      itemId,
      thenLabel: true,
    });
    expect(await item()).toMatchObject({ enrichmentStatus: "failed" });
    const all = await runs();
    expect(all.find((r) => r.kind === "enrichment")).toMatchObject({
      status: "failed",
      error: "Enrichment timed out",
    });
    expect(all.some((r) => r.kind === "decision")).toBe(true);
  });

  it("does nothing once the run has settled", async () => {
    const { t, itemId, runs, runEnrichment } = await fixture();
    mockFetch(() => html(page));
    await runEnrichment();
    const pending = (await runs()).find((r) => r.kind === "enrichment")!;
    await t.mutation(internal.enrichment.expire, {
      runId: pending._id,
      itemId,
      thenLabel: true,
    });
    expect((await runs()).filter((r) => r.kind === "decision")).toHaveLength(1);
  });
});

describe("enrichment.backfill", () => {
  it("enriches only links that were never enriched, without labeling, and can repeat", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    await alice.mutation(api.labels.create, { name: "Recipes" });
    const ids: Id<"items">[] = [];
    for (let i = 0; i < 12; i++)
      ids.push(
        await alice.mutation(api.items.create, {
          originalInput: `https://example.com/${i}`,
          inputType: "url",
          captureSource: "web",
          captureKey: `k${i}`,
        }),
      );
    const note = await alice.mutation(api.items.create, {
      originalInput: "a note",
      inputType: "text",
      captureSource: "web",
      captureKey: "note",
    });
    // Simulate links saved before enrichment existed.
    await t.run(async (ctx) => {
      await ctx.db.delete(
        (await ctx.db.query("processingRuns").collect()).find(
          (r) => r.itemId === ids[0],
        )!._id,
      );
      for (const id of ids)
        await ctx.db.patch(id, {
          enrichmentStatus: "not_started",
          pendingEnrichmentRunId: undefined,
        });
    });
    mockFetch(() => html(page));
    await t.mutation(internal.enrichment.backfill, {});
    // Short of the 60s expiry: each step runs due fetches and the next batch.
    for (let step = 0; step < 4; step++)
      await vi.advanceTimersByTimeAsync(6000);
    const items = await t.run((ctx) => ctx.db.query("items").collect());
    const statuses = (id: Id<"items">) =>
      items.find((i) => i._id === id)?.enrichmentStatus;
    expect(ids.map(statuses)).toEqual(ids.map(() => "succeeded"));
    expect(statuses(note)).toBe("not_started");
    const decisions = (
      await t.run((ctx) => ctx.db.query("processingRuns").collect())
    ).filter((r) => r.kind === "decision");
    // Only the decision runs started when each save was made (none finished
    // enrichment-then-label here), never from the backfill.
    expect(decisions.filter((r) => r.itemId === ids[0])).toHaveLength(0);
    const again = await t.mutation(internal.enrichment.backfill, {});
    expect(again.started).toBe(0);
  });
});
