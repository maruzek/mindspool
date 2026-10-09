import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
export async function validElement(
  ctx: QueryCtx,
  board: Doc<"boards">,
  element: Doc<"boardElements">,
) {
  if (element.data.type !== "item") return true;
  const item = await ctx.db.get(element.data.itemId);
  if (!item || item.ownerId !== board.ownerId) return false;
  const link = await ctx.db
    .query("itemLabels")
    .withIndex("by_owner_pair", (q) =>
      q
        .eq("ownerId", board.ownerId)
        .eq("itemId", item._id)
        .eq("labelId", board.labelId),
    )
    .unique();
  return (
    link?.manualDecision === "include" &&
    element.data.membership === `${link._id}:${link.boardGeneration ?? 0}`
  );
}
export async function validConnection(
  ctx: QueryCtx,
  board: Doc<"boards">,
  edge: Doc<"boardConnections">,
) {
  for (const key of [edge.source, edge.target]) {
    const element = await ctx.db
      .query("boardElements")
      .withIndex("by_owner_board_key", (q) =>
        q.eq("ownerId", board.ownerId).eq("boardId", board._id).eq("key", key),
      )
      .unique();
    if (
      !element ||
      element.data.type !== "item" ||
      !(await validElement(ctx, board, element))
    )
      return false;
  }
  return true;
}
export async function invalidateMembership(
  ctx: MutationCtx,
  ownerId: string,
  labelId: Id<"labels">,
  itemId: Id<"items">,
) {
  const board = await ctx.db
    .query("boards")
    .withIndex("by_owner_label", (q) =>
      q.eq("ownerId", ownerId).eq("labelId", labelId),
    )
    .unique();
  if (!board) return;
  await ctx.db.patch(board._id, {
    revision: board.revision + 1,
    updatedAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.boardState.cleanup, {
    ownerId,
    itemId,
  });
}
/** At most 20 placements and 40 edge writes per continuation; never remove a fresh generation. */
export async function cleanupItemBoards(
  ctx: MutationCtx,
  ownerId: string,
  itemId: Id<"items">,
  cursor: string | null = null,
) {
  const page = await ctx.db
    .query("boardElements")
    .withIndex("by_owner_item", (q) =>
      q.eq("ownerId", ownerId).eq("data.itemId", itemId),
    )
    .paginate({ numItems: 20, cursor, maximumRowsRead: 20 });
  const rows = page.page;
  let more = false;
  for (const element of rows) {
    const board = await ctx.db.get(element.boardId);
    if (board && (await validElement(ctx, board, element))) continue;
    const edges = await ctx.db
      .query("boardConnections")
      .withIndex("by_source", (q) =>
        q
          .eq("ownerId", ownerId)
          .eq("boardId", element.boardId)
          .eq("source", element.key),
      )
      .take(20);
    const targets = await ctx.db
      .query("boardConnections")
      .withIndex("by_target", (q) =>
        q
          .eq("ownerId", ownerId)
          .eq("boardId", element.boardId)
          .eq("target", element.key),
      )
      .take(20);
    for (const edge of [...edges, ...targets]) await ctx.db.delete(edge._id);
    if (edges.length === 20 || targets.length === 20) more = true;
    else await ctx.db.delete(element._id);
    if (board)
      await ctx.db.patch(board._id, {
        revision: board.revision + 1,
        updatedAt: Date.now(),
      });
  }
  // A removed item has no eligible rows; all of its pages are consumed.
  if (more || !page.isDone)
    await ctx.scheduler.runAfter(0, internal.boardState.cleanup, {
      ownerId,
      itemId,
      cursor: more ? cursor : page.continueCursor,
    });
}
export const cleanup = internalMutation({
  args: {
    ownerId: v.string(),
    itemId: v.id("items"),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await cleanupItemBoards(ctx, args.ownerId, args.itemId, args.cursor);
    return null;
  },
});
