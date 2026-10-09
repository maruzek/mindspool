import type { Infer } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { connectionData, invalid, key as validateKey } from "./boardValidators";
import { validElement } from "./boardState";
export async function edgeByKey(
  ctx: MutationCtx,
  board: Doc<"boards">,
  key: string,
) {
  return ctx.db
    .query("boardConnections")
    .withIndex("by_owner_board_key", (q) =>
      q.eq("ownerId", board.ownerId).eq("boardId", board._id).eq("key", key),
    )
    .unique();
}
export async function setConnection(
  ctx: MutationCtx,
  board: Doc<"boards">,
  key: string,
  data: Infer<typeof connectionData>,
) {
  validateKey(data.source);
  validateKey(data.target);
  if (data.source === data.target) invalid("Self connections are unavailable");
  if (data.label.length > 200)
    invalid("Connection label exceeds 200 characters");
  for (const endpoint of [data.source, data.target]) {
    const element = await ctx.db
      .query("boardElements")
      .withIndex("by_owner_board_key", (q) =>
        q
          .eq("ownerId", board.ownerId)
          .eq("boardId", board._id)
          .eq("key", endpoint),
      )
      .unique();
    if (
      element?.data.type !== "item" ||
      !(await validElement(ctx, board, element))
    )
      invalid("Invalid connection endpoint");
  }
  const pairKey = JSON.stringify([data.source, data.target].sort());
  const duplicate = await ctx.db
    .query("boardConnections")
    .withIndex("by_pair", (q) =>
      q
        .eq("ownerId", board.ownerId)
        .eq("boardId", board._id)
        .eq("pairKey", pairKey),
    )
    .unique();
  if (duplicate && duplicate.key !== key)
    invalid("A connection already exists between these cards");
  const existing = await edgeByKey(ctx, board, key);
  if (existing) {
    const same =
      existing.source === data.source &&
      existing.target === data.target &&
      existing.label === data.label &&
      existing.color === data.color &&
      existing.arrows === data.arrows;
    if (same) return false;
    await ctx.db.patch(existing._id, { ...data, pairKey });
  } else
    await ctx.db.insert("boardConnections", {
      ownerId: board.ownerId,
      boardId: board._id,
      key,
      ...data,
      pairKey,
    });
  return true;
}
