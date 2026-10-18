"use node";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { VISUAL_LIMITS } from "../../schema/src/visualCapture";

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
