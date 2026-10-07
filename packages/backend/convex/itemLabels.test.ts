import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
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

describe("item-scoped join clamps", () => {
  it("returns at most 10 rows from listForItem and availableLabels", async () => {
    const { alice, itemId } = await fixture();
    for (let i = 0; i < 12; i++) {
      const id = await alice.mutation(api.labels.create, { name: `Many${i}` });
      await alice.mutation(api.itemLabels.attach, { itemId, labelId: id });
    }
    const opts = { numItems: 100, cursor: null };
    expect(
      (
        await alice.query(api.itemLabels.listForItem, {
          itemId,
          paginationOpts: opts,
        })
      ).page,
    ).toHaveLength(10);
    expect(
      (
        await alice.query(api.itemLabels.availableLabels, {
          itemId,
          paginationOpts: opts,
        })
      ).page,
    ).toHaveLength(10);
  });
});

describe("item previews with labels", () => {
  async function labelled(count: number) {
    const f = await fixture();
    for (let i = 0; i < count; i++) {
      const id = await f.alice.mutation(api.labels.create, { name: `L${i}` });
      await f.alice.mutation(api.itemLabels.attach, {
        itemId: f.itemId,
        labelId: id,
      });
    }
    return f;
  }
  const opts = { numItems: 10, cursor: null };

  it("returns display fields, at most 3 labels and a capped count", async () => {
    const { alice, itemId } = await labelled(5);
    const page = await alice.query(api.items.list, { paginationOpts: opts });
    const row = page.page.find((item) => item._id === itemId)!;
    expect(row).toMatchObject({
      enrichmentStatus: "not_started",
      captureSource: "web",
    });
    expect(row.labels).toHaveLength(3);
    expect(row.labelCount).toBe(4);
    expect(row).not.toHaveProperty("originalUrl");
  });

  it("shows the same preview shape in a label view", async () => {
    const { alice, itemId, labelId } = await fixture();
    await alice.mutation(api.itemLabels.attach, { itemId, labelId });
    const page = await alice.query(api.itemLabels.listItemsForLabel, {
      labelId,
      paginationOpts: opts,
    });
    expect(page.page[0]).toMatchObject({
      _id: itemId,
      labels: [{ _id: labelId, name: "Recipes" }],
      labelCount: 1,
      captureSource: "web",
    });
  });

  it("omits excluded and foreign labels", async () => {
    const { t, alice, itemId, labelId, secondLabelId, foreignLabelId } =
      await fixture();
    await alice.mutation(api.itemLabels.attach, { itemId, labelId });
    await alice.mutation(api.itemLabels.attach, {
      itemId,
      labelId: secondLabelId,
    });
    await alice.mutation(api.itemLabels.remove, {
      itemId,
      labelId: secondLabelId,
    });
    const identity = await alice.query(api.identity.current, {});
    await t.run((ctx) =>
      ctx.db.insert("itemLabels", {
        ownerId: identity.ownerId,
        itemId,
        labelId: foreignLabelId,
        manualDecision: "include",
        updatedAt: 0,
      }),
    );
    const row = (
      await alice.query(api.items.list, { paginationOpts: opts })
    ).page.find((item) => item._id === itemId)!;
    expect(row.labels).toEqual([{ _id: labelId, name: "Recipes" }]);
  });

  it("clamps page size to 10 and truncates previews", async () => {
    const { alice } = await fixture();
    for (let i = 0; i < 12; i++)
      await alice.mutation(api.items.create, {
        originalInput: "x".repeat(300),
        inputType: "text",
        captureSource: "web",
        captureKey: `bulk-${i}`,
      });
    const page = await alice.query(api.items.list, {
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(page.page).toHaveLength(10);
    expect(page.isDone).toBe(false);
    expect(page.page[0]!.originalInput).toHaveLength(160);
  });
});

describe("Keep (confirm) and attribution", () => {
  async function modelLabel() {
    const f = await fixture();
    const runId = await f.t.mutation(internal.processingRuns.start, {
      itemId: f.itemId,
      kind: "decision",
      provider: "clef",
      model: "clef",
      modality: "text",
      questionVersion: "label-noul-v1",
    });
    await f.t.mutation(internal.decisions.complete, {
      runId,
      itemId: f.itemId,
      suggestions: [{ labelId: f.labelId, confidence: 0.55 }],
    });
    const list = async () =>
      (
        await f.alice.query(api.itemLabels.listForItem, {
          itemId: f.itemId,
          paginationOpts,
        })
      ).page;
    return { ...f, list };
  }

  it("Keep sets confirmedAt and retains model attribution", async () => {
    const { alice, itemId, labelId, list } = await modelLabel();
    expect((await list())[0]?.confirmedAt).toBeUndefined();
    await alice.mutation(api.itemLabels.confirm, { itemId, labelId });
    expect((await list())[0]).toMatchObject({
      origin: "model",
      provider: "clef",
      model: "clef",
      confidence: 0.55,
      confirmedAt: expect.any(Number),
    });
  });

  it("Keep is a no-op for manual rows and Not found for foreign ids", async () => {
    const { alice, bob, itemId, secondLabelId, labelId, foreignItemId, list } =
      await modelLabel();
    await alice.mutation(api.itemLabels.attach, {
      itemId,
      labelId: secondLabelId,
    });
    await alice.mutation(api.itemLabels.confirm, {
      itemId,
      labelId: secondLabelId,
    });
    const manual = (await list()).find((l) => l._id === secondLabelId);
    expect(manual?.confirmedAt).toBeUndefined();
    expect(manual?.origin).toBeUndefined();
    await expect(
      bob.mutation(api.itemLabels.confirm, { itemId, labelId }),
    ).rejects.toThrow("Not found");
    await expect(
      alice.mutation(api.itemLabels.confirm, {
        itemId: foreignItemId,
        labelId,
      }),
    ).rejects.toThrow("Not found");
  });

  it("Remove excludes a model label and re-attach is manual", async () => {
    const { alice, itemId, labelId, list } = await modelLabel();
    await alice.mutation(api.itemLabels.remove, { itemId, labelId });
    expect(await list()).toEqual([]);
    await alice.mutation(api.itemLabels.attach, { itemId, labelId });
    const [label] = await list();
    expect(label?.origin).toBe("manual");
    expect(label?.confidence).toBeUndefined();
  });
});
