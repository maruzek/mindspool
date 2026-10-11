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
  // Single-user deploy: when set, only these Clerk user ids (subjects) may use
  // the backend. Unset or empty means no restriction.
  const allowed = (process.env.MINDSPOOL_ALLOWED_SUBJECTS ?? "")
    .split(",")
    .map((subject: string) => subject.trim())
    .filter(Boolean);
  if (allowed.length > 0 && !allowed.includes(identity.subject)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "This account is not approved to use MindSpool",
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
