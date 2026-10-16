import { v } from "convex/values";

export const mcpScope = v.union(
  v.literal("mindspool:read"),
  v.literal("mindspool:labels:write"),
);
export const mcpConnectionStatus = v.union(
  v.literal("active"),
  v.literal("revoked"),
);
export const mcpConnectionFields = {
  ownerId: v.string(),
  subject: v.string(),
  clientId: v.string(),
  status: mcpConnectionStatus,
  allowLabelWrite: v.boolean(),
  createdAt: v.number(),
  lastUsedAt: v.number(),
  revokedAt: v.optional(v.number()),
};

export const mcpConnectionSummary = v.object({
  _id: v.id("mcpConnections"),
  clientId: v.string(),
  status: mcpConnectionStatus,
  allowLabelWrite: v.boolean(),
  createdAt: v.number(),
  lastUsedAt: v.number(),
  revokedAt: v.optional(v.number()),
});

export const mcpPrincipal = v.object({
  ownerId: v.string(),
  subject: v.string(),
  clientId: v.string(),
  connectionId: v.id("mcpConnections"),
  scopes: v.array(mcpScope),
});
