import { convexTest } from "convex-test";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const issuer = "https://first.clerk.accounts.dev";
const clientId = "https://chatgpt.com/oauth/codex/client.json";
const secondClient = "https://claude.ai/oauth/claude-code-client-metadata";
const read = ["mindspool:read"] as const;
const write = ["mindspool:read", "mindspool:labels:write"] as const;
const args = (
  subject = "user_a",
  tokenScopes: readonly (typeof write)[number][] = read,
) => ({ subject, clientId, tokenScopes: [...tokenScopes] });
const createTest = () => {
  const t = convexTest(schema, modules);
  return {
    t,
    alice: t.withIdentity({ issuer, subject: "user_a" }),
    bob: t.withIdentity({ issuer, subject: "user_b" }),
  };
};

describe("durable owner-scoped MCP connections", () => {
  beforeEach(() => {
    vi.stubEnv("MINDSPOOL_MCP_ENABLED", "true");
    vi.stubEnv("MINDSPOOL_ENVIRONMENT", "development");
    vi.stubEnv("MINDSPOOL_MCP_RESOURCE_URL", "https://dev.convex.site/mcp");
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", issuer);
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("MINDSPOOL_MCP_ALLOWED_ORIGINS", "");
    vi.stubEnv(
      "MINDSPOOL_MCP_ALLOWED_CLIENT_IDS",
      `${clientId},${secondClient}`,
    );
    vi.stubEnv("MINDSPOOL_ALLOWED_SUBJECTS", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("creates exactly one read-only connection for overlapping first requests", async () => {
    const { t, alice } = createTest();
    const principals = await Promise.all(
      Array.from({ length: 8 }, () =>
        t.mutation(internal.mcpConnections.authorize, args("user_a", write)),
      ),
    );
    expect(new Set(principals.map((p) => p.connectionId)).size).toBe(1);
    expect(principals[0]).toEqual({
      ownerId: `${issuer}|user_a`,
      subject: "user_a",
      clientId,
      connectionId: expect.any(String),
      scopes: read,
    });
    const result = await alice.query(api.mcpConnections.list, {
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(result.page).toHaveLength(1);
    expect(result.page[0]).toMatchObject({
      status: "active",
      allowLabelWrite: false,
    });
    expect(result.page[0]).not.toHaveProperty("ownerId");
    expect(result.page[0]).not.toHaveProperty("subject");
    expect(result.page[0]).not.toHaveProperty("token");
  });

  it("intersects live token scope and app permission, including immediate downgrade", async () => {
    const { t, alice } = createTest();
    const initial = await t.mutation(
      internal.mcpConnections.authorize,
      args("user_a", write),
    );
    const connectionId = initial.connectionId as Id<"mcpConnections">;
    expect(initial.scopes).not.toContain("mindspool:labels:write");
    await alice.mutation(api.mcpConnections.setLabelWrite, {
      connectionId,
      enabled: true,
    });
    await alice.mutation(api.mcpConnections.setLabelWrite, {
      connectionId,
      enabled: true,
    });
    expect(
      (await t.mutation(internal.mcpConnections.authorize, args())).scopes,
    ).toEqual(read);
    expect(
      (
        await t.mutation(
          internal.mcpConnections.authorize,
          args("user_a", write),
        )
      ).scopes,
    ).toEqual(write);
    await alice.mutation(api.mcpConnections.setLabelWrite, {
      connectionId,
      enabled: false,
    });
    expect(
      (
        await t.mutation(
          internal.mcpConnections.authorize,
          args("user_a", write),
        )
      ).scopes,
    ).toEqual(read);
    expect(await t.run((ctx) => ctx.db.get(connectionId))).toMatchObject({
      allowLabelWrite: false,
    });
  });

  it("keeps a durable tombstone across retries; explicit reconnect resets write permission", async () => {
    const { t, alice } = createTest();
    const principal = await t.mutation(
      internal.mcpConnections.authorize,
      args(),
    );
    const connectionId = principal.connectionId as Id<"mcpConnections">;
    await alice.mutation(api.mcpConnections.setLabelWrite, {
      connectionId,
      enabled: true,
    });
    await alice.mutation(api.mcpConnections.disconnect, { connectionId });
    const revoked = await t.run((ctx) => ctx.db.get(connectionId));
    await alice.mutation(api.mcpConnections.disconnect, { connectionId });
    expect(await t.run((ctx) => ctx.db.get(connectionId))).toEqual(revoked);
    for (const scopes of [read, write])
      await expect(
        t.mutation(internal.mcpConnections.authorize, args("user_a", scopes)),
      ).rejects.toThrow("FORBIDDEN");
    await expect(
      alice.mutation(api.mcpConnections.setLabelWrite, {
        connectionId,
        enabled: true,
      }),
    ).rejects.toThrow("FORBIDDEN");
    await alice.mutation(api.mcpConnections.reconnect, { connectionId });
    expect(
      (
        await t.mutation(
          internal.mcpConnections.authorize,
          args("user_a", write),
        )
      ).scopes,
    ).toEqual(read);
    const reconnected = await t.run((ctx) => ctx.db.get(connectionId));
    expect(reconnected).toMatchObject({
      status: "active",
      allowLabelWrite: false,
    });
    expect(reconnected).not.toHaveProperty("revokedAt");
  });

  it("revocation remains authoritative after overlapping authorization", async () => {
    const { t, alice } = createTest();
    const principal = await t.mutation(
      internal.mcpConnections.authorize,
      args(),
    );
    const connectionId = principal.connectionId as Id<"mcpConnections">;
    await Promise.allSettled([
      t.mutation(internal.mcpConnections.authorize, args()),
      alice.mutation(api.mcpConnections.disconnect, { connectionId }),
      t.mutation(internal.mcpConnections.authorize, args()),
    ]);
    await expect(
      t.mutation(internal.mcpConnections.authorize, args()),
    ).rejects.toThrow("FORBIDDEN");
    expect(await t.run((ctx) => ctx.db.get(connectionId))).toMatchObject({
      status: "revoked",
    });
  });

  it("separates owners and clients and refuses foreign/anonymous controls", async () => {
    const { t, alice, bob } = createTest();
    const first = await t.mutation(internal.mcpConnections.authorize, args());
    const other = await t.mutation(
      internal.mcpConnections.authorize,
      args("user_b"),
    );
    const anotherClient = await t.mutation(internal.mcpConnections.authorize, {
      ...args(),
      clientId: secondClient,
    });
    expect(
      new Set([
        first.connectionId,
        other.connectionId,
        anotherClient.connectionId,
      ]).size,
    ).toBe(3);
    const connectionId = first.connectionId as Id<"mcpConnections">;
    for (const actor of [t, bob]) {
      const message = actor === t ? "Authentication required" : "Not found";
      await expect(
        actor.mutation(api.mcpConnections.disconnect, { connectionId }),
      ).rejects.toThrow(message);
      await expect(
        actor.mutation(api.mcpConnections.reconnect, { connectionId }),
      ).rejects.toThrow(message);
      await expect(
        actor.mutation(api.mcpConnections.setLabelWrite, {
          connectionId,
          enabled: true,
        }),
      ).rejects.toThrow(message);
    }
    expect(
      (
        await alice.query(api.mcpConnections.list, {
          paginationOpts: { numItems: 10, cursor: null },
        })
      ).page,
    ).toHaveLength(2);
    expect(
      (
        await bob.query(api.mcpConnections.list, {
          paginationOpts: { numItems: 10, cursor: null },
        })
      ).page,
    ).toHaveLength(1);
    const foreignIssuer = t.withIdentity({
      issuer: "https://other.clerk.accounts.dev",
      subject: "user_a",
    });
    await expect(
      foreignIssuer.mutation(api.mcpConnections.disconnect, { connectionId }),
    ).rejects.toThrow("Not found");
  });

  it("requires valid read scope/client/account before creating any record", async () => {
    const { t, alice } = createTest();
    await expect(
      t.mutation(internal.mcpConnections.authorize, args("user_a", [])),
    ).rejects.toThrow("INSUFFICIENT_SCOPE");
    await expect(
      t.mutation(internal.mcpConnections.authorize, {
        ...args(),
        clientId: "foreign-client",
      }),
    ).rejects.toThrow("FORBIDDEN");
    vi.stubEnv("MINDSPOOL_ALLOWED_SUBJECTS", "user_b");
    await expect(
      t.mutation(internal.mcpConnections.authorize, args()),
    ).rejects.toThrow("FORBIDDEN");
    vi.stubEnv("MINDSPOOL_ALLOWED_SUBJECTS", "");
    expect(
      (
        await alice.query(api.mcpConnections.list, {
          paginationOpts: { numItems: 10, cursor: null },
        })
      ).page,
    ).toEqual([]);
  });

  it("throttles only last-used writes to one per minute", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const { t } = createTest();
    const initial = await t.mutation(internal.mcpConnections.authorize, args());
    const id = initial.connectionId as Id<"mcpConnections">;
    const first = await t.run((ctx) => ctx.db.get(id));
    vi.setSystemTime(Date.now() + 59_999);
    await t.mutation(internal.mcpConnections.authorize, args());
    expect((await t.run((ctx) => ctx.db.get(id)))?.lastUsedAt).toBe(
      first?.lastUsedAt,
    );
    vi.setSystemTime(Date.now() + 1);
    await t.mutation(internal.mcpConnections.authorize, args());
    expect((await t.run((ctx) => ctx.db.get(id)))?.lastUsedAt).toBe(Date.now());
  });

  it("paginates at most ten safe summaries and retains controls when MCP is disabled", async () => {
    const { t, alice } = createTest();
    for (let n = 0; n < 12; n++)
      await t.run((ctx) =>
        ctx.db.insert("mcpConnections", {
          ownerId: `${issuer}|user_a`,
          subject: "user_a",
          clientId: `fixture_${n}`,
          status: "active",
          allowLabelWrite: false,
          createdAt: n,
          lastUsedAt: n,
        }),
      );
    const first = await alice.query(api.mcpConnections.list, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    const next = await alice.query(api.mcpConnections.list, {
      paginationOpts: { numItems: 10, cursor: first.continueCursor },
    });
    expect(first.page).toHaveLength(10);
    expect(next.page).toHaveLength(2);
    expect(next.isDone).toBe(true);
    for (const numItems of [0, 11, 1.5])
      await expect(
        alice.query(api.mcpConnections.list, {
          paginationOpts: { numItems, cursor: null },
        }),
      ).rejects.toThrow("Page size");
    vi.stubEnv("MINDSPOOL_MCP_ENABLED", "false");
    await expect(
      t.mutation(internal.mcpConnections.authorize, args()),
    ).rejects.toThrow("UNAVAILABLE");
    expect(await alice.query(api.mcpConnections.configuration, {})).toEqual({
      enabled: false,
      resourceUrl: null,
    });
    await alice.mutation(api.mcpConnections.disconnect, {
      connectionId: first.page[0]!._id,
    });
  });

  it("exposes only authenticated safe configuration and fails closed on incomplete setup", async () => {
    const { t, alice } = createTest();
    await expect(t.query(api.mcpConnections.configuration, {})).rejects.toThrow(
      "Authentication required",
    );
    await expect(
      t.query(api.mcpConnections.list, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow("Authentication required");
    expect(await alice.query(api.mcpConnections.configuration, {})).toEqual({
      enabled: true,
      resourceUrl: "https://dev.convex.site/mcp",
    });
    vi.stubEnv("CLERK_SECRET_KEY", "");
    expect(await alice.query(api.mcpConnections.configuration, {})).toEqual({
      enabled: false,
      resourceUrl: null,
    });
  });

  it("keeps authorization internal and rejects public owner/timestamp overrides", async () => {
    expectTypeOf(api.mcpConnections).not.toHaveProperty("authorize");
    const { t, alice } = createTest();
    const principal = await t.mutation(
      internal.mcpConnections.authorize,
      args(),
    );
    const controls = {
      connectionId: principal.connectionId as Id<"mcpConnections">,
      ownerId: `${issuer}|user_b`,
      revokedAt: 0,
    };
    await expect(
      alice.mutation(api.mcpConnections.disconnect, controls),
    ).rejects.toThrow();
    expect(
      (await t.mutation(internal.mcpConnections.authorize, args()))
        .connectionId,
    ).toBe(principal.connectionId);
  });
});
