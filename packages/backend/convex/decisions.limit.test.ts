import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { startDecisionOrFail } from "./decisions";
import { neuronsFor } from "./decisionProvider";
import schema from "./schema";
import { modules } from "./test.setup";

const paginationOpts = { numItems: 20, cursor: null };
const DAY = "2026-10-07";
const LIMIT = 20; // about three estimated runs of a short item

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acct");
  vi.stubEnv("CLOUDFLARE_AUTH_TOKEN", "tok");
  vi.stubEnv("AI_DAILY_NEURON_LIMIT", String(LIMIT));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function fixture() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  await alice.mutation(api.labels.create, { name: "Recipes" });
  await bob.mutation(api.labels.create, { name: "News" });
  let n = 0;
  const save = (who: typeof alice) =>
    who.mutation(api.items.create, {
      originalInput: "A recipe",
      inputType: "text",
      captureSource: "web",
      captureKey: `k${n++}`,
    });
  const runsOf = async (
    who: typeof alice,
    itemId: Awaited<ReturnType<typeof save>>,
  ) =>
    (
      await who.query(api.processingRuns.listForItem, {
        itemId,
        paginationOpts,
      })
    ).page;
  const usage = (who: typeof alice) =>
    who.run(async (ctx) => {
      const id = (await ctx.auth.getUserIdentity())!.tokenIdentifier;
      return ctx.db
        .query("aiUsage")
        .withIndex("by_owner_day", (q) => q.eq("ownerId", id).eq("day", DAY))
        .unique();
    });
  const scheduled = () =>
    t.run(
      async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect()).length,
    );
  // Saves until the budget refuses one; returns that item.
  const fill = async (who: typeof alice) => {
    for (let i = 0; i < 50; i++) {
      const itemId = await save(who);
      if ((await runsOf(who, itemId))[0]!.status === "failed") return itemId;
    }
    throw new Error("limit never reached");
  };
  return { t, alice, bob, save, runsOf, usage, scheduled, fill };
}

const fetchWith = (impl: (ids: string[]) => Response | Promise<Response>) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) =>
      impl(Object.keys(JSON.parse(init.body as string).questions)),
    ),
  );
const answers = (ids: string[], inputTokens: number) =>
  new Response(
    JSON.stringify({
      success: true,
      result: {
        model: "clef-flash",
        answers: Object.fromEntries(
          ids.map((id) => [id, { type: "noul", noul: 0.9 }]),
        ),
        usage: { input_tokens: inputTokens },
      },
    }),
  );

describe("daily limit", () => {
  it("reserves on save, and classify at the limit throws and schedules nothing", async () => {
    const { alice, save, fill, usage, scheduled } = await fixture();
    const first = await save(alice);
    expect((await usage(alice))!.reserved).toBeGreaterThan(0);
    const blocked = await fill(alice);
    const before = await scheduled();
    await expect(
      alice.mutation(api.decisions.classify, {
        itemId: blocked,
        model: "clef-flash",
      }),
    ).rejects.toThrow(/LIMIT_REACHED/);
    expect(await scheduled()).toBe(before);
    expect(first).toBeDefined();
  });

  it("still saves at the limit: failed run, item in the Inbox", async () => {
    const { alice, fill, runsOf } = await fixture();
    const itemId = await fill(alice);
    expect(await runsOf(alice, itemId)).toMatchObject([
      { status: "failed", error: "Daily AI limit reached" },
    ]);
    expect(await alice.query(api.items.get, { id: itemId })).toMatchObject({
      inbox: true,
    });
  });

  it("a burst of saves never holds more than the limit", async () => {
    const { alice, save, usage } = await fixture();
    for (let i = 0; i < 50; i++) await save(alice);
    const row = (await usage(alice))!;
    expect(row.neurons + row.reserved).toBeLessThanOrEqual(LIMIT);
  });

  it("owner A at the limit does not block owner B", async () => {
    const { alice, bob, fill, save, runsOf } = await fixture();
    await fill(alice);
    const itemId = await save(bob);
    expect((await runsOf(bob, itemId))[0]!.status).toBe("pending");
  });

  it("a successful run settles to the real neurons and clears the hold", async () => {
    const { t, alice, save, runsOf, usage } = await fixture();
    const itemId = await save(alice);
    fetchWith((ids) => answers(ids, 650));
    const run = (await runsOf(alice, itemId))[0]!;
    await t.action(internal.clef.run, {
      runId: run._id,
      itemId,
      provider: "clef-flash",
    });
    expect(await usage(alice)).toMatchObject({
      reserved: 0,
      neurons: neuronsFor("clef-flash", 650),
      inputTokens: 650,
      runs: 1,
    });
    const done = (await runsOf(alice, itemId))[0]!;
    expect(done.status).toBe("succeeded");
    expect(done).not.toHaveProperty("reservedNeurons");
  });

  it("a failed run releases the hold and spends nothing", async () => {
    const { t, alice, save, runsOf, usage } = await fixture();
    const itemId = await save(alice);
    fetchWith(() => new Response("{}", { status: 500 }));
    const run = (await runsOf(alice, itemId))[0]!;
    await t.action(internal.clef.run, {
      runId: run._id,
      itemId,
      provider: "clef-flash",
    });
    expect(await usage(alice)).toMatchObject({
      reserved: 0,
      neurons: 0,
      runs: 0,
    });
    expect((await runsOf(alice, itemId))[0]).toMatchObject({
      status: "failed",
    });
  });

  it("settling twice counts once", async () => {
    const { t, alice, save, runsOf, usage } = await fixture();
    const itemId = await save(alice);
    const run = (await runsOf(alice, itemId))[0]!;
    const args = { runId: run._id, itemId, suggestions: [], inputTokens: 650 };
    await t.mutation(internal.decisions.complete, args);
    await expect(
      t.mutation(internal.decisions.complete, args),
    ).rejects.toThrow();
    expect(await usage(alice)).toMatchObject({ runs: 1, reserved: 0 });
  });

  it("a run that never calls the model (no usable labels) is not charged or blocked", async () => {
    const { t, alice, bob, runsOf, usage } = await fixture();
    const carol = t.withIdentity({ subject: "carol" }); // no labels
    const itemId = await carol.mutation(api.items.create, {
      originalInput: "note",
      inputType: "text",
      captureSource: "web",
      captureKey: "c",
    });
    expect((await runsOf(carol, itemId)).length).toBe(0);
    expect(await usage(carol)).toBeNull();
    expect([alice, bob]).toBeDefined();
  });
});

describe("a start that fails after reserving", () => {
  it("releases the hold and leaves no run behind", async () => {
    const { t, alice, usage } = await fixture();
    const itemId = await alice.mutation(api.items.create, {
      originalInput: "A recipe",
      inputType: "text",
      captureSource: "web",
      captureKey: "boom",
    });
    const before = await usage(alice);
    const runsBefore = await t.run(
      async (ctx) => (await ctx.db.query("processingRuns").collect()).length,
    );
    await expect(
      t.run(async (ctx) => {
        const item = (await ctx.db.get(itemId))!;
        const failing = Object.create(ctx);
        failing.scheduler = {
          runAfter: () => {
            throw new Error("scheduler down");
          },
        };
        await startDecisionOrFail(failing, item, "clef-flash");
      }),
    ).rejects.toThrow(/scheduler down/);
    expect((await usage(alice))!.reserved).toBeCloseTo(before!.reserved);
    expect(
      await t.run(
        async (ctx) => (await ctx.db.query("processingRuns").collect()).length,
      ),
    ).toBe(runsBefore);
  });
});
