import { VISUAL_LIMITS } from "../../schema/src/visualCapture";

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
