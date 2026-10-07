import { convexTest } from "convex-test";
import type { TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { UNSURE_THRESHOLD } from "./decisionProvider";
import {
  buildLinkSearchText,
  buildSearchText,
  sourceKindOf,
} from "./itemState";
import schema from "./schema";
import { modules } from "./test.setup";

type T = TestConvex<typeof schema>;

/** Small seeded generator so a failing sequence can be replayed by its seed. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OWNER = "alice";

/**
 * Recomputes everything from scratch, reading every link and run, without
 * using the production flag logic: the oracle the stored state must match.
 */
async function drift(t: T): Promise<string[]> {
  return t.run(async (ctx) => {
    const problems: string[] = [];
    const items = (await ctx.db.query("items").collect()).filter((i) =>
      i.ownerId.endsWith(`|${OWNER}`),
    );
    let inbox = 0;
    let needsReview = 0;
    for (const item of items) {
      const links = await ctx.db
        .query("itemLabels")
        .filter((q) => q.eq(q.field("itemId"), item._id))
        .collect();
      const runs = await ctx.db
        .query("processingRuns")
        .filter((q) => q.eq(q.field("itemId"), item._id))
        .collect();
      const included = links.filter((l) => l.manualDecision === "include");
      const isUnsure = (l: (typeof links)[number]) =>
        l.manualDecision === "include" &&
        l.origin === "model" &&
        l.confirmedAt === undefined &&
        l.confidence !== undefined &&
        l.confidence < UNSURE_THRESHOLD;
      const review = included.some(isUnsure);
      const wantInbox =
        included.length === 0 ||
        item.enrichmentStatus === "pending" ||
        // "In flight" means pending among the three newest runs (spec), so a
        // hung run buried under newer ones does not hold an item in the inbox.
        [...runs]
          .sort((a, b) => b._creationTime - a._creationTime)
          .slice(0, 3)
          .some((r) => r.kind === "decision" && r.status === "pending") ||
        review;
      if ((item.needsReview ?? false) !== review)
        problems.push(`${item._id} needsReview`);
      if ((item.inbox ?? false) !== wantInbox)
        problems.push(`${item._id} inbox`);
      if (item.searchText !== buildSearchText(item))
        problems.push(`${item._id} searchText`);
      if (item.sourceKind !== sourceKindOf(item))
        problems.push(`${item._id} sourceKind`);
      for (const l of links) {
        if ((l.unsure ?? false) !== isUnsure(l))
          problems.push(`${l._id} link unsure`);
        if (l.sourceKind !== sourceKindOf(item))
          problems.push(`${l._id} link sourceKind`);
        if (l.searchText !== buildLinkSearchText(item))
          problems.push(`${l._id} link searchText`);
      }
      inbox += Number(wantInbox);
      needsReview += Number(review);
    }
    const row = (await ctx.db.query("ownerStats").collect()).find((r) =>
      r.ownerId.endsWith(`|${OWNER}`),
    );
    const got = row
      ? { total: row.total, inbox: row.inbox, needsReview: row.needsReview }
      : { total: 0, inbox: 0, needsReview: 0 };
    const want = { total: items.length, inbox, needsReview };
    if (JSON.stringify(got) !== JSON.stringify(want))
      problems.push(`stats ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
    return problems;
  });
}

// 0 create, 1 attach, 2 remove, 3 confirm, 4 start decision, 5 start enrichment,
// 6 finish a pending run, 7 delete.
const WEIGHTED_OPS = [
  0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 3, 3, 4, 4, 5, 6, 6, 6, 6, 6, 6, 7,
];

async function randomSequence(seed: number, steps: number) {
  const rand = rng(seed);
  const pick = <X>(xs: X[]) => xs[Math.floor(rand() * xs.length)]!;
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: OWNER });
  const labels: Id<"labels">[] = [];
  for (let i = 0; i < 5; i++)
    labels.push(await alice.mutation(api.labels.create, { name: `L${i}` }));
  let items: Id<"items">[] = [];
  let pending: {
    runId: Id<"processingRuns">;
    itemId: Id<"items">;
    kind: "decision" | "enrichment";
  }[] = [];
  const urls = [
    "https://x.com/a",
    "https://www.youtube.com/watch?v=1",
    "https://example.com/page",
  ];
  let n = 0;
  const log: string[] = [];
  for (let step = 0; step < steps; step++) {
    // Weighted so runs usually finish and links change on settled items; otherwise
    // pending runs keep every item in the inbox and hide flag changes.
    const op = pick(WEIGHTED_OPS);
    log.push(String(op));
    if ((op === 0 && items.length < 4) || items.length === 0) {
      const url = rand() < 0.5;
      items.push(
        await alice.mutation(api.items.create, {
          inputType: url ? "url" : "text",
          originalInput: url ? pick(urls) : `note ${n}`,
          captureSource: "web",
          captureKey: `k${n++}`,
        }),
      );
    } else if (op === 1 || op === 2) {
      const itemId = pick(items);
      const labelId = pick(labels);
      await alice.mutation(
        op === 1 ? api.itemLabels.attach : api.itemLabels.remove,
        { itemId, labelId },
      );
    } else if (op === 3) {
      // Aim at a real unconfirmed model link when one exists; random pairs rarely hit one.
      const open = await t.run(async (ctx) =>
        (await ctx.db.query("itemLabels").collect()).filter(
          (l) =>
            l.origin === "model" &&
            l.manualDecision === "include" &&
            l.confirmedAt === undefined &&
            (l.confidence ?? 1) < UNSURE_THRESHOLD,
        ),
      );
      const target = open.length > 0 && rand() < 0.8 ? pick(open) : undefined;
      await alice.mutation(api.itemLabels.confirm, {
        itemId: target?.itemId ?? pick(items),
        labelId: target?.labelId ?? pick(labels),
      });
    } else if (op === 4 || op === 5) {
      const itemId = pick(items);
      const kind = op === 4 ? "decision" : "enrichment";
      const runId = await t.mutation(internal.processingRuns.start, {
        itemId,
        kind,
        ...(kind === "decision"
          ? { provider: "clef-flash" as const, model: "clef-flash" }
          : {}),
        modality: "text",
        questionVersion: "v1",
      });
      pending.push({ runId, itemId, kind });
    } else if (op === 6 && pending.length > 0) {
      const run = pending.splice(Math.floor(rand() * pending.length), 1)[0]!;
      if (rand() < 0.25) {
        await t.mutation(internal.processingRuns.finish, {
          runId: run.runId,
          itemId: run.itemId,
          result: { status: "failed", error: "boom" },
        });
      } else if (run.kind === "decision") {
        const picked = labels.filter(() => rand() < 0.4);
        await t.mutation(internal.decisions.complete, {
          runId: run.runId,
          itemId: run.itemId,
          suggestions: picked.map((labelId) => ({
            labelId,
            confidence: 0.5 + rand() * 0.5,
          })),
          model: "clef-flash",
        });
      } else {
        await t.mutation(internal.processingRuns.finish, {
          runId: run.runId,
          itemId: run.itemId,
          result: {
            status: "succeeded",
            suggestions: [],
            enrichment: {
              sourceMetadata: { title: `Title ${n++}` },
              extractedText: `text ${n}`,
            },
          },
        });
      }
    } else if (op === 7) {
      const itemId = pick(items);
      await alice.mutation(api.items.remove, { id: itemId });
      items = items.filter((i) => i !== itemId);
      pending = pending.filter((p) => p.itemId !== itemId);
    }
    // finishing with nothing pending, and creating at the item cap, are deliberate no-ops.
    // Checked after every step: a missed refresh is otherwise repaired by a later write.
    const problems = await drift(t);
    if (problems.length > 0)
      throw new Error(
        `seed ${seed} step ${step} op ${op}: ${problems.join("; ")}`,
      );
  }
  return { t, alice, log: log.join("") };
}

describe("item state invariant", () => {
  for (const seed of Array.from({ length: 16 }, (_, i) => i + 1))
    it(`stored flags and counters match a from-scratch recompute (seed ${seed})`, async () => {
      const { t, log } = await randomSequence(seed, 100);
      expect(await drift(t), `ops ${log}`).toEqual([]);
    });
});

describe("recountOwnerStats", () => {
  const ownerOf = (t: T) =>
    t.run(async (ctx) => (await ctx.db.query("items").first())!.ownerId);

  it("reports and repairs corrupted flags and counters, then reports nothing", async () => {
    const { t } = await randomSequence(11, 50);
    const ownerId = await ownerOf(t);
    await t.run(async (ctx) => {
      const item = (await ctx.db.query("items").first())!;
      await ctx.db.patch(item._id, {
        needsReview: !item.needsReview,
        inbox: !item.inbox,
        searchText: "corrupt",
      });
      const stats = (await ctx.db.query("ownerStats").first())!;
      await ctx.db.patch(stats._id, { inbox: 99, total: 99 });
    });
    expect((await drift(t)).length).toBeGreaterThan(0);
    const first = await t.mutation(internal.itemState.recountOwnerStats, {
      ownerId,
    });
    expect(first).toMatchObject({ done: true, statsRepaired: true });
    expect(first.itemsRepaired).toBeGreaterThanOrEqual(1);
    expect(await drift(t)).toEqual([]);
    const second = await t.mutation(internal.itemState.recountOwnerStats, {
      ownerId,
    });
    expect(second).toMatchObject({
      done: true,
      itemsRepaired: 0,
      statsRepaired: false,
    });
  });
  it("backfills items and links saved before these fields existed", async () => {
    // Needs a library that has an unsure model label, the case where repair order matters.
    let sequence = await randomSequence(14, 60);
    for (let seed = 15; seed < 60; seed++) {
      const unsure = await sequence.t.run(async (ctx) =>
        (await ctx.db.query("itemLabels").collect()).filter((l) => l.unsure),
      );
      if (unsure.length > 0) break;
      sequence = await randomSequence(seed, 60);
    }
    const { t } = sequence;
    expect(
      (await t.run((ctx) => ctx.db.query("items").collect())).some(
        (i) => i.needsReview,
      ),
    ).toBe(true);
    const ownerId = await ownerOf(t);
    // Strip everything this feature added, as on a deployment with older data.
    await t.run(async (ctx) => {
      for (const item of await ctx.db.query("items").collect())
        await ctx.db.patch(item._id, {
          searchText: undefined,
          sourceKind: undefined,
          inbox: undefined,
          needsReview: undefined,
        });
      for (const link of await ctx.db.query("itemLabels").collect())
        await ctx.db.patch(link._id, {
          searchText: undefined,
          sourceKind: undefined,
          unsure: undefined,
        });
      for (const row of await ctx.db.query("ownerStats").collect())
        await ctx.db.delete(row._id);
    });
    expect((await drift(t)).length).toBeGreaterThan(0);
    const result = await t.mutation(internal.itemState.recountOwnerStats, {
      ownerId,
    });
    expect(result).toMatchObject({ done: true, statsRepaired: true });
    expect(result.itemsRepaired).toBeGreaterThan(0);
    expect(result.linksRepaired).toBeGreaterThan(0);
    expect(await drift(t)).toEqual([]);
    expect(
      await t.mutation(internal.itemState.recountOwnerStats, { ownerId }),
    ).toMatchObject({
      itemsRepaired: 0,
      linksRepaired: 0,
      statsRepaired: false,
    });
  });
  it("creates the counters row for an owner that has none", async () => {
    const { t } = await randomSequence(12, 20);
    const ownerId = await ownerOf(t);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("ownerStats").collect())
        await ctx.db.delete(row._id);
    });
    await t.mutation(internal.itemState.recountOwnerStats, { ownerId });
    expect(await drift(t)).toEqual([]);
  });
  it("only touches the named owner", async () => {
    const { t } = await randomSequence(13, 20);
    const other = t.withIdentity({ subject: "bob" });
    await other.mutation(api.items.create, {
      inputType: "text",
      originalInput: "bobs",
      captureSource: "web",
      captureKey: "b",
    });
    const bobRow = async () =>
      t.run(async (ctx) =>
        (await ctx.db.query("ownerStats").collect()).find((r) =>
          r.ownerId.endsWith("|bob"),
        ),
      );
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("ownerStats").collect()).find((r) =>
        r.ownerId.endsWith("|bob"),
      )!;
      await ctx.db.patch(row._id, { inbox: 42 });
    });
    await t.mutation(internal.itemState.recountOwnerStats, {
      ownerId: await ownerOf(t),
    });
    expect((await bobRow())?.inbox).toBe(42);
  });
});
