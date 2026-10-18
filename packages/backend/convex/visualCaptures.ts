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
import { requireLive } from "./visualCaptureState";
import { insertCapture } from "./libraryWriters";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

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

/** Dedicated trusted writer; ordinary items.create retains external-only validation. */
async function insertVisualCapture(
  ctx: MutationCtx,
  capture: Doc<"visualCaptures">,
) {
  requireLive(capture);
  if (
    capture.state !== "verified" ||
    !capture.storageId ||
    !capture.attemptId ||
    !capture.width ||
    !capture.height ||
    !capture.contentType
  )
    throw new ConvexError({ code: "CONFLICT", message: "Image not verified" });
  const attempt = await ctx.db.get(capture.attemptId);
  const file = await ctx.db.system.get(capture.storageId);
  if (
    attempt?.state !== "open" ||
    attempt.captureId !== capture._id ||
    attempt.storageId !== capture.storageId ||
    attempt.expiresAt <= Date.now() ||
    !file ||
    file.size > VISUAL_LIMITS.bytes ||
    file.contentType !==
      `${capture.contentType}; mindspool-attempt=${attempt.nonce}`
  )
    throw new ConvexError({ code: "CONFLICT", message: "Image not verified" });
  const { context } = capture;
  const itemId = await insertCapture(ctx, capture.ownerId, {
    originalInput: context.pageUrl,
    inputType: "url",
    captureKey: capture.captureKey,
    captureSource: "extension",
    ...(context.sourceMetadata
      ? { sourceMetadata: context.sourceMetadata }
      : {}),
    imageAssets: [
      {
        kind: "stored",
        storageId: capture.storageId,
        purpose: context.kind === "image" ? "image" : "screenshot",
      },
    ],
  });
  await ctx.db.patch(itemId, {
    visualCapture: {
      ...context,
      width: capture.width,
      height: capture.height,
      contentType: capture.contentType,
    },
    ...(context.canonicalUrl ? { canonicalUrl: context.canonicalUrl } : {}),
  });
  await ctx.db.patch(attempt._id, { state: "attached" });
  await ctx.db.patch(capture._id, { state: "complete", itemId });
  return itemId;
}
export const finalize = mutation({
  args: { captureId: v.id("visualCaptures") },
  returns: v.object({ itemId: v.id("items") }),
  handler: async (ctx, { captureId }) => {
    const capture = await ownedCapture(ctx, captureId);
    if (capture.state === "complete" && capture.itemId)
      return { itemId: capture.itemId };
    return { itemId: await insertVisualCapture(ctx, capture) };
  },
});
