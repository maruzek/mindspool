"use node";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { VISUAL_LIMITS } from "../../schema/src/visualCapture";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";

/** Full raster decode, not merely a client claim or header/metadata read. */
export async function decodeRaster(bytes: Uint8Array) {
  if (!bytes.length || bytes.byteLength > VISUAL_LIMITS.bytes)
    throw new Error("too_large");
  const image = sharp(Buffer.from(bytes), {
    animated: true,
    limitInputPixels: VISUAL_LIMITS.pixels,
    failOn: "warning",
  });
  const metadata = await image.metadata();
  const { width, height, format } = metadata;
  if (
    !width ||
    !height ||
    width > VISUAL_LIMITS.edge ||
    height > VISUAL_LIMITS.edge ||
    width * height > VISUAL_LIMITS.pixels ||
    (metadata.pages ?? 1) !== 1 ||
    (metadata.orientation ?? 1) !== 1 ||
    !["png", "jpeg", "webp"].includes(format ?? "")
  )
    throw new Error("invalid_image");
  await image.raw().toBuffer();
  const contentType = `image/${format}` as
    "image/png" | "image/jpeg" | "image/webp";
  return {
    width,
    height,
    contentType,
    bytes: bytes.byteLength,
    digest: createHash("sha256").update(bytes).digest("hex"),
  };
}

export const verify = internalAction({
  args: {
    captureId: v.id("visualCaptures"),
    attemptId: v.id("visualCaptureAttempts"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staged = await ctx.runQuery(internal.visualCaptureState.staged, args);
    const blob = await ctx.storage.get(staged.storageId);
    if (!blob || blob.size > VISUAL_LIMITS.bytes)
      throw new ConvexError({
        code: "INVALID_IMAGE",
        message: "Invalid image",
      });
    const decoded = await decodeRaster(
      new Uint8Array(await blob.arrayBuffer()),
    ).catch(() => {
      throw new ConvexError({
        code: "INVALID_IMAGE",
        message: "Invalid image",
      });
    });
    if (
      decoded.digest !== staged.digest ||
      blob.type !== `${decoded.contentType}; mindspool-attempt=${staged.nonce}`
    )
      throw new ConvexError({
        code: "INVALID_IMAGE",
        message: "Invalid image",
      });
    await ctx.runMutation(internal.visualCaptureState.recordVerified, {
      ...args,
      ...decoded,
    });
    return null;
  },
});
