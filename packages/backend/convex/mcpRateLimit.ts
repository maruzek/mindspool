import type { Infer } from "convex/values";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { mcpAdmission, mcpRateScope } from "./mcpValidators";

const WINDOW_MS = 60_000;
const BUCKET_TTL_MS = 2 * WINDOW_MS;
const LIMITS = { ingress: 300, request: 120, write: 30 } as const;
const DEPLOYMENT_KEY = "deployment";

type Scope = Infer<typeof mcpRateScope>;
type Admission = Infer<typeof mcpAdmission>;

/**
 * Fixed UTC-minute windows. A caller can spend a full quota just before and
 * again just after a boundary; the access spec accepts that burst.
 */
function windowOf(now: number) {
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  return {
    windowStart,
    refused: {
      allowed: false as const,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((windowStart + WINDOW_MS - now) / 1000),
      ),
    },
  };
}

async function bucket(
  ctx: MutationCtx,
  scope: Scope,
  key: string,
  windowStart: number,
) {
  return ctx.db
    .query("mcpRateBuckets")
    .withIndex("by_scope_key_window", (q) =>
      q.eq("scope", scope).eq("key", key).eq("windowStart", windowStart),
    )
    .unique();
}

async function consume(
  ctx: MutationCtx,
  scope: Scope,
  key: string,
  windowStart: number,
  existing: Awaited<ReturnType<typeof bucket>>,
) {
  if (existing) await ctx.db.patch(existing._id, { count: existing.count + 1 });
  else
    await ctx.db.insert("mcpRateBuckets", {
      scope,
      key,
      windowStart,
      count: 1,
      expiresAt: windowStart + BUCKET_TTL_MS,
    });
}

// Each admission reads and writes its buckets in one transaction, so Convex OCC
// serializes concurrent callers and no window ever exceeds its quota.

/** Deployment-wide ceiling on token verification attempts, spent before the provider call. */
export const admitIngress = internalMutation({
  args: { now: v.number() },
  returns: mcpAdmission,
  handler: async (ctx, { now }): Promise<Admission> => {
    const { windowStart, refused } = windowOf(now);
    const found = await bucket(ctx, "ingress", DEPLOYMENT_KEY, windowStart);
    if ((found?.count ?? 0) >= LIMITS.ingress) return refused;
    await consume(ctx, "ingress", DEPLOYMENT_KEY, windowStart, found);
    return { allowed: true };
  },
});

/** Per-connection request quota; a write also spends a write admission, all or nothing. */
export const admitConnection = internalMutation({
  args: {
    connectionId: v.id("mcpConnections"),
    isWrite: v.boolean(),
    now: v.number(),
  },
  returns: mcpAdmission,
  handler: async (ctx, { connectionId, isWrite, now }): Promise<Admission> => {
    const { windowStart, refused } = windowOf(now);
    const requests = await bucket(ctx, "request", connectionId, windowStart);
    if ((requests?.count ?? 0) >= LIMITS.request) return refused;
    const writes = isWrite
      ? await bucket(ctx, "write", connectionId, windowStart)
      : null;
    if (isWrite && (writes?.count ?? 0) >= LIMITS.write) return refused;
    await consume(ctx, "request", connectionId, windowStart, requests);
    if (isWrite) await consume(ctx, "write", connectionId, windowStart, writes);
    return { allowed: true };
  },
});
