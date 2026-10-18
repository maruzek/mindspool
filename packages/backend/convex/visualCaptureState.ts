import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOwner, requireOwned } from "./auth";
import {
  visualCaptureFields,
  visualCaptureState,
  visualContentType,
} from "./validators";
import { VISUAL_LIMITS } from "../../schema/src/visualCapture";

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

async function activeAttempt(
  ctx: Pick<QueryCtx, "auth" | "db">,
  captureId: Id<"visualCaptures">,
  attemptId: Id<"visualCaptureAttempts">,
) {
  const capture = await ownedCapture(ctx, captureId);
  requireLive(capture);
  const attempt = await ctx.db.get(attemptId);
  if (
    !attempt ||
    attempt.captureId !== captureId ||
    capture.attemptId !== attemptId ||
    attempt.state !== "open" ||
    attempt.expiresAt <= Date.now() ||
    capture.state !== "uploading"
  )
    throw new ConvexError({
      code: "CONFLICT",
      message: "Upload attempt is closed",
    });
  return { capture, attempt };
}
export const registerStaged = internalMutation({
  args: {
    captureId: v.id("visualCaptures"),
    attemptId: v.id("visualCaptureAttempts"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, { captureId, attemptId, storageId }) => {
    const { attempt } = await activeAttempt(ctx, captureId, attemptId);
    const blob = await ctx.db.system.get(storageId);
    if (
      attempt.storageId ||
      !blob ||
      blob.size > VISUAL_LIMITS.bytes ||
      !["image/png", "image/jpeg", "image/webp"].some(
        (type) =>
          blob.contentType === `${type}; mindspool-attempt=${attempt.nonce}`,
      )
    )
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Invalid staged image",
      });
    await ctx.db.patch(attemptId, { storageId });
    return null;
  },
});
export const staged = internalQuery({
  args: {
    captureId: v.id("visualCaptures"),
    attemptId: v.id("visualCaptureAttempts"),
  },
  returns: v.object({
    storageId: v.id("_storage"),
    nonce: v.string(),
    digest: v.string(),
  }),
  handler: async (ctx, { captureId, attemptId }) => {
    const { capture, attempt } = await activeAttempt(ctx, captureId, attemptId);
    if (!attempt.storageId || !capture.digest)
      throw new ConvexError({ code: "CONFLICT", message: "Image not staged" });
    return {
      storageId: attempt.storageId,
      nonce: attempt.nonce,
      digest: capture.digest,
    };
  },
});
export const recordVerified = internalMutation({
  args: {
    captureId: v.id("visualCaptures"),
    attemptId: v.id("visualCaptureAttempts"),
    digest: v.string(),
    width: v.number(),
    height: v.number(),
    bytes: v.number(),
    contentType: visualContentType,
  },
  returns: v.null(),
  handler: async (ctx, { captureId, attemptId, ...decoded }) => {
    const { capture, attempt } = await activeAttempt(ctx, captureId, attemptId);
    if (!attempt.storageId || capture.digest !== decoded.digest)
      throw new ConvexError({
        code: "CONFLICT",
        message: "Capture payload changed",
      });
    await ctx.db.patch(captureId, {
      ...decoded,
      storageId: attempt.storageId,
      state: "verified",
    });
    return null;
  },
});
export const releaseUpload = internalMutation({
  args: {
    captureId: v.id("visualCaptures"),
    attemptId: v.id("visualCaptureAttempts"),
  },
  returns: v.null(),
  handler: async (ctx, { captureId, attemptId }) => {
    const capture = await ownedCapture(ctx, captureId);
    if (capture.attemptId === attemptId && capture.state === "uploading") {
      await closeAttempt(ctx, capture);
      await ctx.db.patch(captureId, { state: "pending" });
    }
    return null;
  },
});
