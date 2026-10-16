import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireOwned, requireOwner } from "./auth";
import { ownerIdForMcpSubject } from "./mcp/auth";
import { McpConfigurationError, readMcpConfig } from "./mcp/config";
import type { McpScope } from "./mcp/types";
import { mcpConnectionSummary, mcpPrincipal, mcpScope } from "./mcpValidators";

export const authorize = internalMutation({
  args: {
    subject: v.string(),
    clientId: v.string(),
    tokenScopes: v.array(mcpScope),
  },
  returns: mcpPrincipal,
  handler: async (ctx, { subject, clientId, tokenScopes }) => {
    const config = readMcpConfig();
    if (!config.enabled)
      throw new ConvexError({
        code: "UNAVAILABLE",
        message: "MCP is unavailable",
      });
    if (!tokenScopes.includes("mindspool:read"))
      throw new ConvexError({
        code: "INSUFFICIENT_SCOPE",
        message: "Read permission required",
      });
    if (
      !/^user_[A-Za-z0-9_-]+$/.test(subject) ||
      !config.allowedClientIds.includes(clientId) ||
      (config.allowedSubjects.length > 0 &&
        !config.allowedSubjects.includes(subject))
    ) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Access denied" });
    }
    const ownerId = ownerIdForMcpSubject(subject, config.sessionIssuer);
    // A transactional indexed read + insert participates in Convex OCC. The
    // index itself is not unique; a racing first request retries this lookup.
    const connection = await ctx.db
      .query("mcpConnections")
      .withIndex("by_owner_client", (q) =>
        q.eq("ownerId", ownerId).eq("clientId", clientId),
      )
      .unique();
    if (connection?.status === "revoked")
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Connection is disconnected",
      });
    const now = Date.now();
    const connectionId =
      connection?._id ??
      (await ctx.db.insert("mcpConnections", {
        ownerId,
        subject,
        clientId,
        status: "active",
        allowLabelWrite: false,
        createdAt: now,
        lastUsedAt: now,
      }));
    if (connection && now - connection.lastUsedAt >= 60_000)
      await ctx.db.patch(connectionId, { lastUsedAt: now });
    const scopes: McpScope[] = ["mindspool:read"];
    if (
      connection?.allowLabelWrite &&
      tokenScopes.includes("mindspool:labels:write")
    )
      scopes.push("mindspool:labels:write");
    return { ownerId, subject, clientId, connectionId, scopes };
  },
});

export const configuration = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    resourceUrl: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    await requireOwner(ctx);
    try {
      const config = readMcpConfig();
      return config.enabled
        ? { enabled: true, resourceUrl: config.resourceUrl }
        : { enabled: false, resourceUrl: null };
    } catch (error) {
      if (!(error instanceof McpConfigurationError)) throw error;
      return { enabled: false, resourceUrl: null };
    }
  },
});

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(mcpConnectionSummary),
  handler: async (ctx, { paginationOpts }) => {
    const ownerId = await requireOwner(ctx);
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 10
    )
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Page size must be between 1 and 10",
      });
    const result = await ctx.db
      .query("mcpConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map((connection) => ({
        _id: connection._id,
        clientId: connection.clientId,
        status: connection.status,
        allowLabelWrite: connection.allowLabelWrite,
        createdAt: connection.createdAt,
        lastUsedAt: connection.lastUsedAt,
        ...(connection.revokedAt !== undefined
          ? { revokedAt: connection.revokedAt }
          : {}),
      })),
    };
  },
});

export const setLabelWrite = mutation({
  args: { connectionId: v.id("mcpConnections"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { connectionId, enabled }) => {
    const ownerId = await requireOwner(ctx);
    const connection = requireOwned(await ctx.db.get(connectionId), ownerId);
    if (connection.status !== "active")
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Connection is disconnected",
      });
    if (connection.allowLabelWrite !== enabled)
      await ctx.db.patch(connectionId, { allowLabelWrite: enabled });
    return null;
  },
});

export const disconnect = mutation({
  args: { connectionId: v.id("mcpConnections") },
  returns: v.null(),
  handler: async (ctx, { connectionId }) => {
    const ownerId = await requireOwner(ctx);
    const connection = requireOwned(await ctx.db.get(connectionId), ownerId);
    if (connection.status !== "revoked")
      await ctx.db.patch(connectionId, {
        status: "revoked",
        allowLabelWrite: false,
        revokedAt: Date.now(),
      });
    return null;
  },
});

export const reconnect = mutation({
  args: { connectionId: v.id("mcpConnections") },
  returns: v.null(),
  handler: async (ctx, { connectionId }) => {
    const ownerId = await requireOwner(ctx);
    requireOwned(await ctx.db.get(connectionId), ownerId);
    await ctx.db.patch(connectionId, {
      status: "active",
      allowLabelWrite: false,
      revokedAt: undefined,
    });
    return null;
  },
});
