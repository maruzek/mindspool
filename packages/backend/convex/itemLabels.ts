import { isNormalItem } from "./itemVisibility";
import { decideMembership } from "./libraryWriters";
import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Infer } from "convex/values";
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
  await decideMembership(ctx, ownerId, { itemId, labelId }, manualDecision);
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
    const item = requireOwned(await ctx.db.get(itemId), ownerId);
    requireOwned(isNormalItem(item) ? item : null, ownerId);
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

/**
 * Undo of Keep or Remove on a model suggestion: puts the label back as an
 * unconfirmed suggestion with its original attribution. Does nothing unless the
 * link is currently excluded or confirmed, so a stale undo cannot clobber newer edits.
 */
export const restoreSuggestion = mutation({
  args: {
    ...pair,
    confidence: v.number(),
    provider: itemLabelFields.provider,
    model: itemLabelFields.model,
  },
  returns: v.null(),
  handler: async (ctx, { itemId, labelId, confidence, provider, model }) => {
    const ownerId = await requireOwner(ctx);
    const item = requireOwned(await ctx.db.get(itemId), ownerId);
    requireOwned(isNormalItem(item) ? item : null, ownerId);
    requireOwned(await ctx.db.get(labelId), ownerId);
    const link = await ctx.db
      .query("itemLabels")
      .withIndex("by_owner_pair", (q) =>
        q.eq("ownerId", ownerId).eq("itemId", itemId).eq("labelId", labelId),
      )
      .unique();
    if (link?.manualDecision === "exclude")
      await ctx.db.patch(link._id, {
        manualDecision: "include",
        updatedAt: Date.now(),
        origin: "model",
        provider,
        model,
        confidence,
        confirmedAt: undefined,
        ...linkSearchFields(item),
        unsure: true,
      });
    else if (link?.origin === "model" && link.confirmedAt !== undefined)
      await ctx.db.patch(link._id, { confirmedAt: undefined, unsure: true });
    else return null;
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
    validatePagination(paginationOpts);
    // A deleted or foreign item reads as empty so a live subscription
    // outliving the item does not throw.
    const item = await ctx.db.get(itemId);
    if (!item || item.ownerId !== ownerId || !isNormalItem(item))
      return { page: [], isDone: true, continueCursor: "" };
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
    item && item.ownerId === ownerId && isNormalItem(item) ? [item] : [],
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
  handler: async (ctx, args) =>
    listLabelItemsPage(ctx, await requireOwner(ctx), args),
});

type LabelPageArgs = {
  labelId: Id<"labels">;
  paginationOpts: Infer<typeof paginationOptsValidator>;
  source?: Infer<typeof sourceKind>;
  needsReview?: boolean;
};

export async function listLabelItemsPage(
  ctx: QueryCtx,
  ownerId: string,
  { labelId, paginationOpts, source, needsReview }: LabelPageArgs,
) {
  requireOwned(await ctx.db.get(labelId), ownerId);
  validatePagination(paginationOpts);
  const links = ctx.db.query("itemLabels");
  const page = await (
    needsReview
      ? source
        ? links.withIndex("by_owner_role_label_unsure_source", (q) =>
            q
              .eq("ownerId", ownerId)
              .eq("libraryRole", undefined)
              .eq("labelId", labelId)
              .eq("manualDecision", "include")
              .eq("unsure", true)
              .eq("sourceKind", source),
          )
        : links.withIndex("by_owner_role_label_unsure", (q) =>
            q
              .eq("ownerId", ownerId)
              .eq("libraryRole", undefined)
              .eq("labelId", labelId)
              .eq("manualDecision", "include")
              .eq("unsure", true),
          )
      : source
        ? links.withIndex("by_owner_role_label_source", (q) =>
            q
              .eq("ownerId", ownerId)
              .eq("libraryRole", undefined)
              .eq("labelId", labelId)
              .eq("manualDecision", "include")
              .eq("sourceKind", source),
          )
        : links.withIndex("by_owner_role_label_decision", (q) =>
            q
              .eq("ownerId", ownerId)
              .eq("libraryRole", undefined)
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
}

/** Full-text search within one label, best match first; filters are equality-only search filters. */
export const searchItemsForLabel = query({
  args: {
    labelId: v.id("labels"),
    query: v.string(),
    paginationOpts: paginationOptsValidator,
    ...labelFilterArgs,
  },
  returns: paginationResultValidator(itemPreview),
  handler: async (ctx, args) =>
    searchLabelItemsPage(ctx, await requireOwner(ctx), args),
});

export async function searchLabelItemsPage(
  ctx: QueryCtx,
  ownerId: string,
  {
    labelId,
    query: raw,
    paginationOpts,
    source,
    needsReview,
  }: LabelPageArgs & { query: string },
) {
  requireOwned(await ctx.db.get(labelId), ownerId);
  validatePagination(paginationOpts);
  const text = validateSearchQuery(raw);
  const page = await ctx.db
    .query("itemLabels")
    .withSearchIndex("search_link", (q) => {
      let found = q
        .search("searchText", text)
        .eq("ownerId", ownerId)
        .eq("libraryRole", undefined)
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
}

// Search the owner's name index before paginating so the picker finds labels
// beyond its initial page. Join only that page to retain assignment state.
export const availableLabels = query({
  args: {
    itemId: v.id("items"),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({ ...labelDoc.fields, isAssigned: v.boolean() }),
  ),
  handler: async (ctx, { itemId, search, paginationOpts }) => {
    const ownerId = await requireOwner(ctx);
    const item = requireOwned(await ctx.db.get(itemId), ownerId);
    requireOwned(isNormalItem(item) ? item : null, ownerId);
    validatePagination(paginationOpts);
    const prefix = search?.trim().toLowerCase() ?? "";
    const page = await ctx.db
      .query("labels")
      .withIndex("by_owner_name", (q) =>
        prefix
          ? q
              .eq("ownerId", ownerId)
              .gte("normalizedName", prefix)
              .lt("normalizedName", `${prefix}\uffff`)
          : q.eq("ownerId", ownerId),
      )
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
