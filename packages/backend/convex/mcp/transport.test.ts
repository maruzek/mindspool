import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMcpTransportHandler } from "./transport";

const endpoint = "https://example.convex.site/mcp";
const protocolVersion = "2025-11-25";

function post(message: unknown, version = protocolVersion): Request {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": version,
    },
    body: JSON.stringify(message),
  });
}

function initializeRequest(): Request {
  return post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: "transport-proof", version: "1.0.0" },
    },
  });
}

describe("stateless MCP transport", () => {
  const handle = createMcpTransportHandler({ registerTools: () => {} });

  it("initializes with JSON and no allocated session or change notifications", async () => {
    const response = await handle(initializeRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.has("mcp-session-id")).toBe(false);
    expect(await response.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "MindSpool" },
      },
    });
  });

  it("accepts initialized notifications without a response body", async () => {
    const response = await handle(
      post({ jsonrpc: "2.0", method: "notifications/initialized" }),
    );
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("lists an empty tool registry in an independent request", async () => {
    const response = await handle(
      post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    );
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: { tools: [] },
    });
  });

  it("rejects unsupported protocol headers through the SDK", async () => {
    const response = await handle(
      post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, "2099-01-01"),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: -32000 } });
  });

  it("keeps newer optional protocol features disabled", async () => {
    const response = await handle(
      post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, "2026-07-28"),
    );
    expect(response.status).toBe(400);
  });

  it("rejects bodies exceeding 64 KiB", async () => {
    const response = await handle(
      post({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        padding: "x".repeat(65_536),
      }),
    );
    expect(response.status).toBe(413);
  });

  it("returns SDK errors for malformed messages", async () => {
    const response = await handle(post({ method: "tools/list" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: -32700 } });
  });

  it("completes the real SDK client lifecycle over Request/Response", async () => {
    const client = new Client(
      { name: "sdk-proof", version: "1.0.0" },
      { supportedProtocolVersions: [protocolVersion] },
    );
    const statuses: number[] = [];
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
      fetch: async (input, init) => {
        const response = await handle(new Request(input, init));
        statuses.push(response.status);
        return response;
      },
    });
    try {
      await client.connect(transport);
      expect(await client.listTools()).toEqual({ tools: [] });
      expect(transport.sessionId).toBeUndefined();
      expect(statuses).toContain(202);
    } finally {
      await client.close();
    }
  });

  it("isolates overlapping registrations and waits for async tool results before closing", async () => {
    const forUser = (user: string) =>
      createMcpTransportHandler({
        registerTools: (server) => {
          server.registerTool(
            "proof_identity",
            { inputSchema: z.strictObject({}) },
            async () => {
              await new Promise((resolve) => setTimeout(resolve, 5));
              return { content: [{ type: "text", text: user }] };
            },
          );
        },
      });
    const call = () =>
      post({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "proof_identity", arguments: {} },
      });
    const alice = forUser("alice");
    const bob = forUser("bob");
    const responses = await Promise.all([
      alice(call()),
      bob(call()),
      alice(call()),
    ]);
    const bodies = await Promise.all(
      responses.map((response) => response.json()),
    );
    expect(bodies.map((body) => body.result.content)).toEqual([
      [{ type: "text", text: "alice" }],
      [{ type: "text", text: "bob" }],
      [{ type: "text", text: "alice" }],
    ]);
  });
});
