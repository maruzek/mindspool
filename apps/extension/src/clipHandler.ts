import { ConvexError } from "convex/values";
import type { ClipArgs } from "./clip";
import type { ClipFailure, ClipRequest, ClipResponse } from "./messages";

export type ClipClient = {
  setAuth(token: string): void;
  createItem(args: ClipArgs): Promise<string>;
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
  return async ({ args }: ClipRequest): Promise<ClipResponse> => {
    try {
      const token = await deps.getToken();
      if (!token) return { ok: false, reason: "signed_out" };
      deps.client.setAuth(token);
      return { ok: true, itemId: await deps.client.createItem(args) };
    } catch (error) {
      return { ok: false, reason: failureOf(error) };
    }
  };
}
