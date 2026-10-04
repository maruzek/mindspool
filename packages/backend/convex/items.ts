import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwned, requireOwner } from "./auth";
import {
  captureSource,
  inputType,
  itemDoc,
  itemPage,
  paginationOptsValidator,
  validateCapture,
  validatePagination,
} from "./validators";

export const create = mutation({
  args: {
    originalInput: v.string(),
    inputType,
    captureSource,
    captureKey: v.string(),
  },
  returns: v.id("items"),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    validateCapture(args);
    const existing = await ctx.db
      .query("items")
      .withIndex("by_owner_capture_key", (q) =>
        q.eq("ownerId", ownerId).eq("captureKey", args.captureKey),
      )
      .unique();
    if (existing) {
      if (
        existing.originalInput !== args.originalInput ||
        existing.inputType !== args.inputType ||
        existing.captureSource !== args.captureSource
      ) {
        throw new ConvexError({
          code: "CONFLICT",
          message: "Capture key already used",
        });
      }
      return existing._id;
    }
    return ctx.db.insert("items", {
      ...args,
      ownerId,
      ...(args.inputType === "url" ? { originalUrl: args.originalInput } : {}),
      captureStatus: "captured",
      enrichmentStatus: "not_started",
      imageAssets: [],
      updatedAt: Date.now(),
    });
  },
});

export const get = query({
  args: { id: v.id("items") },
  returns: itemDoc,
  handler: async (ctx, { id }) => {
    const ownerId = await requireOwner(ctx);
    return requireOwned(await ctx.db.get(id), ownerId);
  },
});

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: itemPage,
  handler: async (ctx, { paginationOpts }) => {
    const ownerId = await requireOwner(ctx);
    validatePagination(paginationOpts);
    return ctx.db
      .query("items")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .paginate(paginationOpts);
  },
});
