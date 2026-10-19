import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { transitionLibraryRole } from "./itemState";
import { isTweetSource } from "./itemVisibility";
import { finishRun } from "./processingRuns";

const BATCH = 50;
const phaseValidator = v.union(v.literal("labels"), v.literal("runs"));
type Phase = "labels" | "runs";

/** Visibility changes atomically; cleanup can be resumed or duplicated safely. */
export async function convertTweetSource(
  ctx: MutationCtx,
  itemId: Id<"items">,
) {
  if (!(await ctx.db.get(itemId))) return;
  await transitionLibraryRole(ctx, itemId, "tweet_source");
  const item = (await ctx.db.get(itemId))!;
  await ctx.scheduler.runAfter(0, internal.boardState.cleanup, {
    ownerId: item.ownerId,
    itemId,
  });
  await ctx.scheduler.runAfter(0, internal.tweetSourceState.cleanup, {
    itemId,
    phase: "labels",
    cursor: null,
  });
}

async function cleanupSource(
  ctx: MutationCtx,
  itemId: Id<"items">,
  phase: Phase,
  cursor: string | null,
) {
  const item = await ctx.db.get(itemId);
  if (!item || !isTweetSource(item)) return;
  const opts = {
    numItems: BATCH,
    maximumRowsRead: BATCH,
    maximumBytesRead: 1024 * 1024,
    cursor,
  };
  if (phase === "labels") {
    const page = await ctx.db
      .query("itemLabels")
      .withIndex("by_owner_pair", (q) =>
        q.eq("ownerId", item.ownerId).eq("itemId", itemId),
      )
      .paginate(opts);
    for (const link of page.page) await ctx.db.delete(link._id);
    await ctx.scheduler.runAfter(0, internal.tweetSourceState.cleanup, {
      itemId,
      phase: page.isDone ? "runs" : "labels",
      cursor: page.isDone ? null : page.continueCursor,
    });
  } else {
    const page = await ctx.db
      .query("processingRuns")
      .withIndex("by_owner_item", (q) =>
        q.eq("ownerId", item.ownerId).eq("itemId", itemId),
      )
      .paginate(opts);
    for (const run of page.page)
      if (run.kind === "decision" && run.status === "pending")
        await finishRun(ctx, {
          itemId,
          runId: run._id,
          result: {
            status: "failed",
            error: "Source context is not classified",
          },
        });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.tweetSourceState.cleanup, {
        itemId,
        phase,
        cursor: page.continueCursor,
      });
  }
}

export const convert = internalMutation({
  args: { itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, { itemId }) => {
    await convertTweetSource(ctx, itemId);
    return null;
  },
});
export const cleanup = internalMutation({
  args: {
    itemId: v.id("items"),
    phase: phaseValidator,
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { itemId, phase, cursor }) => {
    await cleanupSource(ctx, itemId, phase, cursor);
    return null;
  },
});
