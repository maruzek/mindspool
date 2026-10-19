import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { isNormalItem, isTweetPending, isTweetSource } from "./itemVisibility";
import { modules } from "./test.setup";

const base = {
  ownerId: "alice",
  captureKey: "legacy",
  captureSource: "web" as const,
  inputType: "text" as const,
  originalInput: "useful resource",
  captureStatus: "captured" as const,
  enrichmentStatus: "not_started" as const,
  imageAssets: [],
  updatedAt: 0,
  searchText: "useful resource",
};

describe("library role storage contract", () => {
  it("indexes legacy normal rows by absent role, including full-text search", async () => {
    const t = convexTest(schema, modules);
    const normal = await t.run(async (ctx) => {
      const id = await ctx.db.insert("items", base);
      for (const libraryRole of ["tweet_pending", "tweet_source"] as const)
        await ctx.db.insert("items", {
          ...base,
          captureKey: libraryRole,
          libraryRole,
        });
      await ctx.db.insert("items", { ...base, ownerId: "bob" });
      return id;
    });
    const indexed = await t.run((ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_owner_role", (q) =>
          q.eq("ownerId", "alice").eq("libraryRole", undefined),
        )
        .paginate({ numItems: 1, cursor: null }),
    );
    expect(indexed.page.map((row) => row._id)).toEqual([normal]);
    expect(indexed.isDone).toBe(true);
    const searched = await t.run((ctx) =>
      ctx.db
        .query("items")
        .withSearchIndex("search_text", (q) =>
          q
            .search("searchText", "resource")
            .eq("ownerId", "alice")
            .eq("libraryRole", undefined),
        )
        .paginate({ numItems: 1, cursor: null }),
    );
    expect(searched.page.map((row) => row._id)).toEqual([normal]);
    expect(searched.isDone).toBe(true);
  });

  it("rejects invalid role spellings without requiring legacy initialization", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.run((ctx) =>
        ctx.db.insert("items", {
          ...base,
          // @ts-expect-error Invalid storage value must also be rejected at runtime.
          libraryRole: "normal",
        }),
      ),
    ).rejects.toThrow();
  });
});

it("distinguishes legacy normal, pending, and source roles", () => {
  expect(isNormalItem({})).toBe(true);
  for (const libraryRole of ["tweet_pending", "tweet_source"] as const) {
    expect(isNormalItem({ libraryRole })).toBe(false);
    expect(isTweetPending({ libraryRole })).toBe(
      libraryRole === "tweet_pending",
    );
    expect(isTweetSource({ libraryRole })).toBe(libraryRole === "tweet_source");
  }
});
