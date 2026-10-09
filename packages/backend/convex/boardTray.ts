import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { ownedBoard } from "./boards";
import { requireOwned } from "./auth";
import { preview, previewItem } from "./boardPreviews";
import {
  paginationOptsValidator,
  sourceKind,
  validatePagination,
  validateSearchQuery,
} from "./validators";
export const browse = query({
  args: {
    boardId: v.id("boards"),
    scope: v.union(v.literal("label"), v.literal("all")),
    sort: v.union(v.literal("newest"), v.literal("oldest")),
    labelId: v.optional(v.id("labels")),
    query: v.optional(v.string()),
    source: v.optional(sourceKind),
    needsReview: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(preview),
  handler: async (ctx, args) => {
    const board = await ownedBoard(ctx, args.boardId);
    validatePagination(args.paginationOpts);
    const labelId = args.scope === "label" ? board.labelId : args.labelId;
    if (labelId) requireOwned(await ctx.db.get(labelId), board.ownerId);
    const opts = {
      ...args.paginationOpts,
      numItems: Math.min(args.paginationOpts.numItems, 20),
      maximumRowsRead: 20,
      maximumBytesRead: 2 * 1024 * 1024,
    };
    if (args.query && labelId) {
      const text = validateSearchQuery(args.query);
      const page = await ctx.db
        .query("itemLabels")
        .withSearchIndex("search_link", (q) => {
          let found = q
            .search("searchText", text)
            .eq("ownerId", board.ownerId)
            .eq("labelId", labelId)
            .eq("manualDecision", "include");
          if (args.source) found = found.eq("sourceKind", args.source);
          if (args.needsReview) found = found.eq("unsure", true);
          return found;
        })
        .paginate(opts);
      const found = await Promise.all(
        page.page.map((link) => ctx.db.get(link.itemId)),
      );
      return {
        ...page,
        page: await Promise.all(
          found.flatMap((item) =>
            item?.ownerId === board.ownerId ? [previewItem(ctx, item)] : [],
          ),
        ),
      };
    }
    const items = ctx.db.query("items");
    const candidate = args.query
      ? items.withSearchIndex("search_text", (q) => {
          let found = q
            .search("searchText", validateSearchQuery(args.query!))
            .eq("ownerId", board.ownerId);
          if (args.source) found = found.eq("sourceKind", args.source);
          if (args.needsReview) found = found.eq("needsReview", true);
          return found;
        })
      : (!labelId && args.needsReview
          ? args.source
            ? items.withIndex("by_owner_review_source", (q) =>
                q
                  .eq("ownerId", board.ownerId)
                  .eq("needsReview", true)
                  .eq("sourceKind", args.source!),
              )
            : items.withIndex("by_owner_review", (q) =>
                q.eq("ownerId", board.ownerId).eq("needsReview", true),
              )
          : args.source
            ? items.withIndex("by_owner_source", (q) =>
                q.eq("ownerId", board.ownerId).eq("sourceKind", args.source!),
              )
            : items.withIndex("by_owner", (q) => q.eq("ownerId", board.ownerId))
        ).order(args.sort === "oldest" ? "asc" : "desc");
    const page = await candidate.paginate(opts);
    const eligible = await Promise.all(
      page.page.map(async (item) => {
        if (!labelId) return true;
        const link = await ctx.db
          .query("itemLabels")
          .withIndex("by_owner_pair", (q) =>
            q
              .eq("ownerId", board.ownerId)
              .eq("itemId", item._id)
              .eq("labelId", labelId),
          )
          .unique();
        return (
          link?.manualDecision === "include" &&
          (!args.needsReview || link.unsure === true)
        );
      }),
    );
    return {
      ...page,
      page: await Promise.all(
        page.page
          .filter((_, i) => eligible[i])
          .map((item) => previewItem(ctx, item)),
      ),
    };
  },
});
