import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
  vi.stubEnv("MINDSPOOL_MCP_ENABLED", "true");
  vi.stubEnv("MINDSPOOL_ENVIRONMENT", "development");
  vi.stubEnv("MINDSPOOL_MCP_RESOURCE_URL", "https://dev.convex.site/mcp");
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://test.clerk.accounts.dev");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("MINDSPOOL_MCP_ALLOWED_CLIENT_IDS", "https://client.example");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function fixture() {
  const t = convexTest(schema, modules);
  const connection = await t.run((ctx) =>
    ctx.db.insert("mcpConnections", {
      ownerId: "https://test.clerk.accounts.dev|user_deleted",
      subject: "user_deleted",
      clientId: "https://client.example",
      status: "revoked",
      allowLabelWrite: false,
      createdAt: 0,
      lastUsedAt: 0,
      revokedAt: 0,
    }),
  );
  return { t, connection };
}

it("cleans at most 100 rows per transaction, drains continuations, and retains tombstones", async () => {
  const { t, connection } = await fixture();
  const now = Date.now();
  await t.run(async (ctx) => {
    for (let i = 0; i < 125; i++)
      await ctx.db.insert("mcpDiagnostics", {
        requestId: String(i),
        connectionId: connection,
        durationMs: 1,
        outcome: "ok",
        expiresAt: now + 10 * 60000,
      });
    await ctx.db.insert("mcpDiagnostics", {
      requestId: "keep",
      durationMs: 1,
      outcome: "ok",
      expiresAt: now + 30 * 60000,
    });
    for (let i = 0; i < 30; i++)
      await ctx.db.insert("mcpRateBuckets", {
        scope: "request",
        key: String(i),
        windowStart: 0,
        count: 1,
        expiresAt: now - 1,
      });
  });
  expect(await t.mutation(internal.mcpMaintenance.cleanupExpired, {})).toEqual({
    deleted: 100,
  });
  expect(
    (await t.run((ctx) => ctx.db.query("mcpDiagnostics").take(200))).length,
  ).toBe(26);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    (await t.run((ctx) => ctx.db.query("mcpDiagnostics").take(200))).map(
      (event) => event.requestId,
    ),
  ).toEqual(["keep"]);
  expect(
    await t.run((ctx) => ctx.db.query("mcpRateBuckets").take(200)),
  ).toEqual([]);
  expect(await t.run((ctx) => ctx.db.get(connection))).not.toBeNull();
});

it.each([500, 401, 429])(
  "does not treat provider status %s as account deletion",
  async (status) => {
    const { t, connection } = await fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status })),
    );
    await expect(
      t.action(internal.mcpMaintenance.purgeDeletedAccount, {
        subject: "user_deleted",
      }),
    ).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.get(connection))).not.toBeNull();
  },
);

it("purges only after a verified missing-user response and leaves disabled accounts intact", async () => {
  const { t, connection } = await fixture();
  await t.run((ctx) =>
    ctx.db.insert("mcpDiagnostics", {
      requestId: "remove",
      connectionId: connection,
      durationMs: 1,
      outcome: "ok",
      expiresAt: Date.now() + 100000,
    }),
  );
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: "user_deleted", banned: true }), {
      status: 200,
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(
    await t.action(internal.mcpMaintenance.purgeDeletedAccount, {
      subject: "user_deleted",
    }),
  ).toEqual({ purged: false });
  expect(await t.run((ctx) => ctx.db.get(connection))).not.toBeNull();
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ errors: [{ code: "resource_not_found" }] }), {
      status: 404,
    }),
  );
  expect(
    await t.action(internal.mcpMaintenance.purgeDeletedAccount, {
      subject: "user_deleted",
    }),
  ).toEqual({ purged: true });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run((ctx) => ctx.db.get(connection))).toBeNull();
  expect(
    await t.run((ctx) => ctx.db.query("mcpDiagnostics").take(100)),
  ).toEqual([]);
});
