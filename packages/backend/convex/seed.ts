import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwner } from "./auth";
import {
  adjustStats,
  linkSearchFields,
  refreshItemState,
  sourceKindOf,
} from "./itemState";
import { examples, sampleRubrics } from "./sampleContent";

function enabled() {
  return (
    process.env.MINDSPOOL_ENVIRONMENT === "development" &&
    process.env.MINDSPOOL_ENABLE_DEV_SEED === "true"
  );
}

export const availability = query({
  args: {},
  returns: v.object({ enabled: v.boolean() }),
  handler: async (ctx) => {
    await requireOwner(ctx);
    return { enabled: enabled() };
  },
});

export const load = mutation({
  args: {},
  returns: v.object({ createdItems: v.number() }),
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    if (!enabled())
      throw new ConvexError({
        code: "DISABLED",
        message: "Development examples are disabled",
      });
    const labelIds = [];
    for (const { name } of sampleRubrics.labels) {
      const normalizedName = name.toLowerCase();
      const existing = await ctx.db
        .query("labels")
        .withIndex("by_owner_name", (q) =>
          q.eq("ownerId", ownerId).eq("normalizedName", normalizedName),
        )
        .unique();
      labelIds.push(
        existing?._id ??
          (await ctx.db.insert("labels", { ownerId, name, normalizedName })),
      );
    }
    let createdItems = 0;
    for (const [index, example] of examples.entries()) {
      const captureKey = `mindspool-dev-sample-v1-${index}`;
      const existing = await ctx.db
        .query("items")
        .withIndex("by_owner_capture_key", (q) =>
          q.eq("ownerId", ownerId).eq("captureKey", captureKey),
        )
        .unique();
      if (existing) continue;
      const now = Date.now();
      const itemId = await ctx.db.insert("items", {
        ownerId,
        captureKey,
        captureSource: "web",
        inputType: example.inputType,
        originalInput: example.originalInput,
        ...(example.inputType === "url"
          ? { originalUrl: example.originalInput }
          : {}),
        captureStatus: "captured",
        enrichmentStatus: "not_started",
        updatedAt: now,
        sourceKind: sourceKindOf(example),
        sourceMetadata: { title: example.title },
        // Illustrative reference only: the seeder does not fetch or upload images.
        imageAssets:
          index === 2
            ? [
                {
                  kind: "external",
                  purpose: "screenshot",
                  url: "https://example.org/screenshot.png",
                },
              ]
            : [],
      });
      await adjustStats(ctx, ownerId, { total: 1 });
      const item = await ctx.db.get(itemId);
      for (const labelId of labelIds) {
        await ctx.db.insert("itemLabels", {
          ownerId,
          itemId,
          labelId,
          manualDecision: "include",
          updatedAt: now,
          ...(item && linkSearchFields(item)),
        });
      }
      // Search text, flags and the inbox counters come from the shared rules.
      await refreshItemState(ctx, itemId);
      createdItems++;
    }
    return { createdItems };
  },
});
