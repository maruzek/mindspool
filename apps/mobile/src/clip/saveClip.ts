import { ConvexError } from "convex/values";
import { parseShare } from "../share/parseShare";
import { buildClip, ClipTooLargeError } from "../x/buildClip";
import type { ClipArgs, ClipResult } from "../x/buildClip";
import { resolvePost } from "../x/resolvePost";

export type ClipPreview = {
  host: string;
  title: string;
  excerpt: string;
  image?: string;
};

export type Prepared =
  | { kind: "ready"; clip: ClipResult; preview: ClipPreview }
  | { kind: "unsupported" }
  | { kind: "too_large" };

export type ErrorReason = "network" | "too_large" | "other";

export type Outcome =
  | { kind: "saved" | "link" | "already" }
  | { kind: "unsupported" }
  | { kind: "error"; reason: ErrorReason };

export const SAVE_TIMEOUT_MS = 15_000;

export function previewOf(args: ClipArgs): ClipPreview {
  const text = args.extractedText?.trim() ?? "";
  const first = args.imageAssets?.find((asset) => asset.kind === "external");
  const image = first?.kind === "external" ? first.url : undefined;
  return {
    host: "x.com",
    title: args.sourceMetadata?.title ?? args.originalInput,
    excerpt: text.length > 280 ? `${text.slice(0, 280)}…` : text,
    ...(image ? { image } : {}),
  };
}

/** Turns shared text into the clip to save: parses the link and fetches the post. */
export async function prepareClip(
  shared: string,
  deps: { fetch: typeof fetch },
): Promise<Prepared> {
  const parsed = parseShare(shared);
  if (parsed.kind === "unsupported") return { kind: "unsupported" };
  const post = await resolvePost(parsed.ref, deps);
  try {
    const clip = buildClip(parsed.ref, post);
    return { kind: "ready", clip, preview: previewOf(clip.args) };
  } catch (error) {
    if (error instanceof ClipTooLargeError) return { kind: "too_large" };
    throw error;
  }
}

/** Maps an `items.create` failure; `CONFLICT` means the post is already in the Library. */
export function outcomeOfError(error: unknown): Outcome {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    const code =
      typeof data === "object" && data !== null && "code" in data
        ? data.code
        : undefined;
    if (code === "CONFLICT") return { kind: "already" };
    if (code === "INVALID_INPUT") return { kind: "error", reason: "too_large" };
  }
  if (error instanceof TimeoutError)
    return { kind: "error", reason: "network" };
  return { kind: "error", reason: "other" };
}

class TimeoutError extends Error {}

/**
 * One `items.create` call. Convex queues mutations while offline, so a
 * timeout stands in for "no connection"; a later duplicate is harmless
 * because the capture key makes the save idempotent.
 */
export async function submitClip(
  clip: ClipResult,
  create: (args: ClipArgs) => Promise<unknown>,
  timeoutMs = SAVE_TIMEOUT_MS,
): Promise<Outcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      create(clip.args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError()), timeoutMs);
      }),
    ]);
    return { kind: clip.linkOnly ? "link" : "saved" };
  } catch (error) {
    return outcomeOfError(error);
  } finally {
    clearTimeout(timer);
  }
}

export const ERROR_MESSAGES: Record<ErrorReason, string> = {
  network: "No connection, try again",
  too_large: "This capture is too large to save",
  other: "Something went wrong",
};

/** Parse, fetch and save one share: the whole background flow. */
export async function saveShared(
  shared: string,
  deps: { fetch: typeof fetch; create: (args: ClipArgs) => Promise<unknown> },
): Promise<Outcome> {
  const prepared = await prepareClip(shared, deps);
  if (prepared.kind === "unsupported") return { kind: "unsupported" };
  if (prepared.kind === "too_large")
    return { kind: "error", reason: "too_large" };
  return submitClip(prepared.clip, deps.create);
}

export const OUTCOME_MESSAGES = {
  saved: "Saved to MindSpool",
  link: "Saved the link; the post could not be fetched",
  already: "Already saved",
  unsupported: "Only X posts are supported yet",
} as const;

/** The toast shown when a background share finishes. */
export function messageOf(outcome: Outcome): string {
  return outcome.kind === "error"
    ? ERROR_MESSAGES[outcome.reason]
    : OUTCOME_MESSAGES[outcome.kind];
}
