import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { invalid } from "./boardValidators";
import { columnPositions } from "../../schema/src/boardLayout";
export async function columnChildren(
  ctx: MutationCtx,
  board: Doc<"boards">,
  key: string,
) {
  const children = await ctx.db
    .query("boardElements")
    .withIndex("by_owner_column", (q) =>
      q
        .eq("ownerId", board.ownerId)
        .eq("boardId", board._id)
        .eq("data.columnKey", key),
    )
    .take(101);
  if (children.length > 100) invalid("Column exceeds atomic bounds");
  return children;
}
export async function layoutColumns(
  ctx: MutationCtx,
  board: Doc<"boards">,
  keys: Set<string>,
  touched: Set<string>,
) {
  for (const key of keys) {
    const column = await ctx.db
      .query("boardElements")
      .withIndex("by_owner_board_key", (q) =>
        q.eq("ownerId", board.ownerId).eq("boardId", board._id).eq("key", key),
      )
      .unique();
    if (!column) continue;
    if (column.data.type !== "column") invalid("Invalid column");
    const children = (await columnChildren(ctx, board, key)).sort(
      (a, b) =>
        (a.data.type === "item" ? (a.data.order ?? 0) : 0) -
          (b.data.type === "item" ? (b.data.order ?? 0) : 0) ||
        a.key.localeCompare(b.key),
    );
    const heights = [];
    for (const child of children) {
      if (child.data.type !== "item") invalid("Columns only contain items");
      const item = await ctx.db.get(child.data.itemId);
      const media = Boolean(item?.imageAssets.length);
      heights.push(
        child.data.mode === "image" && media
          ? child.data.imageHeight
          : child.data.mode === "combined" && media
            ? child.data.imageHeight + child.data.textHeight
            : child.data.textHeight,
      );
    }
    const positions = columnPositions(column.data, heights);
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      if (child.data.type !== "item") continue;
      const data = { ...child.data, ...positions[i]!, order: i };
      if (JSON.stringify(child.data) !== JSON.stringify(data)) {
        touched.add(child.key);
        if (touched.size > 100) invalid("Operation exceeds atomic bounds");
        await ctx.db.patch(child._id, { data });
      }
    }
  }
}
