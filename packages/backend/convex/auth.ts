import type { Auth } from "convex/server";
import { ConvexError } from "convex/values";

// https://docs.convex.dev/auth/functions-auth
export async function requireOwner(ctx: { auth: Auth }): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
    });
  }
  return identity.tokenIdentifier;
}

export function requireOwned<T extends { ownerId: string }>(
  document: T | null,
  ownerId: string,
): T {
  if (!document || document.ownerId !== ownerId) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Not found" });
  }
  return document;
}
