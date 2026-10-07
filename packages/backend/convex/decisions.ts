import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireOwned, requireOwner } from "./auth";
import { utcDay } from "./aiBudget";
import { release, reserve, settle } from "./aiUsage";
import {
  LABEL_THRESHOLD,
  QUESTION_VERSION,
  UNSURE_THRESHOLD,
  buildState,
  estimateNeurons,
  hasUsableText,
  neuronsFor,
  selectLabels,
  toQuestions,
} from "./decisionProvider";
import type { ClefProvider } from "./decisionProvider";
import { linkSearchFields, refreshItemState } from "./itemState";
import { finishRun } from "./processingRuns";

export const clefProvider = v.union(v.literal("clef"), v.literal("clef-flash"));
/** Labels scanned per run; the 64 most recent of these are asked about. */
const LABEL_SCAN_LIMIT = 1000;
const PENDING_SCAN_LIMIT = 20;

/** Longer than an action may run (10 minutes), so a run still pending then was lost, not slow. */
const RUN_EXPIRY_MS = 11 * 60 * 1000;

const LIMIT_MESSAGE = "Daily AI limit reached";

async function insertRun(
  ctx: MutationCtx,
  item: Doc<"items">,
  provider: ClefProvider,
  counts: { asked: number; total: number },
  rest: Partial<Doc<"processingRuns">>,
) {
  return ctx.db.insert("processingRuns", {
    ownerId: item.ownerId,
    itemId: item._id,
    kind: "decision",
    status: "pending",
    provider,
    model: provider,
    modality: "text",
    questionVersion: QUESTION_VERSION,
    suggestions: [],
    labelsAsked: counts.asked,
    labelsTotal: counts.total,
    ...rest,
  });
}

async function begin(
  ctx: MutationCtx,
  item: Doc<"items">,
  provider: ClefProvider,
  onLimit: "throw" | "fail",
) {
  const labels = await ctx.db
    .query("labels")
    .withIndex("by_owner_name", (q) => q.eq("ownerId", item.ownerId))
    .take(LABEL_SCAN_LIMIT);
  const { selected, asked, total } = selectLabels(labels);
  const counts = { asked, total };
  // A run with nothing to ask or read never calls the model, so it costs nothing.
  const reservedNeurons =
    selected.length > 0 && hasUsableText(item)
      ? estimateNeurons(provider, buildState(item), toQuestions(selected))
      : undefined;
  if (reservedNeurons !== undefined) {
    try {
      await reserve(ctx, item.ownerId, reservedNeurons);
    } catch (error) {
      if (
        onLimit === "fail" &&
        error instanceof ConvexError &&
        (error.data as { code?: string }).code === "LIMIT_REACHED"
      ) {
        // Saving must never fail: record the refusal on the item instead.
        const runId = await insertRun(ctx, item, provider, counts, {
          status: "failed",
          error: LIMIT_MESSAGE,
          finishedAt: Date.now(),
        });
        await refreshItemState(ctx, item._id);
        return runId;
      }
      throw error;
    }
  }
  let runId: Id<"processingRuns"> | undefined;
  try {
    runId = await insertRun(ctx, item, provider, counts, {
      ...(reservedNeurons !== undefined && { reservedNeurons }),
    });
    await ctx.scheduler.runAfter(0, internal.clef.run, {
      runId,
      itemId: item._id,
      provider,
    });
    await ctx.scheduler.runAfter(RUN_EXPIRY_MS, internal.decisions.expire, {
      runId,
      itemId: item._id,
    });
    await refreshItemState(ctx, item._id);
    return runId;
  } catch (error) {
    // Callers may swallow this (saving never fails), and a caught error does not
    // roll back earlier writes, so undo the hold and the half-started run here.
    if (runId !== undefined) await ctx.db.delete(runId);
    if (reservedNeurons !== undefined)
      await release(ctx, item.ownerId, utcDay(Date.now()), reservedNeurons);
    throw error;
  }
}

/** Start a pending decision run and schedule the action; throws LIMIT_REACHED when the daily budget is spent. */
export function startDecision(
  ctx: MutationCtx,
  item: Doc<"items">,
  provider: ClefProvider,
) {
  return begin(ctx, item, provider, "throw");
}

/** Like `startDecision`, but at the limit it records a failed run instead of throwing (used on save). */
export function startDecisionOrFail(
  ctx: MutationCtx,
  item: Doc<"items">,
  provider: ClefProvider,
) {
  return begin(ctx, item, provider, "fail");
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

/** Fails a run whose action never reported back (terminated, or its final write failed), releasing its budget hold. */
export const expire = internalMutation({
  args: { runId: v.id("processingRuns"), itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, { runId, itemId }) => {
    const run = await ctx.db.get(runId);
    if (!run || run.status !== "pending" || !(await ctx.db.get(itemId)))
      return null;
    await finishRun(ctx, {
      runId,
      itemId,
      result: { status: "failed", error: "Labeling timed out" },
    });
    return null;
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
    /** Real input tokens of the model call; absent when the model was not called. */
    inputTokens: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (
    ctx,
    {
      runId,
      itemId,
      suggestions,
      model,
      labelsAsked,
      labelsTotal,
      inputTokens,
      ...rest
    },
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
    if (run.reservedNeurons !== undefined) {
      // Applied once: the run is no longer pending, and the hold is cleared below.
      const day = utcDay(run._creationTime);
      if (inputTokens === undefined)
        await release(ctx, item.ownerId, day, run.reservedNeurons);
      else
        await settle(
          ctx,
          item.ownerId,
          day,
          run.reservedNeurons,
          neuronsFor(provider, inputTokens),
          inputTokens,
        );
    }
    await ctx.db.patch(runId, {
      reservedNeurons: undefined,
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
