import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readMcpConfig } from "./config";

describe("MCP environment configuration", () => {
  beforeEach(() => {
    vi.stubEnv("MINDSPOOL_MCP_ENABLED", "true");
    vi.stubEnv("MINDSPOOL_ENVIRONMENT", "development");
    vi.stubEnv("MINDSPOOL_MCP_RESOURCE_URL", "https://dev.convex.site/mcp");
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://first.clerk.accounts.dev");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("MINDSPOOL_MCP_ALLOWED_ORIGINS", "https://app.example");
    vi.stubEnv(
      "MINDSPOOL_MCP_ALLOWED_CLIENT_IDS",
      "https://chatgpt.com/oauth/codex/client.json, https://claude.ai/oauth/claude-code-client-metadata",
    );
    vi.stubEnv("MINDSPOOL_ALLOWED_SUBJECTS", "user_a, user_b");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to disabled without requiring secrets or exposing a URL", () => {
    vi.stubEnv("MINDSPOOL_MCP_ENABLED", undefined);
    vi.stubEnv("CLERK_SECRET_KEY", undefined);
    expect(readMcpConfig()).toEqual({ enabled: false });
  });

  it("reads exact issuer/resource and trimmed allowlists", () => {
    expect(readMcpConfig()).toEqual({
      enabled: true,
      environment: "development",
      resourceUrl: "https://dev.convex.site/mcp",
      sessionIssuer: "https://first.clerk.accounts.dev",
      clerkSecretKey: "sk_test_fixture",
      allowedOrigins: ["https://app.example"],
      allowedClientIds: [
        "https://chatgpt.com/oauth/codex/client.json",
        "https://claude.ai/oauth/claude-code-client-metadata",
      ],
      allowedSubjects: ["user_a", "user_b"],
    });
  });

  it("preserves the configured issuer spelling including a trailing slash", () => {
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://first.clerk.accounts.dev/");
    expect(readMcpConfig()).toMatchObject({
      sessionIssuer: "https://first.clerk.accounts.dev/",
    });
  });

  it("allows absent browser origins and the existing empty account allowlist", () => {
    vi.stubEnv("MINDSPOOL_MCP_ALLOWED_ORIGINS", undefined);
    vi.stubEnv("MINDSPOOL_ALLOWED_SUBJECTS", " , ");
    expect(readMcpConfig()).toMatchObject({
      allowedOrigins: [],
      allowedSubjects: [],
    });
  });

  it.each([
    ["MINDSPOOL_MCP_ENABLED", "1"],
    ["MINDSPOOL_ENVIRONMENT", "preview"],
    ["MINDSPOOL_MCP_RESOURCE_URL", "http://dev.convex.site/mcp"],
    [
      "MINDSPOOL_MCP_RESOURCE_URL",
      "https://dev.convex.site/mcp?secret=sentinel",
    ],
    ["MINDSPOOL_MCP_RESOURCE_URL", "https://dev.convex.site/other"],
    ["MINDSPOOL_MCP_RESOURCE_URL", "https://user:sentinel@dev.convex.site/mcp"],
    ["CLERK_JWT_ISSUER_DOMAIN", "https://first.clerk.accounts.dev/other"],
    ["CLERK_JWT_ISSUER_DOMAIN", "https://first.clerk.accounts.dev?"],
    ["CLERK_JWT_ISSUER_DOMAIN", " https://first.clerk.accounts.dev"],
    ["CLERK_JWT_ISSUER_DOMAIN", "https://first.clerk.accounts.dev?query=yes"],
    ["CLERK_SECRET_KEY", "sk_live_sentinel"],
    ["CLERK_SECRET_KEY", "pk_test_sentinel"],
    ["MINDSPOOL_MCP_ALLOWED_CLIENT_IDS", ""],
    ["MINDSPOOL_MCP_ALLOWED_CLIENT_IDS", "http://untrusted.example/client"],
    ["MINDSPOOL_MCP_ALLOWED_ORIGINS", "*"],
    ["MINDSPOOL_MCP_ALLOWED_ORIGINS", "null"],
    ["MINDSPOOL_MCP_ALLOWED_ORIGINS", "https://app.example/path"],
  ])("fails closed for invalid %s without leaking the value", (key, value) => {
    vi.stubEnv(key, value);
    expect(() => readMcpConfig()).toThrow("MCP configuration is unavailable");
    try {
      readMcpConfig();
    } catch (error) {
      expect(String(error)).not.toContain("sentinel");
    }
  });

  it.each([
    "MINDSPOOL_MCP_RESOURCE_URL",
    "CLERK_JWT_ISSUER_DOMAIN",
    "CLERK_SECRET_KEY",
    "MINDSPOOL_MCP_ALLOWED_CLIENT_IDS",
  ])("requires %s when enabled", (key) => {
    vi.stubEnv(key, undefined);
    expect(() => readMcpConfig()).toThrow();
  });
});
