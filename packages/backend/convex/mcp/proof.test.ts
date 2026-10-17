import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleMcpProof } from "./proof";

// The probe has no HTTP route; production wiring never imports it.
const as = (subject?: string) => ({
  auth: {
    getUserIdentity: async () =>
      subject
        ? {
            subject,
            issuer: "https://issuer.example",
            tokenIdentifier: `https://issuer.example|${subject}`,
          }
        : null,
  },
});
const probe = (ctx: ReturnType<typeof as>, init: RequestInit) =>
  handleMcpProof(
    new Request("https://example.convex.site/__mcp_probe", init),
    ctx,
  );

function request(method = "initialize", id?: number): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      ...(id === undefined ? {} : { id }),
      method,
      ...(method === "initialize"
        ? {
            params: {
              protocolVersion: "2025-11-25",
              capabilities: {},
              clientInfo: { name: "probe-test", version: "1.0.0" },
            },
          }
        : {}),
    }),
  };
}

describe("development-only MCP runtime probe", () => {
  beforeEach(() => {
    vi.stubEnv("MINDSPOOL_ENVIRONMENT", "development");
    vi.stubEnv("MINDSPOOL_MCP_PROOF_ENABLED", "true");
    vi.stubEnv("MINDSPOOL_ALLOWED_SUBJECTS", "user_a,user_b");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["production", "true"],
    ["", "true"],
    ["development", ""],
    ["development", "false"],
    ["development", "1"],
  ])("stays unavailable in %s with flag %s", async (environment, flag) => {
    vi.stubEnv("MINDSPOOL_ENVIRONMENT", environment);
    vi.stubEnv("MINDSPOOL_MCP_PROOF_ENABLED", flag);
    const response = await probe(as("user_a"), request());
    expect(response.status).toBe(404);
  });

  it("rejects anonymous callers even when enabled", async () => {
    const response = await probe(as(), request());
    expect(response.status).toBe(401);
  });

  it("rejects authenticated accounts outside the existing allowlist", async () => {
    const response = await probe(as("user_foreign"), request());
    expect(response.status).toBe(403);
  });

  it("does not expose unexpected authentication errors", async () => {
    const response = await handleMcpProof(
      new Request("https://example.convex.site/__mcp_probe", request()),
      {
        auth: {
          getUserIdentity: async () => {
            throw new Error("sentinel-secret");
          },
        },
      },
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("sentinel-secret");
  });

  it("does not turn unrelated structured failures into successful authorization", async () => {
    const response = await handleMcpProof(
      new Request("https://example.convex.site/__mcp_probe", request()),
      {
        auth: {
          getUserIdentity: async () => {
            throw new ConvexError("unavailable");
          },
        },
      },
    );
    expect(response.status).toBe(503);
  });

  it("serves independent interleaved users", async () => {
    const alice = as("user_a");
    const bob = as("user_b");
    const initializations = await Promise.all([
      probe(alice, request("initialize", 11)),
      probe(bob, request("initialize", 22)),
    ]);
    const bodies = await Promise.all(
      initializations.map((response) => response.json()),
    );
    expect(bodies.map((body) => body.id)).toEqual([11, 22]);
    for (const response of initializations) {
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
      expect(response.headers.has("mcp-session-id")).toBe(false);
    }
    const [notification, listing] = await Promise.all([
      probe(bob, request("notifications/initialized")),
      probe(alice, request("tools/list", 33)),
    ]);
    expect(notification.status).toBe(202);
    expect(await listing.json()).toEqual({
      jsonrpc: "2.0",
      id: 33,
      result: { tools: [] },
    });
    expect(JSON.stringify(bodies)).not.toMatch(/user_a|user_b|tokenIdentifier/);
  });
});
