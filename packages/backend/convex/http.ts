import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { verifyMcpAccessToken } from "./mcp/auth";
import { readMcpConfig } from "./mcp/config";
import type { McpServices } from "./mcp/handler";
import { handleMcpMetadata, handleMcpRequest } from "./mcp/handler";
import { productionTools } from "./mcp/tools";

const http = httpRouter();

function mcpServices(ctx: ActionCtx): McpServices {
  return {
    config: readMcpConfig,
    now: Date.now,
    verify: verifyMcpAccessToken,
    admitIngress: (now) =>
      ctx.runMutation(internal.mcpRateLimit.admitIngress, { now }),
    authorize: (claims) =>
      ctx.runMutation(internal.mcpConnections.authorize, {
        subject: claims.subject,
        clientId: claims.clientId,
        tokenScopes: [...claims.scopes],
      }),
    admitConnection: ({ connectionId, isWrite, now }) =>
      ctx.runMutation(internal.mcpRateLimit.admitConnection, {
        connectionId: connectionId as Id<"mcpConnections">,
        isWrite,
        now,
      }),
    runQuery: (query, args) => ctx.runQuery(query, args),
    tools: productionTools,
    record: async ({ connectionId, ...event }) => {
      await ctx.runMutation(internal.mcpDiagnostics.recordMcpEvent, {
        ...event,
        ...(connectionId
          ? { connectionId: connectionId as Id<"mcpConnections"> }
          : {}),
      });
    },
  };
}

const mcp = httpAction((ctx, request) =>
  handleMcpRequest(request, mcpServices(ctx)),
);
for (const method of ["POST", "GET", "DELETE"] as const)
  http.route({ path: "/mcp", method, handler: mcp });

const metadata = httpAction(async (_ctx, request) =>
  handleMcpMetadata(request, readMcpConfig),
);
for (const path of [
  "/.well-known/oauth-protected-resource/mcp",
  "/.well-known/oauth-protected-resource",
])
  for (const method of ["GET", "OPTIONS"] as const)
    http.route({ path, method, handler: metadata });

export default http;
