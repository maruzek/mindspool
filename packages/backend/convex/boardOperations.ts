import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ownedBoard } from "./boards";
import { requireOwned } from "./auth";
import { decideMembership } from "./libraryWriters";
import {
  acknowledgment,
  finite,
  invalid,
  key as validateKey,
} from "./boardValidators";
export const operation = v.union(
  v.object({
    type: v.literal("place"),
    key: v.string(),
    itemId: v.id("items"),
    x: v.number(),
    y: v.number(),
  }),
  v.object({ type: v.literal("remove"), key: v.string() }),
);
export async function elementByKey(
  ctx: MutationCtx,
  board: Doc<"boards">,
  key: string,
) {
  return ctx.db
    .query("boardElements")
    .withIndex("by_owner_board_key", (q) =>
      q.eq("ownerId", board.ownerId).eq("boardId", board._id).eq("key", key),
    )
    .unique();
}
export async function removeElement(
  ctx: MutationCtx,
  element: Doc<"boardElements">,
) {
  const edges = await ctx.db
    .query("boardConnections")
    .withIndex("by_source", (q) =>
      q
        .eq("ownerId", element.ownerId)
        .eq("boardId", element.boardId)
        .eq("source", element.key),
    )
    .take(101);
  const targets = await ctx.db
    .query("boardConnections")
    .withIndex("by_target", (q) =>
      q
        .eq("ownerId", element.ownerId)
        .eq("boardId", element.boardId)
        .eq("target", element.key),
    )
    .take(101);
  if (edges.length + targets.length > 100)
    invalid("Too many incident connections for one action");
  for (const edge of [...edges, ...targets]) await ctx.db.delete(edge._id);
  await ctx.db.delete(element._id);
}
export async function membershipToken(
  ctx: MutationCtx,
  board: Doc<"boards">,
  itemId: Id<"items">,
) {
  const link = await ctx.db
    .query("itemLabels")
    .withIndex("by_owner_pair", (q) =>
      q
        .eq("ownerId", board.ownerId)
        .eq("itemId", itemId)
        .eq("labelId", board.labelId),
    )
    .unique();
  if (link?.manualDecision !== "include") return null;
  return `${link._id}:${link.boardGeneration ?? 0}`;
}
export const apply = mutation({
  args: {
    boardId: v.id("boards"),
    expectedRevision: v.number(),
    session: v.string(),
    sequence: v.number(),
    operations: v.array(operation),
  },
  returns: acknowledgment,
  handler: async (ctx, args) => {
    const board = await ownedBoard(ctx, args.boardId);
    validateKey(args.session);
    if (
      !Number.isSafeInteger(args.sequence) ||
      args.sequence < 1 ||
      !Number.isSafeInteger(args.expectedRevision) ||
      args.expectedRevision < 0
    )
      invalid("Invalid operation identity");
    if (
      !args.operations.length ||
      args.operations.length > 100 ||
      new TextEncoder().encode(JSON.stringify(args)).length > 512 * 1024
    )
      invalid("Operation exceeds atomic bounds");
    const fingerprint = JSON.stringify(args);
    const receipt = await ctx.db
      .query("boardReceipts")
      .withIndex("by_operation", (q) =>
        q
          .eq("ownerId", board.ownerId)
          .eq("boardId", board._id)
          .eq("session", args.session)
          .eq("sequence", args.sequence),
      )
      .unique();
    if (receipt && receipt.expiresAt > Date.now()) {
      if (receipt.fingerprint !== fingerprint)
        throw new ConvexError({
          code: "CONFLICT",
          message: "Operation identity reused with different payload",
        });
      return receipt.acknowledgment;
    }
    if (board.revision !== args.expectedRevision)
      throw new ConvexError({
        code: "CONFLICT",
        message: "Board changed. Reload latest.",
      });
    let changed = false;
    for (const op of args.operations) {
      validateKey(op.key);
      if (op.type === "place") {
        finite(op.x, -1e6, 1e6);
        finite(op.y, -1e6, 1e6);
        requireOwned(await ctx.db.get(op.itemId), board.ownerId);
        if (await elementByKey(ctx, board, op.key))
          invalid("Element key already exists");
        const existing = await ctx.db
          .query("boardElements")
          .withIndex("by_owner_board_item", (q) =>
            q
              .eq("ownerId", board.ownerId)
              .eq("boardId", board._id)
              .eq("data.itemId", op.itemId),
          )
          .unique();
        if (existing) {
          const token = await membershipToken(ctx, board, op.itemId);
          if (
            existing.data.type === "item" &&
            existing.data.membership === token
          )
            continue;
          await removeElement(ctx, existing);
        }
        if (!(await membershipToken(ctx, board, op.itemId)))
          await decideMembership(
            ctx,
            board.ownerId,
            { itemId: op.itemId, labelId: board.labelId },
            "include",
          );
        await ctx.db.insert("boardElements", {
          ownerId: board.ownerId,
          boardId: board._id,
          key: op.key,
          data: {
            type: "item",
            x: op.x,
            y: op.y,
            width: 300,
            imageHeight: 200,
            textHeight: 120,
            mode: "combined",
            itemId: op.itemId,
            membership: (await membershipToken(ctx, board, op.itemId))!,
          },
        });
        changed = true;
      } else {
        const element = await elementByKey(ctx, board, op.key);
        if (element) {
          await removeElement(ctx, element);
          changed = true;
        }
      }
    }
    const ack = {
      revision: board.revision + Number(changed),
      session: args.session,
      sequence: args.sequence,
    };
    if (changed)
      await ctx.db.patch(board._id, {
        revision: ack.revision,
        updatedAt: Date.now(),
      });
    if (receipt) await ctx.db.delete(receipt._id);
    await ctx.db.insert("boardReceipts", {
      ownerId: board.ownerId,
      boardId: board._id,
      session: args.session,
      sequence: args.sequence,
      fingerprint,
      acknowledgment: ack,
      expiresAt: Date.now() + 7 * 86400000,
    });
    await ctx.scheduler.runAfter(
      7 * 86400000,
      internal.boardOperations.purgeReceipts,
      {},
    );
    return ack;
  },
});
export const purgeReceipts = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("boardReceipts")
      .withIndex("by_expiry", (q) => q.lte("expiresAt", Date.now()))
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 100)
      await ctx.scheduler.runAfter(
        0,
        internal.boardOperations.purgeReceipts,
        {},
      );
    return null;
  },
});
