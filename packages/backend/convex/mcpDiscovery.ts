import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { listLabelItemsPage, searchLabelItemsPage } from "./itemLabels";
import { itemDetailFor, listItemsPage, searchItemsPage } from "./items";
import { listLabelsPage } from "./labels";
import { itemDetail, itemPreview, sourceKind } from "./validators";

// Internal only: `ownerId` always comes from the verified MCP principal, never
// from tool arguments. Public library functions never take an owner.

const SNIPPET_CHARS = 120;
const cursorArg = v.union(v.string(), v.null());

/** A Convex cursor that does not belong to this query is the caller's input error. */
async function paginated<T>(cursor: string | null, read: () => Promise<T>) {
  try {
    return await read();
  } catch (error) {
    if (cursor === null || error instanceof ConvexError) throw error;
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Invalid cursor; start again without one",
    });
  }
}

export const listLabels = internalQuery({
  args: { ownerId: v.string(), cursor: cursorArg, limit: v.number() },
  returns: v.object({
    labels: v.array(
      v.object({
        _id: v.id("labels"),
        name: v.string(),
        description: v.optional(v.string()),
        hasItems: v.boolean(),
      }),
    ),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { ownerId, cursor, limit }) => {
    const page = await paginated(cursor, () =>
      listLabelsPage(ctx, ownerId, { cursor, numItems: limit }),
    );
    return {
      labels: await Promise.all(
        page.page.map(async (label) => ({
          _id: label._id,
          name: label.name,
          ...(label.description ? { description: label.description } : {}),
          // One index row proves membership (confirmed or suggested); no counter.
          hasItems:
            (await ctx.db
              .query("itemLabels")
              .withIndex("by_owner_label_decision", (q) =>
                q
                  .eq("ownerId", ownerId)
                  .eq("labelId", label._id)
                  .eq("manualDecision", "include"),
              )
              .first()) !== null,
        })),
      ),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

const notFound = (message = "Not found") =>
  new ConvexError({ code: "NOT_FOUND", message });

/** Exact, case-insensitive name or an owned id; foreign and missing ids are identical. */
export async function resolveLabel(
  ctx: QueryCtx,
  ownerId: string,
  { labelId, labelName }: { labelId?: string; labelName?: string },
): Promise<Doc<"labels"> | null> {
  if (labelId !== undefined && labelName !== undefined)
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Give labelId or labelName, not both",
    });
  if (labelId !== undefined) {
    const id = ctx.db.normalizeId("labels", labelId);
    const label = id ? await ctx.db.get(id) : null;
    if (!label || label.ownerId !== ownerId) throw notFound();
    return label;
  }
  if (labelName !== undefined) {
    const label = await ctx.db
      .query("labels")
      .withIndex("by_owner_name", (q) =>
        q
          .eq("ownerId", ownerId)
          .eq("normalizedName", labelName.trim().toLowerCase()),
      )
      .unique();
    if (!label)
      throw notFound("No label with that name; call mindspool_list_labels");
    return label;
  }
  return null;
}

/** Start of the saved content, whitespace collapsed; ends with … when cut. */
export function snippetOf(text: string | undefined) {
  const flat = text?.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  return flat.length > SNIPPET_CHARS
    ? `${flat.slice(0, SNIPPET_CHARS).trimEnd()}…`
    : flat;
}

const summary = v.object({
  ...itemPreview.fields,
  snippet: v.optional(v.string()),
  linkedItemCount: v.optional(v.number()),
});

export async function withSnippets(
  ctx: QueryCtx,
  previews: Infer<typeof itemPreview>[],
  ownerId: string,
) {
  return Promise.all(
    previews.map(async (preview) => {
      const item = await ctx.db.get(preview._id);
      if (!item || item.ownerId !== ownerId) throw notFound();
      const snippet = snippetOf(item.extractedText);
      const count = item.linkedItemStats?.count;
      if (count === undefined)
        throw new ConvexError({
          code: "UNAVAILABLE",
          message: "Resource counts are being prepared; retry shortly",
        });
      return {
        ...preview,
        ...(snippet ? { snippet } : {}),
        ...(count ? { linkedItemCount: Math.min(20, count) } : {}),
      };
    }),
  );
}

const filterArgs = {
  source: v.optional(sourceKind),
  needsReview: v.optional(v.boolean()),
};

export const browseItems = internalQuery({
  args: {
    ownerId: v.string(),
    labelId: v.optional(v.string()),
    labelName: v.optional(v.string()),
    ...filterArgs,
    cursor: cursorArg,
    limit: v.number(),
  },
  returns: v.object({
    label: v.optional(v.object({ _id: v.id("labels"), name: v.string() })),
    items: v.array(summary),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { ownerId, cursor, limit, ...args }) => {
    const label = await resolveLabel(ctx, ownerId, args);
    const paginationOpts = { cursor, numItems: limit };
    const filters = { source: args.source, needsReview: args.needsReview };
    const page = await paginated(cursor, () =>
      label
        ? listLabelItemsPage(ctx, ownerId, {
            labelId: label._id as Id<"labels">,
            paginationOpts,
            ...filters,
          })
        : listItemsPage(ctx, ownerId, { paginationOpts, ...filters }),
    );
    return {
      ...(label ? { label: { _id: label._id, name: label.name } } : {}),
      items: await withSnippets(ctx, page.page, ownerId),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const searchItems = internalQuery({
  args: {
    ownerId: v.string(),
    query: v.string(),
    labelId: v.optional(v.string()),
    labelName: v.optional(v.string()),
    ...filterArgs,
    cursor: cursorArg,
    limit: v.number(),
  },
  returns: v.object({
    items: v.array(summary),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { ownerId, cursor, limit, query, ...args }) => {
    const label = await resolveLabel(ctx, ownerId, args);
    const options = {
      query,
      paginationOpts: { cursor, numItems: limit },
      source: args.source,
      needsReview: args.needsReview,
    };
    const page = await paginated(cursor, () =>
      label
        ? searchLabelItemsPage(ctx, ownerId, { ...options, labelId: label._id })
        : searchItemsPage(ctx, ownerId, options),
    );
    return {
      items: await withSnippets(ctx, page.page, ownerId),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

const detailLabel = v.object({
  id: v.id("labels"),
  name: v.string(),
  suggested: v.optional(v.literal(true)),
});

const linkedItem = v.object({
  itemId: v.id("items"),
  url: v.string(),
  title: v.optional(v.string()),
  snippet: v.optional(v.string()),
  enrichment: itemDetail.fields.enrichmentStatus,
});
async function linkedRows(ctx: QueryCtx, itemId: Id<"items">, ownerId: string) {
  return ctx.db
    .query("items")
    .withIndex("by_owner_from", (q) =>
      q.eq("ownerId", ownerId).eq("fromItemId", itemId),
    )
    .take(21);
}

export const getItem = internalQuery({
  args: { ownerId: v.string(), itemId: v.string() },
  returns: v.object({
    ...itemDetail.fields,
    labels: v.array(detailLabel),
    labelsTruncated: v.boolean(),
    linkedItems: v.optional(v.array(linkedItem)),
    linkedItemsTruncated: v.optional(v.boolean()),
  }),
  handler: async (ctx, { ownerId, itemId }) => {
    const item = await itemDetailFor(ctx, ownerId, itemId);
    if (!item) throw notFound();
    const children = await linkedRows(ctx, item._id, ownerId);
    const links = await ctx.db
      .query("itemLabels")
      .withIndex("by_owner_item_decision", (q) =>
        q
          .eq("ownerId", ownerId)
          .eq("itemId", item._id)
          .eq("manualDecision", "include"),
      )
      .take(101);
    const labels = await Promise.all(
      links.slice(0, 100).map(async (link) => {
        const label = await ctx.db.get(link.labelId);
        if (!label || label.ownerId !== ownerId) return null;
        return {
          id: label._id,
          name: label.name,
          ...(link.unsure ? { suggested: true as const } : {}),
        };
      }),
    );
    return {
      ...item,
      ...(children.length
        ? {
            linkedItems: children.slice(0, 20).map((child) => ({
              itemId: child._id,
              url: child.originalUrl ?? child.originalInput,
              ...(child.sourceMetadata?.title
                ? { title: child.sourceMetadata.title.slice(0, 512) }
                : {}),
              ...(snippetOf(child.extractedText)
                ? { snippet: snippetOf(child.extractedText) }
                : {}),
              enrichment: child.enrichmentStatus,
            })),
            linkedItemsTruncated: children.length > 20,
          }
        : {}),
      labels: labels.filter((label) => label !== null),
      labelsTruncated: links.length > 100,
    };
  },
});

// Migration is isolated from normal reads: each query has a byte-bounded page,
// and a revision check retries if any child was inserted/deleted while counting.
export const resourceCountState = internalQuery({
  args: { itemId: v.id("items") },
  returns: v.union(
    v.object({
      ownerId: v.string(),
      revision: v.number(),
      count: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db.get(itemId);
    return item
      ? {
          ownerId: item.ownerId,
          revision: item.linkedItemStats?.revision ?? 0,
          ...(item.linkedItemStats?.count !== undefined
            ? { count: item.linkedItemStats.count }
            : {}),
        }
      : null;
  },
});
export const resourceCountPage = internalQuery({
  args: { itemId: v.id("items"), ownerId: v.string(), cursor: cursorArg },
  returns: v.object({
    count: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { itemId, ownerId, cursor }) => {
    const page = await ctx.db
      .query("items")
      .withIndex("by_owner_from", (q) =>
        q.eq("ownerId", ownerId).eq("fromItemId", itemId),
      )
      .paginate({ numItems: 20, maximumBytesRead: 512 * 1024, cursor });
    return {
      count: page.page.length,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
export const saveResourceCount = internalMutation({
  args: {
    itemId: v.id("items"),
    ownerId: v.string(),
    revision: v.number(),
    count: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, { itemId, ownerId, revision, count }) => {
    const item = await ctx.db.get(itemId);
    if (!item) return true;
    if (
      item.ownerId !== ownerId ||
      (item.linkedItemStats?.revision ?? 0) !== revision
    )
      return false;
    await ctx.db.patch(itemId, { linkedItemStats: { count, revision } });
    return true;
  },
});
export const rebuildResourceCount = internalAction({
  args: { itemId: v.id("items") },
  returns: v.object({ updated: v.boolean() }),
  handler: async (ctx, { itemId }): Promise<{ updated: boolean }> => {
    for (let retry = 0; retry < 3; retry++) {
      const state = await ctx.runQuery(
        internal.mcpDiscovery.resourceCountState,
        { itemId },
      );
      if (!state || state.count !== undefined) return { updated: false };
      let cursor: string | null = null;
      let count = 0;
      for (;;) {
        const page: { count: number; isDone: boolean; continueCursor: string } =
          await ctx.runQuery(internal.mcpDiscovery.resourceCountPage, {
            itemId,
            ownerId: state.ownerId,
            cursor,
          });
        count += page.count;
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
      if (
        await ctx.runMutation(internal.mcpDiscovery.saveResourceCount, {
          itemId,
          ...state,
          count,
        })
      )
        return { updated: true };
    }
    throw new ConvexError({
      code: "UNAVAILABLE",
      message: "Resource count changed during migration; retry",
    });
  },
});
export const backfillResourceCounts = internalMutation({
  args: { cursor: v.optional(cursorArg) },
  returns: v.object({ scheduled: v.number(), isDone: v.boolean() }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("items").paginate({
      numItems: 5,
      maximumBytesRead: 512 * 1024,
      cursor: cursor ?? null,
    });
    let scheduled = 0;
    for (const item of page.page)
      if (item.linkedItemStats?.count === undefined) {
        await ctx.scheduler.runAfter(
          0,
          internal.mcpDiscovery.rebuildResourceCount,
          { itemId: item._id },
        );
        scheduled++;
      }
    if (!page.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.mcpDiscovery.backfillResourceCounts,
        { cursor: page.continueCursor },
      );
    return { scheduled, isDone: page.isDone };
  },
});
