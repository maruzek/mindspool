import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOwner, requireOwned } from "./auth";
import { visualCaptureFields, visualCaptureState } from "./validators";

export const captureResult = v.object({
  captureId: v.id("visualCaptures"),
  state: visualCaptureState,
  itemId: v.optional(v.id("items")),
});
export function result(capture: Doc<"visualCaptures">) {
  const state =
    capture.expiresAt <= Date.now() &&
    ["pending", "uploading", "verified"].includes(capture.state)
      ? ("expired" as const)
      : capture.state;
  return {
    captureId: capture._id,
    state,
    ...(capture.itemId ? { itemId: capture.itemId } : {}),
  };
}
export async function ownedCapture(
  ctx: Pick<QueryCtx, "auth" | "db">,
  id: Id<"visualCaptures">,
) {
  return requireOwned(await ctx.db.get(id), await requireOwner(ctx));
}
export function requireLive(capture: Doc<"visualCaptures">) {
  if (
    capture.expiresAt <= Date.now() ||
    ["complete", "cancelled", "expired"].includes(capture.state)
  )
    throw new ConvexError({ code: "CONFLICT", message: "Capture is closed" });
}
export async function closeAttempt(
  ctx: MutationCtx,
  capture: Doc<"visualCaptures">,
) {
  if (capture.attemptId) {
    const attempt = await ctx.db.get(capture.attemptId);
    if (attempt?.state === "open")
      await ctx.db.patch(attempt._id, { state: "closed" });
  }
}
export const inspect = internalQuery({
  args: { captureId: v.id("visualCaptures") },
  returns: v.object({
    _id: v.id("visualCaptures"),
    _creationTime: v.number(),
    ...visualCaptureFields,
  }),
  handler: (ctx, { captureId }) => ownedCapture(ctx, captureId),
});
export const claimUpload = internalMutation({
  args: { captureId: v.id("visualCaptures"), digest: v.string() },
  returns: v.object({
    attemptId: v.id("visualCaptureAttempts"),
    nonce: v.string(),
  }),
  handler: async (ctx, { captureId, digest }) => {
    const capture = await ownedCapture(ctx, captureId);
    requireLive(capture);
    if (!/^[0-9a-f]{64}$/.test(digest))
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Invalid digest",
      });
    if (capture.digest && capture.digest !== digest)
      throw new ConvexError({
        code: "CONFLICT",
        message: "Capture payload changed",
      });
    if (capture.state === "verified")
      throw new ConvexError({
        code: "CONFLICT",
        message: "Capture already uploaded",
      });
    const previous = capture.attemptId
      ? await ctx.db.get(capture.attemptId)
      : null;
    if (previous?.state === "open" && previous.expiresAt > Date.now())
      throw new ConvexError({
        code: "CONFLICT",
        message: "Upload in progress",
      });
    await closeAttempt(ctx, capture);
    const nonce = crypto.randomUUID();
    const attemptId = await ctx.db.insert("visualCaptureAttempts", {
      captureId,
      nonce,
      state: "open",
      expiresAt: Math.min(capture.expiresAt, Date.now() + 120_000),
    });
    await ctx.db.patch(captureId, { state: "uploading", digest, attemptId });
    return { attemptId, nonce };
  },
});
