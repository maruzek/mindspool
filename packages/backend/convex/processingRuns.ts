import { paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireOwned, requireOwner } from "./auth";
import {
  enrichment,
  labelDoc,
  paginationOptsValidator,
  runDoc,
  runFields,
  suggestion,
  validatePagination,
  validateUrl,
} from "./validators";

function invalid() {
  throw new ConvexError({ code: "INVALID_INPUT", message: "Invalid result" });
}
function bounded(value: string | undefined, limit: number) {
  if (value !== undefined && (!value.trim() || value.length > limit)) invalid();
}
function measurement(value: number | undefined, maximum = Infinity) {
  if (
    value !== undefined &&
    (!Number.isFinite(value) || value < 0 || value > maximum)
  )
    invalid();
}

// Internal workers may run without a user session. Derive ownership from the
// Item; when invoked with a verified identity, require that identity to own it.
async function workerItem(ctx: MutationCtx, itemId: Id<"items">) {
  const identity = await ctx.auth.getUserIdentity();
  const item = await ctx.db.get(itemId);
  if (!item) throw new ConvexError({ code: "NOT_FOUND", message: "Not found" });
  return requireOwned(item, identity?.tokenIdentifier ?? item.ownerId);
}

export const start = internalMutation({
  args: {
    itemId: v.id("items"),
    kind: runFields.kind,
    provider: runFields.provider,
    model: runFields.model,
    modality: runFields.modality,
    questionVersion: v.string(),
    rubricVersion: runFields.rubricVersion,
  },
  returns: v.id("processingRuns"),
  handler: async (ctx, args) => {
    const item = await workerItem(ctx, args.itemId);
    bounded(args.questionVersion, 128);
    bounded(args.rubricVersion, 128);
    bounded(args.model, 128);
    const runId = await ctx.db.insert("processingRuns", {
      ...args,
      ownerId: item.ownerId,
      status: "pending",
      suggestions: [],
    });
    if (args.kind === "enrichment")
      await ctx.db.patch(item._id, {
        pendingEnrichmentRunId: runId,
        enrichmentStatus: "pending",
        updatedAt: Date.now(),
      });
    return runId;
  },
});

const measurements = {
  latencyMs: v.optional(v.number()),
  costUsd: v.optional(v.number()),
};
export const finish = internalMutation({
  args: {
    runId: v.id("processingRuns"),
    itemId: v.id("items"),
    result: v.union(
      v.object({
        status: v.literal("succeeded"),
        suggestions: v.array(suggestion),
        category: v.optional(v.string()),
        rankingScore: v.optional(v.number()),
        enrichment: v.optional(enrichment),
        ...measurements,
      }),
      v.object({
        status: v.literal("failed"),
        error: v.string(),
        ...measurements,
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { runId, itemId, result }) => {
    const item = await workerItem(ctx, itemId);
    const run = requireOwned(await ctx.db.get(runId), item.ownerId);
    if (run.itemId !== itemId)
      throw new ConvexError({ code: "NOT_FOUND", message: "Not found" });
    if (run.status !== "pending")
      throw new ConvexError({
        code: "CONFLICT",
        message: "Run already finished",
      });
    measurement(result.latencyMs);
    measurement(result.costUsd);
    if (result.status === "failed") {
      bounded(result.error, 2000);
      await ctx.db.patch(runId, { ...result, finishedAt: Date.now() });
    } else {
      if (
        result.suggestions.length > 100 ||
        new Set(result.suggestions.map((s) => s.labelId)).size !==
          result.suggestions.length
      )
        invalid();
      for (const suggestion of result.suggestions) {
        measurement(suggestion.confidence, 1);
        requireOwned(await ctx.db.get(suggestion.labelId), item.ownerId);
      }
      bounded(result.category, 128);
      if (
        result.rankingScore !== undefined &&
        !Number.isFinite(result.rankingScore)
      )
        invalid();
      const { enrichment: content, ...record } = result;
      if (content) {
        if (run.kind !== "enrichment") invalid();
        if (content.canonicalUrl) validateUrl(content.canonicalUrl);
        bounded(content.extractedText, 200000);
        for (const value of Object.values(content.sourceMetadata ?? {}))
          bounded(value, 20000);
        if ((content.imageAssets?.length ?? 0) > 20) invalid();
        for (const asset of content.imageAssets ?? []) {
          if (asset.kind === "external") validateUrl(asset.url);
          // Do not expose a storage id from another Item as owned media.
          if (asset.kind === "stored") invalid();
        }
      }
      await ctx.db.patch(runId, { ...record, finishedAt: Date.now() });
      if (content && item.pendingEnrichmentRunId === runId)
        await ctx.db.patch(itemId, content);
    }
    if (run.kind === "enrichment" && item.pendingEnrichmentRunId === runId) {
      await ctx.db.patch(itemId, {
        enrichmentStatus: result.status,
        pendingEnrichmentRunId: undefined,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const listForItem = query({
  args: { itemId: v.id("items"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({ ...runDoc.fields, suggestedLabels: v.array(labelDoc) }),
  ),
  handler: async (ctx, { itemId, paginationOpts }) => {
    const ownerId = await requireOwner(ctx);
    requireOwned(await ctx.db.get(itemId), ownerId);
    validatePagination(paginationOpts);
    const page = await ctx.db
      .query("processingRuns")
      .withIndex("by_owner_item", (q) =>
        q.eq("ownerId", ownerId).eq("itemId", itemId),
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
        page.page.map(async (run) => ({
          ...run,
          suggestedLabels: await Promise.all(
            run.suggestions.map(async (suggestion) =>
              requireOwned(await ctx.db.get(suggestion.labelId), ownerId),
            ),
          ),
        })),
      ),
    };
  },
});
