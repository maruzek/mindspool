import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwner } from "./auth";
import { captureContextFields } from "./validators";
import {
  captureResult,
  closeAttempt,
  ownedCapture,
  result,
} from "./visualCaptureState";
import {
  assertCaptureContext,
  captureContextFingerprint,
  VISUAL_LIMITS,
} from "../../schema/src/visualCapture";

export const begin = mutation({
  args: { context: v.object(captureContextFields) },
  returns: captureResult,
  handler: async (ctx, { context }) => {
    const ownerId = await requireOwner(ctx);
    try {
      assertCaptureContext(context);
    } catch {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Invalid capture context",
      });
    }
    const fingerprint = captureContextFingerprint(context);
    const existing = await ctx.db
      .query("visualCaptures")
      .withIndex("by_owner_key", (q) =>
        q.eq("ownerId", ownerId).eq("captureKey", context.captureKey),
      )
      .unique();
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new ConvexError({
          code: "CONFLICT",
          message: "Capture key already used",
        });
      return result(existing);
    }
    const captureId = await ctx.db.insert("visualCaptures", {
      ownerId,
      captureKey: context.captureKey,
      context,
      fingerprint,
      state: "pending",
      expiresAt: Date.now() + VISUAL_LIMITS.lifetimeMs,
    });
    return { captureId, state: "pending" as const };
  },
});
export const status = query({
  args: { captureId: v.id("visualCaptures") },
  returns: captureResult,
  handler: async (ctx, { captureId }) =>
    result(await ownedCapture(ctx, captureId)),
});
export const cancel = mutation({
  args: { captureId: v.id("visualCaptures") },
  returns: captureResult,
  handler: async (ctx, { captureId }) => {
    const capture = await ownedCapture(ctx, captureId);
    if (capture.state === "complete") return result(capture);
    await closeAttempt(ctx, capture);
    await ctx.db.patch(captureId, { state: "cancelled" });
    return { captureId, state: "cancelled" as const };
  },
});
