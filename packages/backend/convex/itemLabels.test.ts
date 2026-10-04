import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const paginationOpts = { numItems: 20, cursor: null };
async function fixture() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  const itemId = await alice.mutation(api.items.create, {
    originalInput: "A recipe",
    inputType: "text",
    captureSource: "web",
    captureKey: "one",
  });
  const otherItemId = await alice.mutation(api.items.create, {
    originalInput: "Another recipe",
    inputType: "text",
    captureSource: "web",
    captureKey: "two",
  });
  const labelId = await alice.mutation(api.labels.create, { name: "Recipes" });
  const secondLabelId = await alice.mutation(api.labels.create, {
    name: "Quick meals",
  });
  const foreignItemId = await bob.mutation(api.items.create, {
    originalInput: "Private",
    inputType: "text",
    captureSource: "web",
    captureKey: "one",
  });
  const foreignLabelId = await bob.mutation(api.labels.create, {
    name: "Private",
  });
  return {
    t,
    alice,
    bob,
    itemId,
    otherItemId,
    labelId,
    secondLabelId,
    foreignItemId,
    foreignLabelId,
  };
}

describe("item-label membership", () => {
  it("bounds joined Item reads even when a reactive page range grows", async () => {
    const { t, alice, labelId } = await fixture();
    const identity = await alice.query(api.identity.current, {});
    for (let i = 0; i < 12; i++) {
      const itemId = await alice.mutation(api.items.create, {
        originalInput: `Item ${i}`,
        inputType: "text",
        captureSource: "web",
        captureKey: `bounded-${i}`,
      });
      await alice.mutation(api.itemLabels.attach, { itemId, labelId });
    }
    const range = await t.run((ctx) =>
      ctx.db
        .query("itemLabels")
        .withIndex("by_owner_label_decision", (q) =>
          q
            .eq("ownerId", identity.ownerId)
            .eq("labelId", labelId)
            .eq("manualDecision", "include"),
        )
        .order("desc")
        .paginate({ numItems: 100, cursor: null }),
    );
    const first = await alice.query(api.itemLabels.listItemsForLabel, {
      labelId,
      paginationOpts: {
        numItems: 1,
        cursor: null,
        endCursor: range.continueCursor,
        maximumRowsRead: 1000,
      },
    });
    expect(first.page.length).toBeLessThanOrEqual(10);
    expect(first.isDone).toBe(false);
    const next = await alice.query(api.itemLabels.listItemsForLabel, {
      labelId,
      paginationOpts: { numItems: 100, cursor: first.continueCursor },
    });
    expect(
      new Set([...first.page, ...next.page].map((item) => item._id)).size,
    ).toBe(12);
  });
  it("supports multiple Labels and navigation in both directions", async () => {
    const { alice, itemId, otherItemId, labelId, secondLabelId } =
      await fixture();
    await alice.mutation(api.itemLabels.attach, { itemId, labelId });
    await alice.mutation(api.itemLabels.attach, {
      itemId,
      labelId: secondLabelId,
    });
    await alice.mutation(api.itemLabels.attach, {
      itemId: otherItemId,
      labelId,
    });
    const labels = await alice.query(api.itemLabels.listForItem, {
      itemId,
      paginationOpts,
    });
    expect(new Set(labels.page.map((label) => label._id))).toEqual(
      new Set([labelId, secondLabelId]),
    );
    const first = await alice.query(api.itemLabels.listItemsForLabel, {
      labelId,
      paginationOpts: { numItems: 1, cursor: null },
    });
    const next = await alice.query(api.itemLabels.listItemsForLabel, {
      labelId,
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
    });
    expect(
      new Set([...first.page, ...next.page].map((item) => item._id)),
    ).toEqual(new Set([itemId, otherItemId]));
    expect(next.isDone).toBe(true);
  });

  it("makes assignments/removals idempotent and keeps a manual exclusion", async () => {
    const { t, alice, itemId, labelId } = await fixture();
    for (let i = 0; i < 2; i++)
      await alice.mutation(api.itemLabels.attach, { itemId, labelId });
    expect(
      await t.run((ctx) => ctx.db.query("itemLabels").take(10)),
    ).toHaveLength(1);
    for (let i = 0; i < 2; i++)
      await alice.mutation(api.itemLabels.remove, { itemId, labelId });
    expect(
      (
        await alice.query(api.itemLabels.listForItem, {
          itemId,
          paginationOpts,
        })
      ).page,
    ).toEqual([]);
    expect(
      (
        await alice.query(api.itemLabels.listItemsForLabel, {
          labelId,
          paginationOpts,
        })
      ).page,
    ).toEqual([]);
    expect(
      await t.run((ctx) => ctx.db.query("itemLabels").take(10)),
    ).toMatchObject([{ manualDecision: "exclude" }]);
    expect(await alice.query(api.items.get, { id: itemId })).toBeDefined();
    await alice.mutation(api.itemLabels.attach, { itemId, labelId });
    expect(
      (
        await alice.query(api.itemLabels.listForItem, {
          itemId,
          paginationOpts,
        })
      ).page,
    ).toHaveLength(1);
  });

  it("refuses mixed-owner links and foreign reads without writes", async () => {
    const { t, alice, bob, itemId, labelId, foreignItemId, foreignLabelId } =
      await fixture();
    for (const operation of [api.itemLabels.attach, api.itemLabels.remove]) {
      await expect(
        alice.mutation(operation, { itemId, labelId: foreignLabelId }),
      ).rejects.toThrow("Not found");
      await expect(
        alice.mutation(operation, { itemId: foreignItemId, labelId }),
      ).rejects.toThrow("Not found");
      await expect(t.mutation(operation, { itemId, labelId })).rejects.toThrow(
        "Authentication required",
      );
    }
    await expect(
      bob.query(api.itemLabels.listForItem, { itemId, paginationOpts }),
    ).rejects.toThrow("Not found");
    await expect(
      bob.query(api.itemLabels.listItemsForLabel, { labelId, paginationOpts }),
    ).rejects.toThrow("Not found");
    await expect(
      bob.query(api.itemLabels.availableLabels, { itemId, paginationOpts }),
    ).rejects.toThrow("Not found");
    for (const operation of [
      api.itemLabels.listForItem,
      api.itemLabels.availableLabels,
    ])
      await expect(
        t.query(operation, { itemId, paginationOpts }),
      ).rejects.toThrow("Authentication required");
    await expect(
      t.query(api.itemLabels.listItemsForLabel, { labelId, paginationOpts }),
    ).rejects.toThrow("Authentication required");
    expect(await t.run((ctx) => ctx.db.query("itemLabels").take(10))).toEqual(
      [],
    );
  });

  it("returns accurate assignment controls with paginated Labels", async () => {
    const { alice, itemId, labelId } = await fixture();
    await alice.mutation(api.itemLabels.attach, { itemId, labelId });
    const page = await alice.query(api.itemLabels.availableLabels, {
      itemId,
      paginationOpts,
    });
    expect(page.page.find((label) => label._id === labelId)?.isAssigned).toBe(
      true,
    );
    expect(page.page.find((label) => label._id !== labelId)?.isAssigned).toBe(
      false,
    );
    await alice.mutation(api.itemLabels.remove, { itemId, labelId });
    expect(
      (
        await alice.query(api.itemLabels.availableLabels, {
          itemId,
          paginationOpts,
        })
      ).page.every((label) => !label.isAssigned),
    ).toBe(true);
  });
});
