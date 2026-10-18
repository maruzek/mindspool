import type { Infer } from "convex/values";
import { renderRedditCapture } from "../../../../schema/src/reddit";
import type { itemDetail } from "../../validators";

// The two independently readable text streams of a saved item, and their
// identity. Pure; shared by compact summaries and efficient reads.

export type StreamName = "content" | "userInput";
export type UserInputRelation = "empty" | "content" | "url" | "distinct";

type StreamSource = Pick<
  Infer<typeof itemDetail>,
  "originalInput" | "originalUrl" | "canonicalUrl" | "extractedText"
> &
  Partial<Pick<Infer<typeof itemDetail>, "redditCapture">>;

/** The saved content as full reading renders it: a Reddit capture, else extracted text. */
export function contentOf(row: StreamSource) {
  return row.redditCapture
    ? renderRedditCapture(row.redditCapture)
    : (row.extractedText ?? "");
}

/**
 * Conservative, exact comparison (no trimming or normalizing), so a stream is
 * only called a duplicate when it provably is one.
 */
export function userInputRelation(
  row: StreamSource,
  content = contentOf(row),
): UserInputRelation {
  const input = row.originalInput;
  if (input === "") return "empty";
  if (input === content) return "content";
  if (input === row.originalUrl || input === row.canonicalUrl) return "url";
  return "distinct";
}

export function streamText(row: StreamSource, stream: StreamName) {
  return stream === "content" ? contentOf(row) : row.originalInput;
}

export const VERSION_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Fingerprint of one stream of one item. The domain prefix and item/stream
 * keep tokens from being reused across them; JSON escaping preserves lone
 * surrogates when encoding to UTF-8.
 */
export async function streamVersion(
  itemId: string,
  stream: StreamName,
  text: string,
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify(["mcp-text-v1", itemId, stream, text]),
    ),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
