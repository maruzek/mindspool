import { VISUAL_LIMITS } from "../../schema/src/visualCapture";
import { ConvexError } from "convex/values";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireOwner } from "./auth";
import { requireLive, result } from "./visualCaptureState";

/** Check the stream itself; a missing or false Content-Length is not a limit. */
export async function readVisualBody(request: Request): Promise<Uint8Array> {
  if (Number(request.headers.get("Content-Length")) > VISUAL_LIMITS.bytes)
    throw new Error("too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_image");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("upload_timeout")), 10_000);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > VISUAL_LIMITS.bytes) throw new Error("too_large");
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export function rasterContentType(
  bytes: Uint8Array,
): "image/png" | "image/jpeg" | "image/webp" {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value))
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  throw new Error("unsupported_image");
}

export const uploadVisual = httpAction(async (ctx, request) => {
  let captureId: Id<"visualCaptures"> | undefined;
  let attemptId: Id<"visualCaptureAttempts"> | undefined;
  try {
    await requireOwner(ctx);
    const id = new URL(request.url).searchParams.get("captureId");
    if (!id) return Response.json({ error: "not_found" }, { status: 404 });
    captureId = id as Id<"visualCaptures">;
    const capture = await ctx.runQuery(internal.visualCaptureState.inspect, {
      captureId,
    });
    if (!["complete", "verified"].includes(capture.state)) requireLive(capture);
    const bytes = await readVisualBody(request);
    const contentType = rasterContentType(bytes);
    if (
      request.headers.get("Content-Type")?.split(";")[0]?.trim() !== contentType
    )
      throw new Error("unsupported_image");
    const hash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    );
    const digest = Array.from(hash, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    if (capture.digest && capture.digest !== digest)
      throw new ConvexError({
        code: "CONFLICT",
        message: "Capture payload changed",
      });
    if (["complete", "verified"].includes(capture.state))
      return Response.json(result(capture));
    const lease = await ctx.runMutation(
      internal.visualCaptureState.claimUpload,
      { captureId, digest },
    );
    attemptId = lease.attemptId;
    const storageId = await ctx.storage.store(
      new Blob([new Uint8Array(bytes)], {
        type: `${contentType}; mindspool-attempt=${lease.nonce}`,
      }),
    );
    await ctx.runMutation(internal.visualCaptureState.registerStaged, {
      captureId,
      attemptId,
      storageId,
    });
    await ctx.runAction(internal.visualImageDecode.verify, {
      captureId,
      attemptId,
    });
    return Response.json({ captureId, state: "verified" });
  } catch (error) {
    if (captureId && attemptId)
      await ctx
        .runMutation(internal.visualCaptureState.releaseUpload, {
          captureId,
          attemptId,
        })
        .catch(() => {});
    const code =
      error instanceof ConvexError &&
      typeof error.data === "object" &&
      error.data !== null &&
      "code" in error.data
        ? String(error.data.code)
        : "";
    const message = error instanceof Error ? error.message : "";
    const status =
      code === "UNAUTHENTICATED"
        ? 401
        : code === "FORBIDDEN"
          ? 403
          : code === "NOT_FOUND"
            ? 404
            : code === "CONFLICT"
              ? 409
              : message === "too_large"
                ? 413
                : message === "unsupported_image"
                  ? 415
                  : code === "INVALID_IMAGE" ||
                      code === "INVALID_INPUT" ||
                      message === "invalid_image"
                    ? 422
                    : 503;
    const reason =
      status === 401
        ? "signed_out"
        : status === 404
          ? "not_found"
          : status === 409
            ? "conflict"
            : status === 413
              ? "too_large"
              : status === 415 || status === 422
                ? "invalid_image"
                : "network";
    return Response.json({ error: reason }, { status });
  }
});
