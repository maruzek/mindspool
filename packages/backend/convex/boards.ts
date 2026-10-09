import { validElement, validConnection } from "./boardState";
import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireOwned, requireOwner } from "./auth";
import {
  boardDoc,
  elementDoc,
  connectionDoc,
  viewport,
  validateViewport,
  invalid,
} from "./boardValidators";
import { paginationOptsValidator } from "./validators";
export async function ownedBoard(ctx: QueryCtx, boardId: Id<"boards">) {
  const ownerId = await requireOwner(ctx);
  const board = requireOwned(await ctx.db.get(boardId), ownerId);
  requireOwned(await ctx.db.get(board.labelId), ownerId);
  return board;
}
export const open = mutation({
  args: { labelId: v.id("labels") },
  returns: boardDoc,
  handler: async (ctx, { labelId }) => {
    const ownerId = await requireOwner(ctx);
    requireOwned(await ctx.db.get(labelId), ownerId);
    const existing = await ctx.db
      .query("boards")
      .withIndex("by_owner_label", (q) =>
        q.eq("ownerId", ownerId).eq("labelId", labelId),
      )
      .unique();
    if (existing) return existing;
    const id = await ctx.db.insert("boards", {
      ownerId,
      labelId,
      revision: 0,
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: Date.now(),
    });
    return (await ctx.db.get(id))!;
  },
});
export const get = query({
  args: { boardId: v.id("boards") },
  returns: boardDoc,
  handler: (ctx, { boardId }) => ownedBoard(ctx, boardId),
});
function options<T extends { numItems: number }>(opts: T) {
  if (
    !Number.isInteger(opts.numItems) ||
    opts.numItems < 1 ||
    opts.numItems > 50
  )
    invalid("Page size must be 1–50");
  return { ...opts, maximumRowsRead: 50, maximumBytesRead: 512 * 1024 };
}
export const elements = query({
  args: { boardId: v.id("boards"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...paginationResultValidator(elementDoc).fields,
    revision: v.number(),
  }),
  handler: async (ctx, { boardId, paginationOpts }) => {
    const board = await ownedBoard(ctx, boardId);
    const page = await ctx.db
      .query("boardElements")
      .withIndex("by_owner_board", (q) =>
        q.eq("ownerId", board.ownerId).eq("boardId", boardId),
      )
      .paginate(options(paginationOpts));
    const eligible = await Promise.all(
      page.page.map((row) => validElement(ctx, board, row)),
    );
    return {
      ...page,
      page: page.page.filter((_, i) => eligible[i]),
      revision: board.revision,
    };
  },
});
export const connections = query({
  args: { boardId: v.id("boards"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...paginationResultValidator(connectionDoc).fields,
    revision: v.number(),
  }),
  handler: async (ctx, { boardId, paginationOpts }) => {
    const board = await ownedBoard(ctx, boardId);
    const page = await ctx.db
      .query("boardConnections")
      .withIndex("by_owner_board", (q) =>
        q.eq("ownerId", board.ownerId).eq("boardId", boardId),
      )
      .paginate(options(paginationOpts));
    const eligible = await Promise.all(
      page.page.map((row) => validConnection(ctx, board, row)),
    );
    return {
      ...page,
      page: page.page.filter((_, i) => eligible[i]),
      revision: board.revision,
    };
  },
});
export const setViewport = mutation({
  args: { boardId: v.id("boards"), viewport },
  returns: v.null(),
  handler: async (ctx, args) => {
    const board = await ownedBoard(ctx, args.boardId);
    validateViewport(args.viewport);
    await ctx.db.patch(board._id, { viewport: args.viewport });
    return null;
  },
});
