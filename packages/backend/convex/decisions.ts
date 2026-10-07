import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireOwned, requireOwner } from "./auth";
import {
  LABEL_THRESHOLD,
  QUESTION_VERSION,
  UNSURE_THRESHOLD,
  selectLabels,
} from "./decisionProvider";
import type { ClefProvider } from "./decisionProvider";
import { linkSearchFields, refreshItemState } from "./itemState";
import { finishRun } from "./processingRuns";

export const clefProvider = v.union(v.literal("clef"), v.literal("clef-flash"));
/** Labels scanned per run; the 64 most recent of these are asked about. */
const LABEL_SCAN_LIMIT = 1000;
const PENDING_SCAN_LIMIT = 20;

/** Start a pending decision run for an item and schedule the action. */
export async function startDecision(
  ctx: MutationCtx,
  item: Doc<"items">,
  provider: ClefProvider,
) {
  const labels = await ctx.db
    .query("labels")
    .withIndex("by_owner_name", (q) => q.eq("ownerId", item.ownerId))
    .take(LABEL_SCAN_LIMIT);
  const { asked, total } = selectLabels(labels);
  const runId = await ctx.db.insert("processingRuns", {
    ownerId: item.ownerId,
    itemId: item._id,
    kind: "decision",
    status: "pending",
    provider,
    model: provider,
    modality: "text",
    questionVersion: QUESTION_VERSION,
    suggestions: [],
    labelsAsked: asked,
    labelsTotal: total,
  });
  await ctx.scheduler.runAfter(0, internal.clef.run, {
    runId,
    itemId: item._id,
    provider,
  });
  await refreshItemState(ctx, item._id);
  return runId;
}

export const classify = mutation({
  args: { itemId: v.id("items"), model: clefProvider },
  returns: v.id("processingRuns"),
  handler: async (ctx, { itemId, model }) => {
    const ownerId = await requireOwner(ctx);
    const item = requireOwned(await ctx.db.get(itemId), ownerId);
    const recent = await ctx.db
      .query("processingRuns")
      .withIndex("by_owner_item", (q) =>
        q.eq("ownerId", ownerId).eq("itemId", itemId),
      )
      .order("desc")
      .take(PENDING_SCAN_LIMIT);
    if (recent.some((r) => r.kind === "decision" && r.status === "pending"))
      throw new ConvexError({
        code: "CONFLICT",
        message: "Labeling is already running for this item",
      });
    return startDecision(ctx, item, model);
  },
});

/** What the action may read: the run's own item and that owner's labels only. */
export const input = internalQuery({
  args: { runId: v.id("processingRuns"), itemId: v.id("items") },
  handler: async (ctx, { runId, itemId }) => {
    const item = await ctx.db.get(itemId);
    const run = await ctx.db.get(runId);
    if (!item || !run || run.ownerId !== item.ownerId || run.itemId !== itemId)
      throw new ConvexError({ code: "NOT_FOUND", message: "Not found" });
    const labels = await ctx.db
      .query("labels")
      .withIndex("by_owner_name", (q) => q.eq("ownerId", item.ownerId))
      .take(LABEL_SCAN_LIMIT);
    const { selected, asked, total } = selectLabels(labels);
    return {
      asked,
      total,
      labels: selected.map(({ _id, _creationTime, name, description }) => ({
        _id,
        _creationTime,
        name,
        description,
      })),
      item: {
        originalInput: item.originalInput,
        originalUrl: item.originalUrl,
        canonicalUrl: item.canonicalUrl,
        extractedText: item.extractedText,
        sourceMetadata: item.sourceMetadata,
      },
    };
  },
});

/**
 * Finish a decision run and attach its labels in one transaction, so a run is
 * never "succeeded" without its labels. A label is inserted only where no row
 * exists for the pair: manual include/exclude (including a removed label)
 * always wins, and a re-run never duplicates.
 */
export const complete = internalMutation({
  args: {
    runId: v.id("processingRuns"),
    itemId: v.id("items"),
    /** Labels at or above the threshold, with their probability. */
    suggestions: v.array(
      v.object({ labelId: v.id("labels"), confidence: v.number() }),
    ),
    model: v.optional(v.string()),
    labelsAsked: v.optional(v.number()),
    labelsTotal: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    costUsd: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { runId, itemId, suggestions, model, labelsAsked, labelsTotal, ...rest },
  ) => {
    const { item, run } = await finishRun(ctx, {
      runId,
      itemId,
      result: { status: "succeeded", suggestions, ...rest },
    });
    const provider = run.provider;
    if (
      run.kind !== "decision" ||
      (provider !== "clef" && provider !== "clef-flash") ||
      suggestions.some((s) => s.confidence < LABEL_THRESHOLD)
    )
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Invalid result",
      });
    await ctx.db.patch(runId, {
      ...(model !== undefined && { model }),
      ...(labelsAsked !== undefined && { labelsAsked }),
      ...(labelsTotal !== undefined && { labelsTotal }),
    });
    for (const { labelId, confidence } of suggestions) {
      const existing = await ctx.db
        .query("itemLabels")
        .withIndex("by_owner_pair", (q) =>
          q
            .eq("ownerId", item.ownerId)
            .eq("itemId", itemId)
            .eq("labelId", labelId),
        )
        .unique();
      if (existing) continue;
      await ctx.db.insert("itemLabels", {
        ownerId: item.ownerId,
        itemId,
        labelId,
        manualDecision: "include",
        updatedAt: Date.now(),
        origin: "model",
        provider,
        model: model ?? run.model,
        confidence,
        runId,
        ...linkSearchFields(item),
        unsure: confidence < UNSURE_THRESHOLD,
      });
    }
    await refreshItemState(ctx, itemId);
    return null;
  },
});
