import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const DAY = 24 * 60 * 60 * 1000;

describe("MCP diagnostics", () => {
  it("stores only the allowed fields with a seven-day expiry", async () => {
    const t = convexTest(schema, modules);
    const connectionId = await t.run((ctx) =>
      ctx.db.insert("mcpConnections", {
        ownerId: "owner",
        subject: "user_sentinel",
        clientId: "https://client.example/metadata.json",
        status: "active",
        allowLabelWrite: false,
        createdAt: 0,
        lastUsedAt: 0,
      }),
    );
    const now = Date.UTC(2026, 9, 17);
    await t.mutation(internal.mcpDiagnostics.recordMcpEvent, {
      requestId: "req-1",
      connectionId,
      tool: "mindspool_connection",
      outcome: "ok",
      durationMs: 42.7,
      now,
    });
    const [row] = await t.run((ctx) =>
      ctx.db.query("mcpDiagnostics").collect(),
    );
    expect(Object.keys(row!).sort()).toEqual([
      "_creationTime",
      "_id",
      "connectionId",
      "durationMs",
      "expiresAt",
      "outcome",
      "requestId",
      "tool",
    ]);
    expect(row).toMatchObject({
      requestId: "req-1",
      connectionId,
      tool: "mindspool_connection",
      outcome: "ok",
      durationMs: 43,
      expiresAt: now + 7 * DAY,
    });
  });

  it("clamps strings and durations", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.mcpDiagnostics.recordMcpEvent, {
      requestId: "r".repeat(500),
      tool: "t".repeat(500),
      outcome: "timeout",
      durationMs: 10 ** 12,
      now: 0,
    });
    await t.mutation(internal.mcpDiagnostics.recordMcpEvent, {
      requestId: "r",
      outcome: "ok",
      durationMs: -5,
      now: 0,
    });
    const rows = await t.run((ctx) => ctx.db.query("mcpDiagnostics").collect());
    expect(rows[0]!.requestId).toHaveLength(64);
    expect(rows[0]!.tool).toHaveLength(64);
    expect(rows[0]!.durationMs).toBe(600_000);
    expect(rows[1]!.durationMs).toBe(0);
  });

  it("rejects fields outside the allowlist", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.mcpDiagnostics.recordMcpEvent, {
        requestId: "r",
        outcome: "ok",
        durationMs: 1,
        now: 0,
        // @ts-expect-error arbitrary payloads are not accepted
        detail: "Bearer sentinel-token",
      }),
    ).rejects.toThrow();
  });
});
