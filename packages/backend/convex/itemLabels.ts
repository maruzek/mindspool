import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOwned, requireOwner } from "./auth";
import { PREVIEW_PAGE_SIZE, previewItems } from "./items";
import { linkSearchFields, refreshItemState } from "./itemState";
import {
  itemLabelFields,
  itemPreview,
  labelDoc,
  paginationOptsValidator,
  sourceKind,
  validatePagination,
  validateSearchQuery,
} from "./validators";

function clampPage<T extends { numItems: number }>(opts: T): T {
  return { ...opts, numItems: Math.min(opts.numItems, PREVIEW_PAGE_SIZE) };
}

const attribution = {
  origin: itemLabelFields.origin,
  provider: itemLabelFields.provider,
  model: itemLabelFields.model,
  confidence: itemLabelFields.confidence,
  confirmedAt: itemLabelFields.confirmedAt,
};
const pair = { itemId: v.id("items"), labelId: v.id("labels") };
async function decide(
  ctx: MutationCtx,
  { itemId, labelId }: { itemId: Id<"items">; labelId: Id<"labels"> },
  manualDecision: "include" | "exclude",
) {
  const ownerId = await requireOwner(ctx);
  const item = requireOwned(await ctx.db.get(itemId), ownerId);
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
      ...linkSearchFields(item),
      unsure: false,
    });
  else if (existing.manualDecision !== manualDecision)
    // A user decision replaces any model attribution on the row.
    await ctx.db.patch(existing._id, {
      manualDecision,
      updatedAt: Date.now(),
      origin: "manual",
      provider: undefined,
      model: undefined,
      confidence: undefined,
      runId: undefined,
      confirmedAt: undefined,
      ...linkSearchFields(item),
      unsure: false,
    });
  await refreshItemState(ctx, itemId);
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

/** Keep: confirms the caller's own model label; attribution is retained. */
export const confirm = mutation({
  args: pair,
  returns: v.null(),
  handler: async (ctx, { itemId, labelId }) => {
    const ownerId = await requireOwner(ctx);
    requireOwned(await ctx.db.get(itemId), ownerId);
    requireOwned(await ctx.db.get(labelId), ownerId);
    const link = await ctx.db
      .query("itemLabels")
      .withIndex("by_owner_pair", (q) =>
        q.eq("ownerId", ownerId).eq("itemId", itemId).eq("labelId", labelId),
      )
      .unique();
    if (
      link?.origin === "model" &&
      link.manualDecision === "include" &&
      link.confirmedAt === undefined
    )
      await ctx.db.patch(link._id, { confirmedAt: Date.now(), unsure: false });
    await refreshItemState(ctx, itemId);
    return null;
  },
});

export const listForItem = query({
  args: { itemId: v.id("items"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({ ...labelDoc.fields, ...attribution }),
  ),
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
      .paginate(clampPage(paginationOpts));
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (link) => ({
          ...requireOwned(await ctx.db.get(link.labelId), ownerId),
          ...(link.origin && { origin: link.origin }),
          ...(link.provider && { provider: link.provider }),
          ...(link.model !== undefined && { model: link.model }),
          ...(link.confidence !== undefined && {
            confidence: link.confidence,
          }),
          ...(link.confirmedAt !== undefined && {
            confirmedAt: link.confirmedAt,
          }),
        })),
      ),
    };
  },
});

/** `false` and absent both mean "no filter". In a label, needs review is this label's own link being unsure. */
const labelFilterArgs = {
  source: v.optional(sourceKind),
  needsReview: v.optional(v.boolean()),
};

async function itemsOfLinks(
  ctx: QueryCtx,
  ownerId: string,
  links: Doc<"itemLabels">[],
) {
  // A deleted item's links are purged in the background; skip any still left.
  const found = await Promise.all(links.map((link) => ctx.db.get(link.itemId)));
  const items = found.flatMap((item) =>
    item ? [requireOwned(item, ownerId)] : [],
  );
  return previewItems(ctx, ownerId, items);
}

export const listItemsForLabel = query({
  args: {
    labelId: v.id("labels"),
    paginationOpts: paginationOptsValidator,
    ...labelFilterArgs,
  },
  returns: paginationResultValidator(itemPreview),
  handler: async (ctx, { labelId, paginationOpts, source, needsReview }) => {
    const ownerId = await requireOwner(ctx);
    requireOwned(await ctx.db.get(labelId), ownerId);
    validatePagination(paginationOpts);
    const links = ctx.db.query("itemLabels");
    const page = await (
      needsReview
        ? source
          ? links.withIndex("by_owner_label_unsure_source", (q) =>
              q
                .eq("ownerId", ownerId)
                .eq("labelId", labelId)
                .eq("manualDecision", "include")
                .eq("unsure", true)
                .eq("sourceKind", source),
            )
          : links.withIndex("by_owner_label_unsure", (q) =>
              q
                .eq("ownerId", ownerId)
                .eq("labelId", labelId)
                .eq("manualDecision", "include")
                .eq("unsure", true),
            )
        : source
          ? links.withIndex("by_owner_label_source", (q) =>
              q
                .eq("ownerId", ownerId)
                .eq("labelId", labelId)
                .eq("manualDecision", "include")
                .eq("sourceKind", source),
            )
          : links.withIndex("by_owner_label_decision", (q) =>
              q
                .eq("ownerId", ownerId)
                .eq("labelId", labelId)
                .eq("manualDecision", "include"),
            )
    )
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(paginationOpts.numItems, PREVIEW_PAGE_SIZE),
        maximumRowsRead: PREVIEW_PAGE_SIZE,
      });
    return { ...page, page: await itemsOfLinks(ctx, ownerId, page.page) };
  },
});

/** Full-text search within one label, best match first; filters are equality-only search filters. */
export const searchItemsForLabel = query({
  args: {
    labelId: v.id("labels"),
    query: v.string(),
    paginationOpts: paginationOptsValidator,
    ...labelFilterArgs,
  },
  returns: paginationResultValidator(itemPreview),
  handler: async (
    ctx,
    { labelId, query: raw, paginationOpts, source, needsReview },
  ) => {
    const ownerId = await requireOwner(ctx);
    requireOwned(await ctx.db.get(labelId), ownerId);
    validatePagination(paginationOpts);
    const text = validateSearchQuery(raw);
    const page = await ctx.db
      .query("itemLabels")
      .withSearchIndex("search_link", (q) => {
        let found = q
          .search("searchText", text)
          .eq("ownerId", ownerId)
          .eq("labelId", labelId)
          .eq("manualDecision", "include");
        if (source) found = found.eq("sourceKind", source);
        if (needsReview) found = found.eq("unsure", true);
        return found;
      })
      .paginate({
        ...paginationOpts,
        numItems: Math.min(paginationOpts.numItems, PREVIEW_PAGE_SIZE),
        maximumRowsRead: PREVIEW_PAGE_SIZE,
      });
    return { ...page, page: await itemsOfLinks(ctx, ownerId, page.page) };
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
      .paginate(clampPage(paginationOpts));
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
