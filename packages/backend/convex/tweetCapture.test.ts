import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const input = {
  inputType: "url" as const,
  originalInput: "https://x.com/a/status/123",
  captureSource: "extension" as const,
  captureKey: "tweet",
  extractedText: "Read https://example.org/resource",
};
function setup() {
  const t = convexTest(schema, modules);
  const a = t.withIdentity({ subject: "alice" });
  return { t, a };
}
it("saves a known-link source hidden from the first transaction and processes only its resource", async () => {
  const { t, a } = setup();
  await a.mutation(api.labels.create, { name: "Reading" });
  const itemId = await a.mutation(api.items.create, input);
  expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
    libraryRole: "tweet_source",
    inbox: false,
    tweetLinksVersion: 2,
  });
  expect(await a.query(api.items.stats, {})).toMatchObject({
    total: 1,
    inbox: 1,
  });
  const runs = await t.run((ctx) => ctx.db.query("processingRuns").collect());
  expect(runs.some((run) => run.itemId === itemId)).toBe(false);
  expect(runs).toHaveLength(1);
  expect(runs[0]?.kind).toBe("enrichment");
  expect(await a.mutation(api.items.create, input)).toBe(itemId);
  expect(await a.query(api.items.stats, {})).toMatchObject({ total: 1 });
});
it("recovers a pending no-link clip once, then lets later fuller text convert it to a source", async () => {
  const { t, a } = setup();
  const itemId = await a.mutation(api.items.create, {
    ...input,
    extractedText: "no links yet",
  });
  expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
    libraryRole: "tweet_pending",
    inbox: false,
  });
  expect(await a.query(api.items.stats, {})).toMatchObject({ total: 0 });
  const recover = makeFunctionReference<"mutation">("tweetLinks:recover");
  await t.mutation(recover, { itemId });
  await t.mutation(recover, { itemId });
  expect(await a.query(api.items.stats, {})).toMatchObject({ total: 1 });
  expect(
    (await t.run((ctx) => ctx.db.get(itemId)))?.libraryRole,
  ).toBeUndefined();
  await t.mutation(internal.tweetLinks.apply, {
    itemId,
    fullText: "Now a much longer text with https://example.org/resource",
  });
  await t.mutation(recover, { itemId });
  expect(await a.query(api.items.stats, {})).toMatchObject({ total: 1 });
  expect((await t.run((ctx) => ctx.db.get(itemId)))?.libraryRole).toBe(
    "tweet_source",
  );
  expect(
    (await t.run((ctx) => ctx.db.query("processingRuns").collect())).filter(
      (run) => run.itemId === itemId && run.kind === "enrichment",
    ),
  ).toHaveLength(1);
});
it("resolves pending text through scheduled fallback when fuller-text fetching fails", async () => {
  const { t, a } = setup();
  vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
  const itemId = await a.mutation(api.items.create, {
    ...input,
    extractedText: "ordinary tweet",
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    (await t.run((ctx) => ctx.db.get(itemId)))?.libraryRole,
  ).toBeUndefined();
  expect(await a.query(api.items.stats, {})).toMatchObject({ total: 1 });
});
it("keeps bare pasted tweet URLs on the existing normal pipeline", async () => {
  const { t, a } = setup();
  const { extractedText: _, ...bare } = input;
  const id = await a.mutation(api.items.create, bare);
  expect((await t.run((ctx) => ctx.db.get(id)))?.libraryRole).toBeUndefined();
  expect(await a.query(api.items.stats, {})).toMatchObject({ total: 1 });
});

it("retries extraction after a caught error leaves a resource write but no completion marker", async () => {
  const { t, a } = setup();
  const source = await a.mutation(api.items.create, {
    ...input,
    extractedText: "no links yet",
  });
  const { insertCapture } = await import("./libraryWriters");
  const { extractTweetResources } = await import("./tweetResourceWriters");
  await t.run(async (ctx) => {
    await ctx.db.patch(source, { extractedText: input.extractedText });
    try {
      await extractTweetResources(ctx, source, async (...args) => {
        await insertCapture(...args);
        throw new Error("Interrupted after write");
      });
    } catch {
      /* Model capture's best-effort boundary, where earlier writes survive. */
    }
  });
  expect(
    (await t.run((ctx) => ctx.db.get(source)))?.tweetLinksVersion,
  ).toBeUndefined();
  await t.mutation(internal.tweetLinks.apply, { itemId: source });
  const rows = await t.run((ctx) => ctx.db.query("items").collect());
  expect(rows).toHaveLength(2);
  expect(rows.find((row) => row._id === source)).toMatchObject({
    tweetLinksVersion: 2,
    libraryRole: "tweet_source",
    linkedItemStats: { count: 1 },
  });
  expect(await a.query(api.items.stats, {})).toMatchObject({ total: 1 });
});

it("does not recreate a deleted partial resource while retrying unfinished URLs", async () => {
  const { t, a } = setup();
  const source = await a.mutation(api.items.create, {
    ...input,
    extractedText: "not evaluated",
  });
  const { insertCapture } = await import("./libraryWriters");
  const { extractTweetResources } = await import("./tweetResourceWriters");
  await t.run(async (ctx) => {
    await ctx.db.patch(source, {
      extractedText: "https://example.org/a https://example.org/b",
    });
    try {
      await extractTweetResources(ctx, source, async (...args) => {
        await insertCapture(...args);
        throw new Error("Interrupted after resource A");
      });
    } catch {
      /* Surviving partial write, without a completion marker. */
    }
  });
  const partial = (await t.run((ctx) => ctx.db.query("items").collect())).find(
    (row) => row.fromItemId === source,
  )!;
  await a.mutation(api.items.remove, { id: partial._id });
  await t.mutation(internal.tweetLinks.apply, { itemId: source });
  expect(
    (await t.run((ctx) => ctx.db.query("items").collect()))
      .filter((row) => row.fromItemId === source)
      .map((row) => row.originalInput),
  ).toEqual(["https://example.org/b"]);
  expect(await a.query(api.items.stats, {})).toMatchObject({ total: 1 });
});
