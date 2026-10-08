import { ConvexError } from "convex/values";
import type { ClipArgs } from "./clip";
import type { ClipFailure, ClipResponse } from "./messages";
import { isClipRequest } from "./messages";
import type { ClipRedditArgs } from "./redditClip";

export type ClipClient = {
  setAuth(token: string): void;
  createItem(args: ClipArgs): Promise<string>;
  clipReddit(
    args: ClipRedditArgs,
  ): Promise<{ itemId: string; addedCommentCount: number }>;
};

const CODE_TO_FAILURE: Record<string, ClipFailure> = {
  UNAUTHENTICATED: "signed_out",
  INVALID_INPUT: "invalid",
};

function failureOf(error: unknown): ClipFailure {
  if (error instanceof ConvexError) {
    const code = (error.data as { code?: unknown } | null)?.code;
    return (typeof code === "string" && CODE_TO_FAILURE[code]) || "unknown";
  }
  // `fetch` rejects with a TypeError when the request cannot be made.
  return error instanceof TypeError ? "network" : "unknown";
}

/** Sends a clip to Convex. Replies never carry the tweet, the token or an error message. */
export function createClipHandler(deps: {
  getToken(): Promise<string | null>;
  client: ClipClient;
}) {
  return async (request: unknown): Promise<ClipResponse> => {
    if (!isClipRequest(request)) return { ok: false, reason: "invalid" };
    try {
      const token = await deps.getToken();
      if (!token) return { ok: false, reason: "signed_out" };
      deps.client.setAuth(token);
      if (request.type === "clip-reddit") {
        const result = await deps.client.clipReddit(request.args);
        if (
          !result.itemId ||
          !Number.isInteger(result.addedCommentCount) ||
          result.addedCommentCount < 0
        )
          return { ok: false, reason: "unknown" };
        return {
          ok: true,
          itemId: result.itemId,
          addedCommentCount: result.addedCommentCount,
        };
      }
      const itemId = await deps.client.createItem(request.args);
      return itemId ? { ok: true, itemId } : { ok: false, reason: "unknown" };
    } catch (error) {
      const reason = failureOf(error);
      if (
        request.type === "clip-reddit" &&
        reason === "invalid" &&
        error instanceof ConvexError &&
        (error.data as { hint?: unknown } | null)?.hint === "content_too_large"
      )
        return { ok: false, reason, hint: "content_too_large" };
      return { ok: false, reason };
    }
  };
}
