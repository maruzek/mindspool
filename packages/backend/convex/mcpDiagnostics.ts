import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { mcpOutcome } from "./mcpValidators";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TEXT = 64;
const MAX_DURATION_MS = 600_000;

/**
 * One row per MCP request: correlation, opaque connection, allowlisted tool,
 * outcome and timing. Never tokens, headers, arguments, clip text or identity.
 * Rows expire after seven days; deletion is the maintenance job's.
 */
export const recordMcpEvent = internalMutation({
  args: {
    requestId: v.string(),
    connectionId: v.optional(v.id("mcpConnections")),
    tool: v.optional(v.string()),
    outcome: mcpOutcome,
    durationMs: v.number(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { requestId, connectionId, tool, outcome, durationMs, now },
  ) => {
    await ctx.db.insert("mcpDiagnostics", {
      requestId: requestId.slice(0, MAX_TEXT),
      ...(connectionId ? { connectionId } : {}),
      ...(tool ? { tool: tool.slice(0, MAX_TEXT) } : {}),
      outcome,
      durationMs: Math.min(
        MAX_DURATION_MS,
        Math.max(0, Math.round(Number.isFinite(durationMs) ? durationMs : 0)),
      ),
      expiresAt: now + RETENTION_MS,
    });
    return null;
  },
});
