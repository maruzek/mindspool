import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("owned Labels", () => {
  it("reuses case-insensitive names for one owner", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    const id = await alice.mutation(api.labels.create, { name: "  Recipes  " });
    expect(await alice.mutation(api.labels.create, { name: "recipes" })).toBe(
      id,
    );
    expect(
      await t
        .withIdentity({ subject: "bob" })
        .mutation(api.labels.create, { name: "Recipes" }),
    ).not.toBe(id);
    const page = await alice.query(api.labels.list, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(page.page).toMatchObject([{ name: "Recipes", _id: id }]);
  });

  it("rejects anonymous access and blank/oversized names", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.labels.create, { name: "Recipes" }),
    ).rejects.toThrow("Authentication required");
    await expect(
      t.query(api.labels.list, {
        paginationOpts: { numItems: 20, cursor: null },
      }),
    ).rejects.toThrow("Authentication required");
    const alice = t.withIdentity({ subject: "alice" });
    for (const name of ["  ", "a".repeat(81)])
      await expect(alice.mutation(api.labels.create, { name })).rejects.toThrow(
        "Invalid label name",
      );
  });

  it("paginates Labels without including another owner's Labels", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    for (const name of ["A", "B", "C"])
      await alice.mutation(api.labels.create, { name });
    await t
      .withIdentity({ subject: "bob" })
      .mutation(api.labels.create, { name: "Other" });
    const first = await alice.query(api.labels.list, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    const next = await alice.query(api.labels.list, {
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect([...first.page, ...next.page].map((label) => label.name)).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(next.isDone).toBe(true);
    await expect(
      alice.query(api.labels.list, {
        paginationOpts: { numItems: 0, cursor: null },
      }),
    ).rejects.toThrow("Page size");
  });
});
