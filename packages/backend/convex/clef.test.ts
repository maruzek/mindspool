import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const paginationOpts = { numItems: 20, cursor: null };
const TOKEN = "secret-token-123";
const ACCOUNT = "acct-456";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", ACCOUNT);
  vi.stubEnv("CLOUDFLARE_AUTH_TOKEN", TOKEN);
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
  const labels = {
    recipes: await alice.mutation(api.labels.create, {
      name: "Recipes",
      description: "Cooking instructions",
    }),
    news: await alice.mutation(api.labels.create, { name: "News" }),
  };
  await bob.mutation(api.labels.create, { name: "Bob private" });
  const itemId = await alice.mutation(api.items.create, {
    originalInput: "Pasta recipe: boil water",
    inputType: "text",
    captureSource: "web",
    captureKey: "one",
  });
  const runs = async () =>
    (
      await alice.query(api.processingRuns.listForItem, {
        itemId,
        paginationOpts,
      })
    ).page;
  // Run the scheduled action by hand with a controlled fetch.
  const pending = async () =>
    (await runs()).find((r) => r.status === "pending");
  const runPending = async (provider: "clef" | "clef-flash" = "clef-flash") => {
    const run = await pending();
    if (!run) throw new Error("no pending run");
    await t.action(internal.clef.run, { runId: run._id, itemId, provider });
    return (await runs()).find((r) => r._id === run._id)!;
  };
  const attached = async () =>
    (await alice.query(api.itemLabels.listForItem, { itemId, paginationOpts }))
      .page;
  return { t, alice, bob, labels, itemId, runs, runPending, attached };
}

const okBody = (answers: Record<string, number>) => ({
  result: {
    model: "clef-flash",
    answers: Object.fromEntries(
      Object.entries(answers).map(([id, noul]) => [id, { type: "noul", noul }]),
    ),
    usage: { input_tokens: 1000, output_tokens: 0 },
  },
  success: true,
  errors: [],
});
const mockFetch = (
  impl: (url: string, init: RequestInit) => Response | Promise<Response>,
) => {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("clef.run", () => {
  it("sends questions to Workers AI and applies labels at or above 50%", async () => {
    const { labels, runPending, attached } = await fixture();
    const fetchMock = mockFetch(() =>
      json(okBody({ [labels.recipes]: 0.8, [labels.news]: 0.49 })),
    );
    const run = await runPending("clef");
    expect(run).toMatchObject({
      status: "succeeded",
      model: "clef-flash",
      labelsAsked: 2,
      labelsTotal: 2,
      costUsd: expect.closeTo(0.00024, 8),
    });
    expect((await attached()).map((l) => l._id)).toEqual([labels.recipes]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/@cf/cloudflare/clef`,
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body.questions).sort()).toEqual(
      [labels.recipes, labels.news].sort(),
    );
    expect(body.questions[labels.recipes].criteria).toEqual({
      true: "Cooking instructions",
    });
    expect(JSON.stringify(body)).not.toContain("Bob private");
  });

  it("fails the run with a bounded error and leaves labels untouched", async () => {
    const cases: [string, () => Response | Promise<Response>][] = [
      [
        "Provider request failed",
        () => Promise.reject(new Error(`boom ${TOKEN} ${ACCOUNT}`)),
      ],
      ["Provider returned HTTP 500", () => json({ error: TOKEN }, 500)],
      ["Provider returned HTTP 401", () => json({}, 401)],
      ["Provider returned invalid JSON", () => new Response("<html>")],
      [
        "Malformed decision response",
        () => json({ result: { answers: {} }, success: true }),
      ],
    ];
    for (const [message, impl] of cases) {
      const { runPending, attached } = await fixture();
      mockFetch(impl);
      const run = await runPending();
      expect(run.status).toBe("failed");
      expect(run.error).toContain(message);
      expect(run.error).not.toContain(TOKEN);
      expect(run.error).not.toContain(ACCOUNT);
      expect(await attached()).toEqual([]);
    }
  });

  it("fails clearly when credentials are missing, without calling the API", async () => {
    const { runPending } = await fixture();
    vi.stubEnv("CLOUDFLARE_AUTH_TOKEN", "");
    const fetchMock = mockFetch(() => json({}));
    const run = await runPending();
    expect(run).toMatchObject({
      status: "failed",
      error: "Labeling is not configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("succeeds without a call when there are no labels", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    const itemId = await alice.mutation(api.items.create, {
      originalInput: "note",
      inputType: "text",
      captureSource: "web",
      captureKey: "k",
    });
    const fetchMock = mockFetch(() => json({}));
    const runId = await alice.mutation(api.decisions.classify, {
      itemId,
      model: "clef-flash",
    });
    await t.action(internal.clef.run, {
      runId,
      itemId,
      provider: "clef-flash",
    });
    const [run] = (
      await alice.query(api.processingRuns.listForItem, {
        itemId,
        paginationOpts,
      })
    ).page;
    expect(run).toMatchObject({ status: "succeeded", labelsAsked: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not read another owner's item through a mismatched run", async () => {
    const { t, bob, itemId, runs } = await fixture();
    const bobItem = await bob.mutation(api.items.create, {
      originalInput: "bob note",
      inputType: "text",
      captureSource: "web",
      captureKey: "b",
    });
    const fetchMock = mockFetch(() => json({}));
    const [aliceRun] = await runs();
    // Alice's run paired with Bob's item must not send anything.
    await t.action(internal.clef.run, {
      runId: aliceRun!._id,
      itemId: bobItem,
      provider: "clef-flash",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await runs())[0]).toMatchObject({ status: "pending" });
    expect(itemId).toBeDefined();
  });
});

describe("decisions.classify and automatic run", () => {
  it("creates one pending run and rejects a second with CONFLICT", async () => {
    const { alice, itemId, runs } = await fixture();
    // Capture already started the automatic run.
    expect(await runs()).toHaveLength(1);
    await expect(
      alice.mutation(api.decisions.classify, { itemId, model: "clef" }),
    ).rejects.toThrow("already running");
  });

  it("starts a run with the chosen model once the previous one finished", async () => {
    const { alice, itemId, runs, runPending, labels } = await fixture();
    mockFetch(() =>
      json(okBody({ [labels.recipes]: 0.9, [labels.news]: 0.1 })),
    );
    await runPending();
    const runId = await alice.mutation(api.decisions.classify, {
      itemId,
      model: "clef",
    });
    const run = (await runs()).find((r) => r._id === runId);
    expect(run).toMatchObject({
      status: "pending",
      kind: "decision",
      provider: "clef",
      modality: "text",
      labelsAsked: 2,
      labelsTotal: 2,
    });
  });

  it("rejects foreign items and anonymous callers", async () => {
    const { t, bob, itemId } = await fixture();
    await expect(
      bob.mutation(api.decisions.classify, { itemId, model: "clef" }),
    ).rejects.toThrow("Not found");
    await expect(
      t.mutation(api.decisions.classify, { itemId, model: "clef" }),
    ).rejects.toThrow("Authentication required");
  });

  it("schedules the action for the new run", async () => {
    const { t } = await fixture();
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled.map((s) => s.name)).toContain("clef:run");
  });

  it("capture creates no run when the owner has no labels or on a repeated key", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    const capture = () =>
      alice.mutation(api.items.create, {
        originalInput: "note",
        inputType: "text",
        captureSource: "web",
        captureKey: "same",
      });
    const count = () =>
      t.run((ctx) => ctx.db.query("processingRuns").collect());
    await capture();
    expect(await count()).toHaveLength(0);
    await alice.mutation(api.labels.create, { name: "A" });
    await capture(); // idempotent early return, still no run
    expect(await count()).toHaveLength(0);
    await alice.mutation(api.items.create, {
      originalInput: "other",
      inputType: "text",
      captureSource: "web",
      captureKey: "new",
    });
    expect(await count()).toHaveLength(1);
  });
});
