import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { readMcpConfig } from "./mcp/config";
import { ownerIdForMcpSubject } from "./mcp/auth";

const BATCH = 100;
const RETENTION_MARGIN = 15 * 60 * 1000;

/** Five-minute sweeps plus a fifteen-minute margin keep events below seven days. */
export const cleanupExpired = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const events = await ctx.db
      .query("mcpDiagnostics")
      .withIndex("by_expiry", (q) => q.lte("expiresAt", now + RETENTION_MARGIN))
      .take(BATCH);
    for (const event of events) await ctx.db.delete(event._id);
    const room = BATCH - events.length;
    const buckets = room
      ? await ctx.db
          .query("mcpRateBuckets")
          .withIndex("by_expiry", (q) => q.lte("expiresAt", now))
          .take(room)
      : [];
    for (const bucket of buckets) await ctx.db.delete(bucket._id);
    const deleted = events.length + buckets.length;
    if (deleted === BATCH)
      await ctx.scheduler.runAfter(
        0,
        internal.mcpMaintenance.cleanupExpired,
        {},
      );
    // Revoked connection tombstones have no TTL: refresh grants never expire.
    return { deleted };
  },
});

/** Called only after the action verified provider deletion; drain one connection at a time. */
export const purgeRows = internalMutation({
  args: { ownerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { ownerId }) => {
    const connection = await ctx.db
      .query("mcpConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();
    if (!connection) return null;
    const events = await ctx.db
      .query("mcpDiagnostics")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
      .take(BATCH - 1);
    for (const event of events) await ctx.db.delete(event._id);
    if (events.length < BATCH - 1) await ctx.db.delete(connection._id);
    await ctx.scheduler.runAfter(0, internal.mcpMaintenance.purgeRows, {
      ownerId,
    });
    return null;
  },
});

/** Administrative entry point. Provider faults and disabled accounts never authorize a purge. */
export const purgeDeletedAccount = internalAction({
  args: { subject: v.string() },
  returns: v.object({ purged: v.boolean() }),
  handler: async (ctx, { subject }): Promise<{ purged: boolean }> => {
    const config = readMcpConfig();
    if (!config.enabled || !/^user_[A-Za-z0-9_-]{1,250}$/.test(subject))
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Invalid account",
      });
    let response: Response;
    try {
      response = await fetch(
        `https://api.clerk.com/v1/users/${encodeURIComponent(subject)}`,
        {
          headers: {
            Authorization: `Bearer ${config.clerkSecretKey}`,
            "Clerk-API-Version": "2026-08-20",
          },
          redirect: "error",
          signal: AbortSignal.timeout(5000),
        },
      );
    } catch {
      throw new ConvexError({
        code: "UNAVAILABLE",
        message: "Account verification unavailable",
      });
    }
    if (response.ok) return { purged: false };
    const body: unknown = await response.json().catch(() => null);
    const missing =
      response.status === 404 &&
      body !== null &&
      typeof body === "object" &&
      "errors" in body &&
      Array.isArray(body.errors) &&
      body.errors.some(
        (error: unknown) =>
          error !== null &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "resource_not_found",
      );
    if (!missing)
      throw new ConvexError({
        code: "UNAVAILABLE",
        message: "Account verification unavailable",
      });
    await ctx.runMutation(internal.mcpMaintenance.purgeRows, {
      ownerId: ownerIdForMcpSubject(subject, config.sessionIssuer),
    });
    return { purged: true };
  },
});
