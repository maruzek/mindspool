import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";

// Keep the approved initialize/notification protocol; v2's newer discovery and
// unsolicited-request features are outside the access module's contract.
const supportedProtocolVersions = ["2025-11-25", "2025-06-18", "2025-03-26"];

export function createMcpTransportHandler({
  registerTools,
  authInfo,
}: {
  registerTools: (server: McpServer) => void;
  /** Verified caller; lets the SDK answer per-tool scope challenges. */
  authInfo?: AuthInfo;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    const server = new McpServer(
      { name: "MindSpool", version: "0.0.0" },
      {
        supportedProtocolVersions,
        capabilities: { tools: { listChanged: false } },
        jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
      },
    );
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: 65_536,
    });
    try {
      registerTools(server);
      await server.connect(transport);
      return await transport.handleRequest(
        request,
        authInfo ? { authInfo } : undefined,
      );
    } finally {
      // JSON responses are fully materialized before handleRequest resolves.
      await server.close();
    }
  };
}
