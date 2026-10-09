import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { ownedBoard } from "./boards";
import { validElement } from "./boardState";
import { invalid } from "./boardValidators";
import { sourceKindOf } from "./itemState";
export const preview = v.object({
  itemId: v.id("items"),
  title: v.string(),
  body: v.string(),
  source: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  labels: v.array(
    v.object({ id: v.id("labels"), name: v.string(), unsure: v.boolean() }),
  ),
});
export async function previewItem(ctx: QueryCtx, item: Doc<"items">) {
  const asset = item.imageAssets[0];
  const url = asset
    ? asset.kind === "stored"
      ? await ctx.storage.getUrl(asset.storageId)
      : asset.url
    : null;
  const imageUrl = url && /^https?:\/\//i.test(url) ? url : null;
  const links = await ctx.db
    .query("itemLabels")
    .withIndex("by_owner_item_decision", (q) =>
      q
        .eq("ownerId", item.ownerId)
        .eq("itemId", item._id)
        .eq("manualDecision", "include"),
    )
    .take(4);
  const labels = [];
  for (const link of links) {
    const label = await ctx.db.get(link.labelId);
    if (label?.ownerId === item.ownerId)
      labels.push({
        id: label._id,
        name: label.name,
        unsure: Boolean(link.unsure),
      });
  }
  return {
    itemId: item._id,
    title: (
      item.sourceMetadata?.title ||
      (item.inputType === "text"
        ? item.originalInput.split("\n")[0]
        : item.originalUrl) ||
      "Saved item"
    ).slice(0, 200),
    body: (
      item.extractedText ||
      item.sourceMetadata?.description ||
      item.originalInput
    ).slice(0, 1000),
    source: sourceKindOf(item),
    imageUrl,
    labels,
  };
}
export const placed = query({
  args: { boardId: v.id("boards"), keys: v.array(v.string()) },
  returns: v.array(preview),
  handler: async (ctx, { boardId, keys }) => {
    const board = await ownedBoard(ctx, boardId);
    if (keys.length > 20) invalid("Preview batch exceeds 20");
    const result = [];
    for (const key of new Set(keys)) {
      const element = await ctx.db
        .query("boardElements")
        .withIndex("by_owner_board_key", (q) =>
          q.eq("ownerId", board.ownerId).eq("boardId", boardId).eq("key", key),
        )
        .unique();
      if (
        element?.data.type !== "item" ||
        !(await validElement(ctx, board, element))
      )
        continue;
      result.push(
        await previewItem(ctx, (await ctx.db.get(element.data.itemId))!),
      );
    }
    return result;
  },
});
