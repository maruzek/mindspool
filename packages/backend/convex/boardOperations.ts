import { edgeByKey, setConnection } from "./boardConnections";
import { columnChildren, layoutColumns } from "./boardColumns";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ownedBoard } from "./boards";
import { requireOwned } from "./auth";
import { captureItem, decideMembership } from "./libraryWriters";
import {
  connectionData,
  elementData,
  validateElement,
  acknowledgment,
  finite,
  invalid,
  key as validateKey,
} from "./boardValidators";
export const operation = v.union(
  v.object({ type: v.literal("restore"), key: v.string(), data: elementData }),
  v.object({ type: v.literal("edge"), key: v.string(), data: connectionData }),
  v.object({ type: v.literal("removeEdge"), key: v.string() }),
  v.object({
    type: v.literal("note"),
    key: v.string(),
    originalInput: v.string(),
    x: v.number(),
    y: v.number(),
    columnKey: v.optional(v.string()),
    order: v.optional(v.number()),
  }),
  v.object({ type: v.literal("set"), key: v.string(), data: elementData }),
  v.object({
    columnKey: v.optional(v.string()),
    order: v.optional(v.number()),
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
  touchedConnections = new Set<string>(),
) {
  if (element.data.type === "column") {
    const board = (await ctx.db.get(element.boardId))!;
    for (const child of await columnChildren(ctx, board, element.key)) {
      if (child.data.type !== "item") invalid("Invalid column child");
      const {
        columnKey,
        order,
        freeWidth,
        freeImageHeight,
        freeTextHeight,
        ...data
      } = child.data;
      await ctx.db.patch(child._id, { data });
    }
  }
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
  for (const edge of [...edges, ...targets]) touchedConnections.add(edge.key);
  if (touchedConnections.size > 100) invalid("Operation exceeds atomic bounds");
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
    const touchedConnections = new Set(
      args.operations
        .filter((op) => op.type === "edge" || op.type === "removeEdge")
        .map((op) => op.key),
    );
    let changed = false;
    const columns = new Set<string>();
    const touchedKeys = new Set(args.operations.map((op) => op.key));
    for (const originalOp of args.operations) {
      const op =
        originalOp.type === "note"
          ? {
              type: "place" as const,
              key: originalOp.key,
              x: originalOp.x,
              y: originalOp.y,
              columnKey: originalOp.columnKey,
              order: originalOp.order,
              itemId: await captureItem(ctx, board.ownerId, {
                inputType: "text",
                originalInput: originalOp.originalInput,
                captureKey: `board:${board._id}:${args.session}:${args.sequence}:${originalOp.key}`,
                captureSource: "web",
              }),
            }
          : originalOp;
      validateKey(op.key);
      const previous = await elementByKey(ctx, board, op.key);
      if (previous?.data.type === "column") {
        columns.add(previous.key);
        for (const child of await columnChildren(ctx, board, previous.key))
          touchedKeys.add(child.key);
      }
      if (previous?.data.type === "item" && previous.data.columnKey)
        columns.add(previous.data.columnKey);
      if (touchedKeys.size > 100) invalid("Operation exceeds atomic bounds");
      if (op.type === "edge") {
        if (await setConnection(ctx, board, op.key, op.data)) changed = true;
      } else if (op.type === "removeEdge") {
        const edge = await edgeByKey(ctx, board, op.key);
        if (edge) {
          await ctx.db.delete(edge._id);
          changed = true;
        }
      } else if (op.type === "place") {
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
          await removeElement(ctx, existing, touchedConnections);
        }
        if (!(await membershipToken(ctx, board, op.itemId)))
          await decideMembership(
            ctx,
            board.ownerId,
            { itemId: op.itemId, labelId: board.labelId },
            "include",
          );
        if (op.columnKey) {
          const column = await elementByKey(ctx, board, op.columnKey);
          if (
            column?.data.type !== "column" ||
            !Number.isInteger(op.order) ||
            (op.order ?? -1) < 0
          )
            invalid("Invalid column");
          columns.add(op.columnKey);
        }
        await ctx.db.insert("boardElements", {
          ownerId: board.ownerId,
          boardId: board._id,
          key: op.key,
          data: {
            ...(op.columnKey
              ? {
                  columnKey: op.columnKey,
                  order: op.order!,
                  freeWidth: 300,
                  freeImageHeight: 200,
                  freeTextHeight: 120,
                }
              : {}),
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
      } else if (op.type === "set" || op.type === "restore") {
        validateElement(op.data);
        const element = await elementByKey(ctx, board, op.key);
        if (element && element.data.type !== op.data.type)
          invalid("Element unavailable");
        if (!element && op.data.type === "item" && op.type !== "restore")
          invalid("Element unavailable");
        if (op.data.type === "item") {
          requireOwned(await ctx.db.get(op.data.itemId), board.ownerId);
          if (
            (element &&
              (element.data.type !== "item" ||
                element.data.itemId !== op.data.itemId)) ||
            op.data.membership !==
              (await membershipToken(ctx, board, op.data.itemId))
          )
            invalid("Membership changed");
          const duplicate = await ctx.db
            .query("boardElements")
            .withIndex("by_owner_board_item", (q) =>
              q
                .eq("ownerId", board.ownerId)
                .eq("boardId", board._id)
                .eq(
                  "data.itemId",
                  op.data.type === "item" ? op.data.itemId : undefined,
                ),
            )
            .unique();
          if (duplicate && duplicate.key !== op.key)
            invalid("Item already placed");
        }
        if (op.data.type === "item" && op.data.columnKey) {
          const column = await elementByKey(ctx, board, op.data.columnKey);
          if (column?.data.type !== "column" || op.data.order === undefined)
            invalid("Invalid column");
          columns.add(column.key);
        }
        if (op.data.type === "column") columns.add(op.key);
        if (!element) {
          await ctx.db.insert("boardElements", {
            boardId: board._id,
            ownerId: board.ownerId,
            key: op.key,
            data: op.data,
          });
          changed = true;
        } else if (JSON.stringify(element.data) !== JSON.stringify(op.data)) {
          await ctx.db.patch(element._id, { data: op.data });
          changed = true;
        }
      } else {
        const element = await elementByKey(ctx, board, op.key);
        if (element) {
          await removeElement(ctx, element, touchedConnections);
          changed = true;
        }
      }
    }
    await layoutColumns(ctx, board, columns, touchedKeys);
    const touched = await Promise.all(
      [...touchedKeys].map((key) => elementByKey(ctx, board, key)),
    );
    const ack = {
      elements: touched.flatMap((e) =>
        e ? [{ key: e.key, data: e.data }] : [],
      ),
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
