import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireOwner } from "./auth";

export const current = query({
  args: {},
  returns: v.object({ ownerId: v.string() }),
  handler: async (ctx) => ({ ownerId: await requireOwner(ctx) }),
});
