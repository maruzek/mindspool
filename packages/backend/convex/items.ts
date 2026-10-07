import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { requireOwned, requireOwner } from "./auth";
import { startDecisionOrFail } from "./decisions";
import {
  adjustStats,
  isUnsureLink,
  refreshItemState,
  sourceKindOf,
} from "./itemState";
import type { Doc } from "./_generated/dataModel";
import {
  captureSource,
  inputType,
  itemDetail,
  itemDoc,
  itemPage,
  paginationOptsValidator,
  sourceKind,
  validateCapture,
  validatePagination,
  validateSearchQuery,
} from "./validators";

export const create = mutation({
  args: {
    originalInput: v.string(),
    inputType,
    captureSource,
    captureKey: v.string(),
  },
  returns: v.id("items"),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    validateCapture(args);
    const existing = await ctx.db
      .query("items")
      .withIndex("by_owner_capture_key", (q) =>
        q.eq("ownerId", ownerId).eq("captureKey", args.captureKey),
      )
      .unique();
    if (existing) {
      if (
        existing.originalInput !== args.originalInput ||
        existing.inputType !== args.inputType ||
        existing.captureSource !== args.captureSource
      ) {
        throw new ConvexError({
          code: "CONFLICT",
          message: "Capture key already used",
        });
      }
      return existing._id;
    }
    const itemId = await ctx.db.insert("items", {
      ...args,
      ownerId,
      ...(args.inputType === "url" ? { originalUrl: args.originalInput } : {}),
      captureStatus: "captured",
      enrichmentStatus: "not_started",
      imageAssets: [],
      updatedAt: Date.now(),
      sourceKind: sourceKindOf({
        inputType: args.inputType,
        ...(args.inputType === "url"
          ? { originalUrl: args.originalInput }
          : {}),
      }),
    });
    await adjustStats(ctx, ownerId, { total: 1 });
    // Best effort: a labeling problem must never fail the save.
    try {
      const hasLabel = await ctx.db
        .query("labels")
        .withIndex("by_owner_name", (q) => q.eq("ownerId", ownerId))
        .first();
      const item = await ctx.db.get(itemId);
      if (hasLabel && item) await startDecisionOrFail(ctx, item, "clef-flash");
    } catch {
      // Swallowed on purpose.
    }
    // Not best effort: flags and counters must agree with the stored item.
    await refreshItemState(ctx, itemId);
    return itemId;
  },
});

export const get = query({
  args: { id: v.id("items") },
  returns: itemDoc,
  handler: async (ctx, { id }) => {
    const ownerId = await requireOwner(ctx);
    return requireOwned(await ctx.db.get(id), ownerId);
  },
});

/** Foreign, missing, malformed, and deleted ids all read as null, so ids reveal nothing. */
export const detail = query({
  args: { id: v.string() },
  returns: v.union(itemDetail, v.null()),
  handler: async (ctx, { id }) => {
    const ownerId = await requireOwner(ctx);
    const itemId = ctx.db.normalizeId("items", id);
    const item = itemId ? await ctx.db.get(itemId) : null;
    if (!item || item.ownerId !== ownerId) return null;
    return {
      _id: item._id,
      _creationTime: item._creationTime,
      inputType: item.inputType,
      originalInput: item.originalInput,
      ...(item.originalUrl ? { originalUrl: item.originalUrl } : {}),
      ...(item.canonicalUrl ? { canonicalUrl: item.canonicalUrl } : {}),
      captureSource: item.captureSource,
      enrichmentStatus: item.enrichmentStatus,
      ...(item.sourceMetadata ? { sourceMetadata: item.sourceMetadata } : {}),
    };
  },
});

const MAX_LINKS = 500;
const MAX_RUNS = 100;

/** Atomic and capped: refuses before deleting anything when the item has more rows than one transaction should touch. */
export const remove = mutation({
  args: { id: v.id("items") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const ownerId = await requireOwner(ctx);
    const item = requireOwned(await ctx.db.get(id), ownerId);
    const links = await ctx.db
      .query("itemLabels")
      .withIndex("by_owner_pair", (q) =>
        q.eq("ownerId", ownerId).eq("itemId", id),
      )
      .take(MAX_LINKS + 1);
    const runs = await ctx.db
      .query("processingRuns")
      .withIndex("by_owner_item", (q) =>
        q.eq("ownerId", ownerId).eq("itemId", id),
      )
      .take(MAX_RUNS + 1);
    if (links.length > MAX_LINKS || runs.length > MAX_RUNS) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "This item has too much history to delete at once",
      });
    }
    for (const row of [...links, ...runs]) await ctx.db.delete(row._id);
    for (const asset of item.imageAssets)
      if (asset.kind === "stored") await ctx.storage.delete(asset.storageId);
    await ctx.db.delete(id);
    await adjustStats(ctx, ownerId, {
      total: -1,
      inbox: -Number(item.inbox ?? false),
      needsReview: -Number(item.needsReview ?? false),
    });
    return null;
  },
});

/** Optional narrowing shared by browsing and search. `false` and absent both mean "no filter". */
const filterArgs = {
  source: v.optional(sourceKind),
  needsReview: v.optional(v.boolean()),
  inbox: v.optional(v.boolean()),
};

function pageOptions(opts: Infer<typeof paginationOptsValidator>) {
  return {
    ...opts,
    numItems: Math.min(opts.numItems, PREVIEW_PAGE_SIZE),
    maximumBytesRead: 1024 * 1024,
  };
}

/** Needs review implies inbox, so it wins when both are asked for. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator, ...filterArgs },
  returns: itemPage,
  handler: async (ctx, { paginationOpts, source, needsReview, inbox }) => {
    const ownerId = await requireOwner(ctx);
    validatePagination(paginationOpts);
    const opts = pageOptions(paginationOpts);
    const items = ctx.db.query("items");
    const page = await (
      needsReview
        ? source
          ? items.withIndex("by_owner_review_source", (q) =>
              q
                .eq("ownerId", ownerId)
                .eq("needsReview", true)
                .eq("sourceKind", source),
            )
          : items.withIndex("by_owner_review", (q) =>
              q.eq("ownerId", ownerId).eq("needsReview", true),
            )
        : inbox
          ? source
            ? items.withIndex("by_owner_inbox_source", (q) =>
                q
                  .eq("ownerId", ownerId)
                  .eq("inbox", true)
                  .eq("sourceKind", source),
              )
            : items.withIndex("by_owner_inbox", (q) =>
                q.eq("ownerId", ownerId).eq("inbox", true),
              )
          : source
            ? items.withIndex("by_owner_source", (q) =>
                q.eq("ownerId", ownerId).eq("sourceKind", source),
              )
            : items.withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    )
      .order("desc")
      .paginate(opts);
    return {
      ...page,
      page: await previewItems(ctx, ownerId, page.page),
    };
  },
});

/** Full-text search over the owner's items, best match first (Convex ranks the results). */
export const search = query({
  args: {
    query: v.string(),
    paginationOpts: paginationOptsValidator,
    ...filterArgs,
  },
  returns: itemPage,
  handler: async (
    ctx,
    { query: raw, paginationOpts, source, needsReview, inbox },
  ) => {
    const ownerId = await requireOwner(ctx);
    validatePagination(paginationOpts);
    const text = validateSearchQuery(raw);
    const page = await ctx.db
      .query("items")
      .withSearchIndex("search_text", (q) => {
        let found = q.search("searchText", text).eq("ownerId", ownerId);
        if (source) found = found.eq("sourceKind", source);
        if (needsReview) found = found.eq("needsReview", true);
        if (inbox) found = found.eq("inbox", true);
        return found;
      })
      .paginate(pageOptions(paginationOpts));
    return {
      ...page,
      page: await previewItems(ctx, ownerId, page.page),
    };
  },
});

/** Counters for the sidebar badge and library heading; one document, never a scan. */
export const stats = query({
  args: {},
  returns: v.object({
    total: v.number(),
    inbox: v.number(),
    needsReview: v.number(),
  }),
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    const row = await ctx.db
      .query("ownerStats")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    return {
      total: row?.total ?? 0,
      inbox: row?.inbox ?? 0,
      needsReview: row?.needsReview ?? 0,
    };
  },
});

export const PREVIEW_PAGE_SIZE = 10;
const PREVIEW_LABELS = 3;
const PREVIEW_RUNS = 3;

function previewItem(item: Doc<"items">) {
  return {
    _id: item._id,
    _creationTime: item._creationTime,
    inputType: item.inputType,
    originalInput: item.originalInput.slice(0, 160),
    ...(item.sourceMetadata?.title
      ? { sourceMetadata: { title: item.sourceMetadata.title.slice(0, 512) } }
      : {}),
    enrichmentStatus: item.enrichmentStatus,
    captureSource: item.captureSource,
    ...(item.originalUrl
      ? { originalUrl: item.originalUrl.slice(0, 512) }
      : {}),
  };
}

// A page holds at most PREVIEW_PAGE_SIZE Items; each reads at most 4 included
// links (the fourth only proves overflow), 3 Label documents and 3 runs.
export async function previewItems(
  ctx: QueryCtx,
  ownerId: string,
  items: Doc<"items">[],
) {
  return Promise.all(
    items.slice(0, PREVIEW_PAGE_SIZE).map(async (item) => {
      const links = await ctx.db
        .query("itemLabels")
        .withIndex("by_owner_item_decision", (q) =>
          q
            .eq("ownerId", ownerId)
            .eq("itemId", item._id)
            .eq("manualDecision", "include"),
        )
        .take(PREVIEW_LABELS + 1);
      const found = await Promise.all(
        links.slice(0, PREVIEW_LABELS).map(async (link) => ({
          link,
          label: await ctx.db.get(link.labelId),
        })),
      );
      const labels = found.flatMap(({ link, label }) =>
        label && label.ownerId === ownerId
          ? [
              {
                _id: label._id,
                name: label.name,
                ...(isUnsureLink(link) && { unsure: true }),
              },
            ]
          : [],
      );
      const unsureCount = links.filter(isUnsureLink).length;
      // A few recent runs are enough to tell whether labeling is in flight.
      const runs = await ctx.db
        .query("processingRuns")
        .withIndex("by_owner_item", (q) =>
          q.eq("ownerId", ownerId).eq("itemId", item._id),
        )
        .order("desc")
        .take(PREVIEW_RUNS);
      const labeling = runs.some(
        (run) => run.kind === "decision" && run.status === "pending",
      );
      return {
        ...previewItem(item),
        labels,
        labelCount: links.length,
        ...(unsureCount > 0 && { unsureCount }),
        ...(labeling && { labeling }),
      };
    }),
  );
}
