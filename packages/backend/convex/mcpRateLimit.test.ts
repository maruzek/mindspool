import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

// 43 seconds into a fixed UTC minute: a refusal waits 17 seconds.
const windowStart = Date.UTC(2026, 9, 17, 12, 0, 0);
const now = windowStart + 43_000;

async function setup() {
  const t = convexTest(schema, modules);
  const connection = (ownerId: string) =>
    t.run((ctx) =>
      ctx.db.insert("mcpConnections", {
        ownerId,
        subject: "user_x",
        clientId: "https://client.example/metadata.json",
        status: "active",
        allowLabelWrite: true,
        createdAt: windowStart,
        lastUsedAt: windowStart,
      }),
    );
  return { t, alice: await connection("a"), bob: await connection("b") };
}

type T = Awaited<ReturnType<typeof setup>>["t"];
const admit = (
  t: T,
  connectionId: Id<"mcpConnections">,
  isWrite = false,
  at = now,
) =>
  t.mutation(internal.mcpRateLimit.admitConnection, {
    connectionId,
    isWrite,
    now: at,
  });

async function admitMany(
  t: T,
  connectionId: Id<"mcpConnections">,
  count: number,
  isWrite = false,
) {
  for (let i = 0; i < count; i++) {
    expect(await admit(t, connectionId, isWrite)).toEqual({ allowed: true });
  }
}

describe("MCP admission quotas", () => {
  it("admits 120 requests per connection per minute and refuses the 121st", async () => {
    const { t, alice } = await setup();
    await admitMany(t, alice, 120);
    expect(await admit(t, alice)).toEqual({
      allowed: false,
      retryAfterSeconds: 17,
    });
  });

  it("resets at the next UTC minute", async () => {
    const { t, alice } = await setup();
    await admitMany(t, alice, 120);
    expect(await admit(t, alice, false, windowStart + 59_999)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(await admit(t, alice, false, windowStart + 60_000)).toEqual({
      allowed: true,
    });
  });

  // Fixed windows allow up to twice the quota across a boundary: 120 at
  // 12:00:59 and 120 more at 12:01:00. The spec accepts this burst.
  it("permits a full quota on each side of a window boundary", async () => {
    const { t, alice } = await setup();
    for (let i = 0; i < 120; i++)
      await admit(t, alice, false, windowStart + 59_000);
    for (let i = 0; i < 120; i++)
      expect(await admit(t, alice, false, windowStart + 60_000)).toEqual({
        allowed: true,
      });
  });

  it("admits 30 writes and refuses the 31st without consuming a request", async () => {
    const { t, alice } = await setup();
    await admitMany(t, alice, 30, true);
    expect(await admit(t, alice, true)).toEqual({
      allowed: false,
      retryAfterSeconds: 17,
    });
    // 30 writes used 30 request admissions; 90 remain despite the refusal.
    await admitMany(t, alice, 90);
    expect(await admit(t, alice)).toMatchObject({ allowed: false });
  });

  it("refuses a write when the request quota is spent, without consuming a write", async () => {
    const { t, alice } = await setup();
    await admitMany(t, alice, 120);
    expect(await admit(t, alice, true)).toMatchObject({ allowed: false });
    const buckets = await t.run((ctx) =>
      ctx.db.query("mcpRateBuckets").collect(),
    );
    expect(buckets.find((b) => b.scope === "write")).toBeUndefined();
  });

  it("keeps each connection's bucket separate", async () => {
    const { t, alice, bob } = await setup();
    await admitMany(t, alice, 120);
    expect(await admit(t, bob)).toEqual({ allowed: true });
  });

  it("never exceeds the quota under concurrent calls", async () => {
    const { t, alice } = await setup();
    const results = await Promise.all(
      Array.from({ length: 130 }, () => admit(t, alice)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(120);
  });

  it("admits 300 verification attempts per minute across the deployment", async () => {
    const { t } = await setup();
    for (let i = 0; i < 300; i++)
      expect(
        await t.mutation(internal.mcpRateLimit.admitIngress, { now }),
      ).toEqual({ allowed: true });
    expect(
      await t.mutation(internal.mcpRateLimit.admitIngress, { now }),
    ).toEqual({ allowed: false, retryAfterSeconds: 17 });
    expect(
      await t.mutation(internal.mcpRateLimit.admitIngress, {
        now: windowStart + 60_000,
      }),
    ).toEqual({ allowed: true });
  });

  it("stores only scope, key, window, count and a two-minute expiry", async () => {
    const { t, alice } = await setup();
    await admit(t, alice, true);
    const buckets = await t.run((ctx) =>
      ctx.db.query("mcpRateBuckets").collect(),
    );
    expect(buckets).toHaveLength(2);
    for (const bucket of buckets) {
      expect(Object.keys(bucket).sort()).toEqual([
        "_creationTime",
        "_id",
        "count",
        "expiresAt",
        "key",
        "scope",
        "windowStart",
      ]);
      expect(bucket).toMatchObject({
        key: alice,
        windowStart,
        count: 1,
        expiresAt: windowStart + 120_000,
      });
    }
  });
});
