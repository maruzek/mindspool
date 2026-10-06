import { paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwner } from "./auth";
import {
  labelDoc,
  paginationOptsValidator,
  validatePagination,
} from "./validators";

export const create = mutation({
  args: { name: v.string() },
  returns: v.id("labels"),
  handler: async (ctx, { name: input }) => {
    const ownerId = await requireOwner(ctx);
    const name = input.trim();
    if (!name || name.length > 80)
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Invalid label name",
      });
    const normalizedName = name.toLowerCase();
    const existing = await ctx.db
      .query("labels")
      .withIndex("by_owner_name", (q) =>
        q.eq("ownerId", ownerId).eq("normalizedName", normalizedName),
      )
      .unique();
    return (
      existing?._id ??
      ctx.db.insert("labels", { ownerId, name, normalizedName })
    );
  },
});

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(labelDoc),
  handler: async (ctx, { paginationOpts }) => {
    const ownerId = await requireOwner(ctx);
    validatePagination(paginationOpts);
    return ctx.db
      .query("labels")
      .withIndex("by_owner_name", (q) => q.eq("ownerId", ownerId))
      .paginate(paginationOpts);
  },
});

/** Foreign, missing, and malformed ids all read as null, so ids reveal nothing. */
export const get = query({
  args: { id: v.string() },
  returns: v.union(labelDoc, v.null()),
  handler: async (ctx, { id }) => {
    const ownerId = await requireOwner(ctx);
    const labelId = ctx.db.normalizeId("labels", id);
    const label = labelId ? await ctx.db.get(labelId) : null;
    return label && label.ownerId === ownerId ? label : null;
  },
});
