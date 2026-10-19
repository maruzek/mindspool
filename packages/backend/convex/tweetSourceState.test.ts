import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { transitionLibraryRole } from "./itemState";
import { modules } from "./test.setup";

it("converts immediately and drains more than one batch of labels and pending runs repeat-safely", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
  try {
    const t = convexTest(schema, modules);
    const a = t.withIdentity({ subject: "alice" });
    const itemId = await a.mutation(api.items.create, {
      inputType: "url",
      originalInput: "https://x.com/a/status/123",
      extractedText: "saved source snapshot",
      captureSource: "extension",
      captureKey: "source",
    });
    // Historical normal tweet fixture predates capture-time pending roles.
    await t.run((ctx) => transitionLibraryRole(ctx, itemId, undefined));
    const resource = await a.mutation(api.items.create, {
      inputType: "text",
      originalInput: "resource",
      captureSource: "web",
      captureKey: "resource",
    });
    for (let n = 0; n < 105; n++) {
      const labelId = await a.mutation(api.labels.create, {
        name: `Label ${n}`,
      });
      await a.mutation(api.itemLabels.attach, { itemId, labelId });
      if (n === 0) {
        const board = await a.mutation(api.boards.open, { labelId });
        await a.mutation(api.boardOperations.apply, {
          boardId: board._id,
          expectedRevision: 0,
          session: "cleanup",
          sequence: 1,
          operations: [
            { type: "place", key: "source", itemId, x: 0, y: 0 },
            { type: "place", key: "resource", itemId: resource, x: 400, y: 0 },
            {
              type: "edge",
              key: "edge",
              data: {
                source: "source",
                target: "resource",
                arrows: "both",
                color: "accent",
                label: "Related",
              },
            },
          ],
        });
      }
      await t.mutation(internal.processingRuns.start, {
        itemId,
        kind: "decision",
        modality: "text",
        questionVersion: "v1",
      });
    }
    const convert = makeFunctionReference<"mutation">(
      "tweetSourceState:convert",
    );
    await t.mutation(convert, { itemId });
    expect(await a.query(api.items.detail, { id: itemId })).toBeNull();
    expect(await a.query(api.items.stats, {})).toMatchObject({ total: 1 });
    await t.mutation(convert, { itemId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      await t.run((ctx) => ctx.db.query("itemLabels").collect()),
    ).toHaveLength(1);
    const runs = await t.run((ctx) => ctx.db.query("processingRuns").collect());
    expect(
      runs.some(
        (run) =>
          run.itemId === itemId &&
          run.kind === "decision" &&
          run.status === "pending",
      ),
    ).toBe(false);
    expect(
      await t.run((ctx) => ctx.db.query("boardConnections").collect()),
    ).toEqual([]);
    expect(
      await t.run((ctx) => ctx.db.query("boardElements").collect()),
    ).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({
      extractedText: "saved source snapshot",
      libraryRole: "tweet_source",
    });
    expect(await a.query(api.items.stats, {})).toMatchObject({ total: 1 });
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
