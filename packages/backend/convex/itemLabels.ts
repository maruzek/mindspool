import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireOwned, requireOwner } from "./auth";
import { previewItem } from "./items";
import {
  itemPreview,
  labelDoc,
  paginationOptsValidator,
  validatePagination,
} from "./validators";

const pair = { itemId: v.id("items"), labelId: v.id("labels") };
async function decide(
  ctx: MutationCtx,
  { itemId, labelId }: { itemId: Id<"items">; labelId: Id<"labels"> },
  manualDecision: "include" | "exclude",
) {
  const ownerId = await requireOwner(ctx);
  requireOwned(await ctx.db.get(itemId), ownerId);
  requireOwned(await ctx.db.get(labelId), ownerId);
  const existing = await ctx.db
    .query("itemLabels")
    .withIndex("by_owner_pair", (q) =>
      q.eq("ownerId", ownerId).eq("itemId", itemId).eq("labelId", labelId),
    )
    .unique();
  if (!existing)
    await ctx.db.insert("itemLabels", {
      ownerId,
      itemId,
      labelId,
      manualDecision,
      updatedAt: Date.now(),
    });
  else if (existing.manualDecision !== manualDecision)
    await ctx.db.patch(existing._id, { manualDecision, updatedAt: Date.now() });
  return null;
}
export const attach = mutation({
  args: pair,
  returns: v.null(),
  handler: (ctx, args) => decide(ctx, args, "include"),
});
export const remove = mutation({
  args: pair,
  returns: v.null(),
  handler: (ctx, args) => decide(ctx, args, "exclude"),
});

export const listForItem = query({
  args: { itemId: v.id("items"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(labelDoc),
  handler: async (ctx, { itemId, paginationOpts }) => {
    const ownerId = await requireOwner(ctx);
    requireOwned(await ctx.db.get(itemId), ownerId);
    validatePagination(paginationOpts);
    const page = await ctx.db
      .query("itemLabels")
      .withIndex("by_owner_item_decision", (q) =>
        q
          .eq("ownerId", ownerId)
          .eq("itemId", itemId)
          .eq("manualDecision", "include"),
      )
      .paginate(paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (link) =>
          requireOwned(await ctx.db.get(link.labelId), ownerId),
        ),
      ),
    };
  },
});

export const listItemsForLabel = query({
  args: { labelId: v.id("labels"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(itemPreview),
  handler: async (ctx, { labelId, paginationOpts }) => {
    const ownerId = await requireOwner(ctx);
    requireOwned(await ctx.db.get(labelId), ownerId);
    validatePagination(paginationOpts);
    const page = await ctx.db
      .query("itemLabels")
      .withIndex("by_owner_label_decision", (q) =>
        q
          .eq("ownerId", ownerId)
          .eq("labelId", labelId)
          .eq("manualDecision", "include"),
      )
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(paginationOpts.numItems, 10),
        maximumRowsRead: 10,
      });
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (link) =>
          previewItem(requireOwned(await ctx.db.get(link.itemId), ownerId)),
        ),
      ),
    };
  },
});

// Joining only the requested page keeps checkbox state accurate even when an
// Item's assigned Labels span several pages.
export const availableLabels = query({
  args: { itemId: v.id("items"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({ ...labelDoc.fields, isAssigned: v.boolean() }),
  ),
  handler: async (ctx, { itemId, paginationOpts }) => {
    const ownerId = await requireOwner(ctx);
    requireOwned(await ctx.db.get(itemId), ownerId);
    validatePagination(paginationOpts);
    const page = await ctx.db
      .query("labels")
      .withIndex("by_owner_name", (q) => q.eq("ownerId", ownerId))
      .paginate(paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (label) => {
          const link = await ctx.db
            .query("itemLabels")
            .withIndex("by_owner_pair", (q) =>
              q
                .eq("ownerId", ownerId)
                .eq("itemId", itemId)
                .eq("labelId", label._id),
            )
            .unique();
          return { ...label, isAssigned: link?.manualDecision === "include" };
        }),
      ),
    };
  },
});
