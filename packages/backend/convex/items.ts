import { cleanupItemBoards } from "./boardState";
import { captureItem, insertCapture } from "./libraryWriters";
import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireOwned, requireOwner } from "./auth";
import { redditCaptureKey, redditPostUrl } from "../../schema/src/reddit";
import {
  mergeRedditCapture,
  prepareRedditCapture,
  redditExtractedText,
  validateRedditItemSize,
} from "./redditCaptureModel";
import { startDecisionOrFail } from "./decisions";
import {
  adjustStats,
  isUnsureLink,
  refreshItemState,
  sourceKindOf,
} from "./itemState";
import type { Doc, Id } from "./_generated/dataModel";
import {
  asset,
  captureSource,
  inputType,
  redditPostInput,
  redditCommentInput,
  itemDetail,
  itemDoc,
  itemPage,
  paginationOptsValidator,
  sourceKind,
  sourceMetadata,
  validateCapture,
  validateClipContent,
  validatePagination,
  validateSearchQuery,
} from "./validators";

export const create = mutation({
  args: {
    originalInput: v.string(),
    inputType,
    captureSource,
    captureKey: v.string(),
    sourceMetadata: sourceMetadata,
    extractedText: v.optional(v.string()),
    imageAssets: v.optional(v.array(asset)),
  },
  returns: v.id("items"),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    return captureItem(ctx, ownerId, args);
  },
});

export const clipReddit = mutation({
  args: { post: redditPostInput, comments: v.array(redditCommentInput) },
  returns: v.object({ itemId: v.id("items"), addedCommentCount: v.number() }),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const now = Date.now();
    const prepared = prepareRedditCapture(args.post, args.comments, now);
    const originalInput = redditPostUrl(prepared.capture.postId);
    const captureKey = redditCaptureKey(prepared.capture.postId);
    const existing = await ctx.db
      .query("items")
      .withIndex("by_owner_capture_key", (q) =>
        q.eq("ownerId", ownerId).eq("captureKey", captureKey),
      )
      .unique();
    if (existing) {
      if (
        existing.originalInput !== originalInput ||
        existing.inputType !== "url" ||
        existing.captureSource !== "extension" ||
        (existing.redditCapture &&
          existing.redditCapture.postId !== prepared.capture.postId)
      ) {
        throw new ConvexError({
          code: "CONFLICT",
          message: "Capture key already used",
        });
      }
      const merged = mergeRedditCapture(
        existing.redditCapture,
        existing.extractedText,
        prepared.capture,
      );
      if (!merged.addedCommentCount)
        return { itemId: existing._id, addedCommentCount: 0 };
      const patch = {
        redditCapture: merged.capture,
        extractedText: redditExtractedText(merged.capture),
        updatedAt: now,
      };
      validateRedditItemSize({ ...existing, ...patch });
      await ctx.db.patch(existing._id, patch);
      await refreshItemState(ctx, existing._id);
      return {
        itemId: existing._id,
        addedCommentCount: merged.addedCommentCount,
      };
    }
    const input = {
      originalInput,
      captureKey,
      inputType: "url" as const,
      captureSource: "extension" as const,
      sourceMetadata: prepared.sourceMetadata,
      imageAssets: prepared.imageAssets,
      redditCapture: prepared.capture,
      extractedText: redditExtractedText(prepared.capture),
    };
    validateRedditItemSize({
      ...input,
      ownerId,
      originalUrl: originalInput,
      captureStatus: "captured",
      enrichmentStatus: "not_started",
      updatedAt: now,
    });
    const itemId = await insertCapture(ctx, ownerId, input);
    return { itemId, addedCommentCount: prepared.capture.comments.length };
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
      ...(item.extractedText ? { extractedText: item.extractedText } : {}),
      ...(item.redditCapture ? { redditCapture: item.redditCapture } : {}),
      ...(item.imageAssets.length ? { imageAssets: item.imageAssets } : {}),
    };
  },
});

const DELETE_BATCH = 100;

/**
 * Removes the item and its counters at once, so it leaves the library
 * immediately however much history it has. The link and run rows go in
 * bounded batches: the first here, the rest by a scheduled continuation.
 */
export const remove = mutation({
  args: { id: v.id("items") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const ownerId = await requireOwner(ctx);
    const item = requireOwned(await ctx.db.get(id), ownerId);
    for (const asset of item.imageAssets)
      if (asset.kind === "stored") await ctx.storage.delete(asset.storageId);
    await ctx.db.delete(id);
    await adjustStats(ctx, ownerId, {
      total: -1,
      inbox: -Number(item.inbox ?? false),
      needsReview: -Number(item.needsReview ?? false),
    });
    await cleanupItemBoards(ctx, ownerId, id);
    await purgeHistory(ctx, ownerId, id);
    return null;
  },
});

/** Deletes one bounded batch of a removed item's links and runs; reschedules itself while rows remain. */
async function purgeHistory(
  ctx: MutationCtx,
  ownerId: string,
  itemId: Id<"items">,
) {
  const links = await ctx.db
    .query("itemLabels")
    .withIndex("by_owner_pair", (q) =>
      q.eq("ownerId", ownerId).eq("itemId", itemId),
    )
    .take(DELETE_BATCH);
  const runs = await ctx.db
    .query("processingRuns")
    .withIndex("by_owner_item", (q) =>
      q.eq("ownerId", ownerId).eq("itemId", itemId),
    )
    .take(DELETE_BATCH);
  for (const row of [...links, ...runs]) await ctx.db.delete(row._id);
  if (links.length === DELETE_BATCH || runs.length === DELETE_BATCH)
    await ctx.scheduler.runAfter(0, internal.items.purgeRemovedItem, {
      ownerId,
      itemId,
    });
}

export const purgeRemovedItem = internalMutation({
  args: { ownerId: v.string(), itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, { ownerId, itemId }) => {
    await purgeHistory(ctx, ownerId, itemId);
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

// A page is normally at most PREVIEW_PAGE_SIZE Items, but a reactive range can
// hold more; all are returned, because the cursor has already moved past them.
// Each reads at most 4 included
// links (the fourth only proves overflow), 3 Label documents and 3 runs.
export async function previewItems(
  ctx: QueryCtx,
  ownerId: string,
  items: Doc<"items">[],
) {
  return Promise.all(
    items.map(async (item) => {
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
