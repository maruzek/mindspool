import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

afterEach(() => vi.unstubAllEnvs());
describe("development examples", () => {
  it("defaults to disabled and requires both opt-in and a dev target", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "alice" });
    vi.stubEnv("MINDSPOOL_ENABLE_DEV_SEED", "");
    expect(await t.query(api.seed.availability, {})).toEqual({
      enabled: false,
    });
    await expect(t.mutation(api.seed.load, {})).rejects.toThrow(
      "Development examples are disabled",
    );
    vi.stubEnv("MINDSPOOL_ENABLE_DEV_SEED", "true");
    vi.stubEnv("MINDSPOOL_ENVIRONMENT", "production");
    expect(await t.query(api.seed.availability, {})).toEqual({
      enabled: false,
    });
    await expect(t.mutation(api.seed.load, {})).rejects.toThrow(
      "Development examples are disabled",
    );
  });

  it("requires authentication for availability and loading", async () => {
    vi.stubEnv("MINDSPOOL_ENABLE_DEV_SEED", "true");
    vi.stubEnv("MINDSPOOL_ENVIRONMENT", "development");
    const t = convexTest(schema, modules);
    await expect(t.query(api.seed.availability, {})).rejects.toThrow(
      "Authentication required",
    );
    await expect(t.mutation(api.seed.load, {})).rejects.toThrow(
      "Authentication required",
    );
  });

  it("loads once per owner and preserves edits on repeated loads", async () => {
    vi.stubEnv("MINDSPOOL_ENABLE_DEV_SEED", "true");
    vi.stubEnv("MINDSPOOL_ENVIRONMENT", "development");
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    const bob = t.withIdentity({ subject: "bob" });
    expect(await alice.query(api.seed.availability, {})).toEqual({
      enabled: true,
    });
    const first = await alice.mutation(api.seed.load, {});
    const items = await alice.query(api.items.list, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(items.page.length).toBeGreaterThanOrEqual(3);
    const details = await Promise.all(
      items.page.map((item) => alice.query(api.items.get, { id: item._id })),
    );
    expect(
      details.some((item) =>
        item.imageAssets.some((asset) => asset.purpose === "screenshot"),
      ),
    ).toBe(true);
    const item = items.page[0]!;
    const labels = await alice.query(api.itemLabels.listForItem, {
      itemId: item._id,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(labels.page.length).toBeGreaterThanOrEqual(2);
    const labelId = labels.page[0]!._id;
    await alice.mutation(api.itemLabels.remove, { itemId: item._id, labelId });
    const second = await alice.mutation(api.seed.load, {});
    expect(second.createdItems).toBe(0);
    expect(
      (
        await alice.query(api.itemLabels.listForItem, {
          itemId: item._id,
          paginationOpts: { numItems: 20, cursor: null },
        })
      ).page.some((label) => label._id === labelId),
    ).toBe(false);
    expect(
      (
        await alice.query(api.items.list, {
          paginationOpts: { numItems: 20, cursor: null },
        })
      ).page,
    ).toHaveLength(first.createdItems);
    expect((await bob.mutation(api.seed.load, {})).createdItems).toBe(
      first.createdItems,
    );
    await expect(bob.query(api.items.get, { id: item._id })).rejects.toThrow(
      "Not found",
    );
  });
});
