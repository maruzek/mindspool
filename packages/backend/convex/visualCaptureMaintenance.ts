import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { closeAttempt } from "./visualCaptureState";

/** Cursor wraparound revisits live candidates; unknown markers are never deleted. */
export const run = internalMutation({
  args: {},
  returns: v.object({
    scanned: v.number(),
    deleted: v.number(),
    expired: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    let expired = 0;
    for (const state of ["pending", "uploading", "verified"] as const) {
      const captures = await ctx.db
        .query("visualCaptures")
        .withIndex("by_state_expiry", (q) =>
          q.eq("state", state).lte("expiresAt", now),
        )
        .take(50);
      for (const capture of captures) {
        await closeAttempt(ctx, capture);
        await ctx.db.patch(capture._id, { state: "expired" });
        expired++;
      }
    }
    const leases = await ctx.db
      .query("visualCaptureAttempts")
      .withIndex("by_state_expiry", (q) =>
        q.eq("state", "open").lte("expiresAt", now),
      )
      .take(50);
    for (const lease of leases) {
      await ctx.db.patch(lease._id, { state: "closed" });
      const capture = await ctx.db.get(lease.captureId);
      if (capture?.attemptId === lease._id && capture.state === "uploading")
        await ctx.db.patch(capture._id, { state: "pending" });
    }
    const scan = await ctx.db
      .query("visualCaptureMaintenance")
      .withIndex("by_key", (q) => q.eq("key", "storage"))
      .unique();
    const page = await ctx.db.system
      .query("_storage")
      .paginate({ numItems: 50, cursor: scan?.cursor ?? null });
    let deleted = 0;
    for (const file of page.page) {
      const nonce = file.contentType?.match(
        /^image\/(?:png|jpeg|webp); mindspool-attempt=([a-f0-9-]{36})$/,
      )?.[1];
      if (!nonce) continue;
      const attempt = await ctx.db
        .query("visualCaptureAttempts")
        .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
        .unique();
      if (!attempt) continue;
      const capture = await ctx.db.get(attempt.captureId);
      if (!capture) continue;
      if (
        capture.state === "complete" &&
        capture.storageId === file._id &&
        attempt.storageId === file._id
      )
        continue;
      if (
        attempt.state === "open" &&
        attempt.expiresAt > now &&
        capture.expiresAt > now &&
        ["uploading", "verified"].includes(capture.state)
      )
        continue;
      // Close before deleting: a concurrent/late decoder cannot finalize this file.
      if (attempt.state === "open")
        await ctx.db.patch(attempt._id, { state: "closed" });
      await ctx.storage.delete(file._id);
      deleted++;
    }
    const cursor = page.isDone ? null : page.continueCursor;
    if (scan) await ctx.db.patch(scan._id, { cursor });
    else
      await ctx.db.insert("visualCaptureMaintenance", {
        key: "storage",
        cursor,
      });
    return { scanned: page.page.length, deleted, expired };
  },
});
