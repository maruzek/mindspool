import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import schema from "../schema";
import { modules } from "../test.setup";
import { McpAuthorizationError } from "./auth";
import type { EnabledMcpConfig } from "./config";
import type { McpAdmission, McpServices } from "./handler";
import { handleMcpMetadata, handleMcpRequest } from "./handler";
import type { McpTool } from "./tools";
import { connectionTool, defineTool, McpToolError } from "./tools";
import type { McpScope, VerifiedMcpPrincipal } from "./types";

const resourceUrl = "https://dev.convex.site/mcp";
const issuer = "https://first.clerk.accounts.dev";
const codex = "https://chatgpt.com/oauth/codex/client.json";
const config: EnabledMcpConfig = {
  enabled: true,
  environment: "development",
  resourceUrl,
  sessionIssuer: issuer,
  clerkSecretKey: "sk_test_fixture",
  allowedOrigins: ["https://app.mindspool.example"],
  allowedClientIds: [codex],
  allowedSubjects: [],
};
const READ: McpScope[] = ["mindspool:read"];
const WRITE: McpScope[] = ["mindspool:read", "mindspool:labels:write"];

function principalFor(
  subject: string,
  scopes: readonly McpScope[] = READ,
): VerifiedMcpPrincipal {
  return {
    ownerId: `${issuer}|${subject}`,
    subject,
    clientId: codex,
    connectionId: `connection_${subject}`,
    scopes,
  };
}

const writeEffect = vi.fn();
// Test-only write tool; production wiring never registers it.
const writeTestTool = defineTool({
  name: "test_write",
  requiredScopes: ["mindspool:read", "mindspool:labels:write"],
  title: "Test write",
  description: "Harmless write used to prove scope enforcement.",
  inputSchema: z.strictObject({}),
  outputSchema: z.strictObject({ ok: z.literal(true) }),
  annotations: {
    readOnlyHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async () => {
    writeEffect();
    return { ok: true as const };
  },
});
const failingTool = (error: unknown) =>
  defineTool({
    name: "test_fail",
    requiredScopes: ["mindspool:read"],
    title: "Test failure",
    description: "Throws.",
    inputSchema: z.strictObject({}),
    outputSchema: z.strictObject({}),
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async () => {
      throw error;
    },
  });

/** Bearer `alice-read`, `alice-write`, `bob-read`; anything else is invalid. */
function services(overrides: Partial<McpServices> = {}) {
  const calls = {
    verify: 0,
    ingress: 0,
    admissions: [] as { connectionId: string; isWrite: boolean }[],
  };
  const allow = async (): Promise<McpAdmission> => ({ allowed: true });
  const value: McpServices = {
    config: () => config,
    now: () => Date.UTC(2026, 9, 17, 12, 0, 30),
    verify: async (request) => {
      calls.verify++;
      const token = request.headers.get("authorization")?.slice(7) ?? "";
      const [subject, access] = token.split("-");
      if (!subject || !access) throw new McpAuthorizationError("invalid_token");
      return {
        issuer,
        subject,
        clientId: codex,
        resource: resourceUrl,
        expiresAt: Date.UTC(2026, 9, 17, 13),
        scopes: access === "write" ? WRITE : READ,
      };
    },
    admitIngress: async () => {
      calls.ingress++;
      return { allowed: true };
    },
    authorize: async (claims) => principalFor(claims.subject, claims.scopes),
    admitConnection: async (args) => {
      calls.admissions.push({
        connectionId: args.connectionId,
        isWrite: args.isWrite,
      });
      return allow();
    },
    runQuery: async () => {
      throw new Error("no queries in handler tests");
    },
    tools: [connectionTool],
    ...overrides,
  };
  return { value, calls };
}

function post(
  message: unknown,
  { token = "alice-read", headers = {} as Record<string, string> } = {},
) {
  return new Request(resourceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: typeof message === "string" ? message : JSON.stringify(message),
  });
}
const call = (name: string, args: unknown = {}, id = 1) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args },
});

describe("MCP request handler", () => {
  beforeEach(() => writeEffect.mockClear());
  afterEach(() => vi.useRealTimers());

  it("is not found while MCP is disabled and unavailable when misconfigured", async () => {
    const off = services({ config: () => ({ enabled: false }) });
    expect((await handleMcpRequest(post({}), off.value)).status).toBe(404);
    const broken = services({
      config: () => {
        throw new Error("bad config");
      },
    });
    expect((await handleMcpRequest(post({}), broken.value)).status).toBe(503);
  });

  it("challenges a missing bearer for read access without any admission or provider call", async () => {
    const s = services();
    const response = await handleMcpRequest(
      post(call("mindspool_connection"), { token: "" }),
      s.value,
    );
    expect(response.status).toBe(401);
    const challenge = response.headers.get("www-authenticate") ?? "";
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain('scope="mindspool:read"');
    expect(challenge).toContain(
      'resource_metadata="https://dev.convex.site/.well-known/oauth-protected-resource/mcp"',
    );
    expect(s.calls).toMatchObject({ verify: 0, ingress: 0, admissions: [] });
  });

  it.each([
    ["invalid_token", 401],
    ["insufficient_scope", 403],
    ["forbidden", 403],
    ["unavailable", 503],
  ] as const)("maps verification %s to %i", async (code, status) => {
    const s = services({
      verify: async () => {
        throw new McpAuthorizationError(code);
      },
    });
    const response = await handleMcpRequest(
      post(call("mindspool_connection")),
      s.value,
    );
    expect(response.status).toBe(status);
    if (code === "insufficient_scope")
      expect(response.headers.get("www-authenticate")).toContain(
        'error="insufficient_scope"',
      );
    expect(s.calls.admissions).toEqual([]);
  });

  it("fails closed on unexpected verifier errors without leaking them", async () => {
    const s = services({
      verify: async () => {
        throw new Error("sentinel-secret");
      },
    });
    const response = await handleMcpRequest(
      post(call("mindspool_connection")),
      s.value,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("sentinel-secret");
  });

  it.each([
    ["FORBIDDEN", 403],
    ["INSUFFICIENT_SCOPE", 403],
    ["UNAVAILABLE", 503],
  ])(
    "maps connection authorization %s to %i before any tool runs",
    async (code, status) => {
      const s = services({
        tools: [connectionTool, writeTestTool],
        authorize: async () => {
          throw new ConvexError({ code, message: "x" });
        },
      });
      const response = await handleMcpRequest(
        post(call("test_write"), { token: "alice-write" }),
        s.value,
      );
      expect(response.status).toBe(status);
      expect(writeEffect).not.toHaveBeenCalled();
      expect(s.calls.admissions).toEqual([]);
    },
  );

  it("refuses at the deployment ingress ceiling before verifying", async () => {
    const s = services({
      admitIngress: async () => ({ allowed: false, retryAfterSeconds: 17 }),
    });
    const response = await handleMcpRequest(
      post(call("mindspool_connection")),
      s.value,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(s.calls.verify).toBe(0);
  });

  it("refuses over the connection quota with Retry-After", async () => {
    const s = services({
      admitConnection: async () => ({ allowed: false, retryAfterSeconds: 9 }),
    });
    const response = await handleMcpRequest(
      post(call("mindspool_connection")),
      s.value,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("9");
  });

  it("checks origin and host, allowing desktop requests without Origin", async () => {
    const s = services();
    const foreign = await handleMcpRequest(
      post(call("mindspool_connection"), {
        headers: { Origin: "https://evil.example" },
      }),
      s.value,
    );
    expect(foreign.status).toBe(403);
    const allowed = await handleMcpRequest(
      post(call("mindspool_connection"), {
        headers: { Origin: "https://app.mindspool.example" },
      }),
      s.value,
    );
    expect(allowed.status).toBe(200);
    const wrongHost = await handleMcpRequest(
      new Request("https://other.convex.site/mcp", post({})),
      s.value,
    );
    expect(wrongHost.status).toBe(403);
    expect(s.calls.verify).toBe(1);
  });

  it("authenticates GET and DELETE before answering 405", async () => {
    const s = services();
    for (const method of ["GET", "DELETE"]) {
      const anonymous = await handleMcpRequest(
        new Request(resourceUrl, { method }),
        s.value,
      );
      expect(anonymous.status).toBe(401);
      const signedIn = await handleMcpRequest(
        new Request(resourceUrl, {
          method,
          headers: { Authorization: "Bearer alice-read" },
        }),
        s.value,
      );
      expect(signedIn.status).toBe(405);
      expect(signedIn.headers.get("allow")).toBe("POST");
    }
  });

  it("rejects oversized and encoded bodies", async () => {
    const s = services();
    const big = await handleMcpRequest(
      post({ ...call("mindspool_connection"), pad: "x".repeat(65_536) }),
      s.value,
    );
    expect(big.status).toBe(413);
    const gzip = await handleMcpRequest(
      post(call("mindspool_connection"), {
        headers: { "Content-Encoding": "gzip" },
      }),
      s.value,
    );
    expect(gzip.status).toBe(415);
    expect(s.calls.verify).toBe(0);
  });

  it("lists the connection tool with its schema and annotations", async () => {
    const response = await handleMcpRequest(
      post({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      services().value,
    );
    const body = await response.json();
    expect(body.result.tools).toHaveLength(1);
    expect(body.result.tools[0]).toMatchObject({
      name: "mindspool_connection",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: { type: "object", additionalProperties: false },
    });
  });

  it("returns identical structured and text capabilities without identifiers", async () => {
    for (const [token, edit] of [
      ["alice-read", false],
      ["alice-write", true],
    ] as const) {
      const response = await handleMcpRequest(
        post(call("mindspool_connection"), { token }),
        services().value,
      );
      const { result } = await response.json();
      const expected = {
        service: "MindSpool",
        permissions: { readLibrary: true, editItemLabels: edit },
      };
      expect(result.structuredContent).toEqual(expected);
      expect(JSON.parse(result.content[0].text)).toEqual(expected);
      expect(JSON.stringify(result)).not.toMatch(/alice|connection_|issuer/);
    }
  });

  it("rejects arguments other than {} for the connection tool", async () => {
    const response = await handleMcpRequest(
      post(call("mindspool_connection", { extra: 1 })),
      services().value,
    );
    const body = await response.json();
    expect(body.result?.isError ?? body.error).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("readLibrary");
  });

  it("refuses a direct write call from a read-only token before admission or effect", async () => {
    const s = services({ tools: [connectionTool, writeTestTool] });
    const response = await handleMcpRequest(post(call("test_write")), s.value);
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain(
      'scope="mindspool:read mindspool:labels:write"',
    );
    expect(writeEffect).not.toHaveBeenCalled();
    expect(s.calls.admissions).toEqual([]);
  });

  it("refuses a write call hidden in a batch", async () => {
    const s = services({ tools: [connectionTool, writeTestTool] });
    const response = await handleMcpRequest(
      post([call("mindspool_connection", {}, 1), call("test_write", {}, 2)]),
      s.value,
    );
    expect(response.status).toBe(403);
    expect(writeEffect).not.toHaveBeenCalled();
  });

  it("spends a write admission only for write tools", async () => {
    const s = services({ tools: [connectionTool, writeTestTool] });
    await handleMcpRequest(
      post(call("test_write"), { token: "alice-write" }),
      s.value,
    );
    await handleMcpRequest(
      post(call("mindspool_connection"), { token: "alice-write" }),
      s.value,
    );
    expect(writeEffect).toHaveBeenCalledOnce();
    expect(s.calls.admissions).toEqual([
      { connectionId: "connection_alice", isWrite: true },
      { connectionId: "connection_alice", isWrite: false },
    ]);
  });

  it("leaves unknown tools to the SDK", async () => {
    const response = await handleMcpRequest(
      post(call("no_such_tool")),
      services().value,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.error).toMatchObject({ code: -32602 });
  });

  it("maps domain errors to isError results and hides unexpected ones", async () => {
    const cases: [unknown, object][] = [
      [
        new ConvexError({ code: "NOT_FOUND", message: "Not found" }),
        { code: "NOT_FOUND", message: "Not found", retryable: false },
      ],
      [
        new McpToolError("UNAVAILABLE", "Try again"),
        { code: "UNAVAILABLE", message: "Try again", retryable: true },
      ],
      [
        new Error("sentinel-secret"),
        {
          code: "INTERNAL_ERROR",
          message: "Something went wrong",
          retryable: false,
        },
      ],
    ];
    for (const [error, expected] of cases) {
      const response = await handleMcpRequest(
        post(call("test_fail")),
        services({ tools: [failingTool(error)] }).value,
      );
      const { result } = await response.json();
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toEqual({ error: expected });
      expect(JSON.parse(result.content[0].text)).toEqual({ error: expected });
      expect(JSON.stringify(result)).not.toContain("sentinel-secret");
    }
  });

  it("keeps interleaved principals independent", async () => {
    const s = services();
    const responses = await Promise.all([
      handleMcpRequest(
        post(call("mindspool_connection", {}, 1), { token: "alice-read" }),
        s.value,
      ),
      handleMcpRequest(
        post(call("mindspool_connection", {}, 2), { token: "bob-write" }),
        s.value,
      ),
    ]);
    const [alice, bob] = await Promise.all(responses.map((r) => r.json()));
    expect(alice.result.structuredContent.permissions.editItemLabels).toBe(
      false,
    );
    expect(bob.result.structuredContent.permissions.editItemLabels).toBe(true);
    expect(s.calls.admissions.map((a) => a.connectionId).sort()).toEqual([
      "connection_alice",
      "connection_bob",
    ]);
  });

  it("answers 503 when the 15-second request budget runs out", async () => {
    vi.useFakeTimers();
    const s = services({ verify: () => new Promise(() => {}) });
    const pending = handleMcpRequest(
      post(call("mindspool_connection")),
      s.value,
    );
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await pending).status).toBe(503);
  });

  it("completes the real SDK client lifecycle", async () => {
    const s = services();
    const client = new Client({ name: "handler-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(resourceUrl), {
      requestInit: { headers: { Authorization: "Bearer alice-read" } },
      fetch: (input, init) =>
        handleMcpRequest(new Request(input, init), s.value),
    });
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual(["mindspool_connection"]);
      const result = await client.callTool({
        name: "mindspool_connection",
        arguments: {},
      });
      expect(result.structuredContent).toEqual({
        service: "MindSpool",
        permissions: { readLibrary: true, editItemLabels: false },
      });
    } finally {
      await client.close();
    }
  });
});

describe("protected-resource metadata", () => {
  it("publishes the resource, issuer and scopes without user data", async () => {
    const response = handleMcpMetadata(
      new Request(
        "https://dev.convex.site/.well-known/oauth-protected-resource/mcp",
      ),
      () => config,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      resource: resourceUrl,
      authorization_servers: [issuer],
      scopes_supported: ["mindspool:read", "mindspool:labels:write"],
      bearer_methods_supported: ["header"],
      resource_name: "MindSpool",
    });
  });

  it("answers CORS preflight only for configured origins", async () => {
    const preflight = (origin: string) =>
      handleMcpMetadata(
        new Request(
          "https://dev.convex.site/.well-known/oauth-protected-resource",
          { method: "OPTIONS", headers: { Origin: origin } },
        ),
        () => config,
      );
    const allowed = preflight("https://app.mindspool.example");
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "https://app.mindspool.example",
    );
    const other = preflight("https://evil.example");
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("is not found while MCP is disabled", () => {
    expect(
      handleMcpMetadata(
        new Request(
          "https://dev.convex.site/.well-known/oauth-protected-resource",
        ),
        () => ({ enabled: false }),
      ).status,
    ).toBe(404);
  });
});

describe("hosted /mcp route", () => {
  const routeResource = "https://some.convex.site/mcp";
  beforeEach(() => {
    vi.stubEnv("MINDSPOOL_MCP_ENABLED", "true");
    vi.stubEnv("MINDSPOOL_ENVIRONMENT", "development");
    vi.stubEnv("MINDSPOOL_MCP_RESOURCE_URL", routeResource);
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", issuer);
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("MINDSPOOL_MCP_ALLOWED_ORIGINS", "");
    vi.stubEnv("MINDSPOOL_MCP_ALLOWED_CLIENT_IDS", codex);
    vi.stubEnv("MINDSPOOL_ALLOWED_SUBJECTS", "");
    // Clerk's token verification and user lookup, as the live verifier calls them.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/access_tokens/verify"))
          return Response.json({
            object: "clerk_idp_oauth_access_token",
            subject: "user_a",
            client_id: codex,
            scopes: ["mindspool:read", "offline_access"],
            aud: [routeResource],
            revoked: false,
            expired: false,
            expiration: Math.floor(Date.now() / 1000) + 3600,
          });
        if (url.endsWith("/users/user_a"))
          return Response.json({
            id: "user_a",
            object: "user",
            banned: false,
            locked: false,
            deprovisioned: false,
          });
        return new Response(null, { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const routed = (message: unknown, token?: string) => ({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(message),
  });

  it("verifies, records one connection, admits and answers the connection tool", async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch(
      "/mcp",
      routed(call("mindspool_connection"), "opaque-token"),
    );
    expect(response.status).toBe(200);
    const { result } = await response.json();
    expect(result.structuredContent).toEqual({
      service: "MindSpool",
      permissions: { readLibrary: true, editItemLabels: false },
    });
    const [connections, buckets] = await t.run(async (ctx) => [
      await ctx.db.query("mcpConnections").collect(),
      await ctx.db.query("mcpRateBuckets").collect(),
    ]);
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      ownerId: `${issuer}|user_a`,
      status: "active",
    });
    expect(buckets.map((b) => b.scope).sort()).toEqual(["ingress", "request"]);
  });

  it("challenges anonymous calls and serves public metadata", async () => {
    const t = convexTest(schema, modules);
    const anonymous = await t.fetch(
      "/mcp",
      routed(call("mindspool_connection")),
    );
    expect(anonymous.status).toBe(401);
    for (const path of [
      "/.well-known/oauth-protected-resource/mcp",
      "/.well-known/oauth-protected-resource",
    ]) {
      const metadata = await t.fetch(path);
      expect(metadata.status).toBe(200);
      expect((await metadata.json()).resource).toBe(routeResource);
    }
  });

  it("no longer exposes the development probe", async () => {
    const t = convexTest(schema, modules);
    expect((await t.fetch("/__mcp_probe", routed({}))).status).toBe(404);
  });
});
