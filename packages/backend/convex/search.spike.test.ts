import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";

// T2 spike: proves the new search indexes accept the queries the spec relies on.
describe("search index spike", () => {
  it("filters by owner and source, paginates, and treats an absent flag as undefined", async () => {
    const t = convexTest(schema, modules);
    const base = {
      captureKey: "k",
      captureSource: "web" as const,
      inputType: "text" as const,
      originalInput: "x",
      captureStatus: "captured" as const,
      enrichmentStatus: "not_started" as const,
      imageAssets: [],
      updatedAt: 0,
    };
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++)
        await ctx.db.insert("items", {
          ...base,
          ownerId: "a",
          captureKey: `a${i}`,
          searchText: `spicy ramen ${i}`,
          sourceKind: i < 3 ? "x" : "web",
          ...(i === 0 ? { needsReview: true } : {}),
        });
      await ctx.db.insert("items", {
        ...base,
        ownerId: "b",
        captureKey: "b",
        searchText: "spicy ramen",
        sourceKind: "x",
      });
    });
    const run = (build: (q: any) => any, numItems = 10) =>
      t.run((ctx) =>
        ctx.db
          .query("items")
          .withSearchIndex("search_text", build)
          .paginate({ numItems, cursor: null }),
      );
    const all = await run((q) =>
      q.search("searchText", "ramen").eq("ownerId", "a"),
    );
    expect(all.page).toHaveLength(5);
    expect(all.page.every((d) => d.ownerId === "a")).toBe(true);
    const x = await run((q) =>
      q.search("searchText", "ramen").eq("ownerId", "a").eq("sourceKind", "x"),
    );
    expect(x.page).toHaveLength(3);
    const review = await run((q) =>
      q
        .search("searchText", "ramen")
        .eq("ownerId", "a")
        .eq("needsReview", true),
    );
    expect(review.page).toHaveLength(1);
    const unflagged = await run((q) =>
      q
        .search("searchText", "ramen")
        .eq("ownerId", "a")
        .eq("needsReview", undefined),
    );
    expect(unflagged.page).toHaveLength(4);
    const first = await run(
      (q) => q.search("searchText", "ram").eq("ownerId", "a"),
      2,
    );
    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);
  });
});
