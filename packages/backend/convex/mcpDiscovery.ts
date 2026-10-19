import { isNormalItem } from "./itemVisibility";
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
import {
  fromPost,
  itemDetailFor,
  listItemsPage,
  searchItemsPage,
} from "./items";
import {
  clipTitle,
  leadingExcerpt,
  matchExcerpt,
  queryTerms,
} from "./mcp/tools/excerpt";
import { contentOf, userInputRelation } from "./mcp/tools/streams";
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
          hasItems: await hasNormalLabelItems(ctx, ownerId, label._id),
        })),
      ),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** Bounded membership hint; stale hidden rows never establish normal membership. */
async function hasNormalLabelItems(
  ctx: QueryCtx,
  ownerId: string,
  labelId: Id<"labels">,
) {
  const links = await ctx.db
    .query("itemLabels")
    .withIndex("by_owner_role_label_decision", (q) =>
      q
        .eq("ownerId", ownerId)
        .eq("libraryRole", undefined)
        .eq("labelId", labelId)
        .eq("manualDecision", "include"),
    )
    .take(20);
  const items = await Promise.all(links.map((link) => ctx.db.get(link.itemId)));
  return items.some((item) => item?.ownerId === ownerId && isNormalItem(item));
}

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
      if (!item || item.ownerId !== ownerId || !isNormalItem(item))
        throw notFound();
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

type PageArgs = {
  ownerId: string;
  labelId?: string;
  labelName?: string;
  source?: Infer<typeof sourceKind>;
  needsReview?: boolean;
  cursor: string | null;
  limit: number;
};

// Selection is shared by the standard and compact shapes, so both enumerate
// exactly the same owned items in the same order.
async function browsePage(
  ctx: QueryCtx,
  { ownerId, cursor, limit, ...args }: PageArgs,
) {
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
  return { label, page };
}

async function searchPage(
  ctx: QueryCtx,
  { ownerId, cursor, limit, query, ...args }: PageArgs & { query: string },
) {
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
  return { label, page };
}

const pageArgs = {
  ownerId: v.string(),
  labelId: v.optional(v.string()),
  labelName: v.optional(v.string()),
  ...filterArgs,
  cursor: cursorArg,
  limit: v.number(),
};
const labelResult = v.optional(
  v.object({ _id: v.id("labels"), name: v.string() }),
);

export const browseItems = internalQuery({
  args: pageArgs,
  returns: v.object({
    label: labelResult,
    items: v.array(summary),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { label, page } = await browsePage(ctx, args);
    return {
      ...(label ? { label: { _id: label._id, name: label.name } } : {}),
      items: await withSnippets(ctx, page.page, args.ownerId),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const searchItems = internalQuery({
  args: { ...pageArgs, query: v.string() },
  returns: v.object({
    items: v.array(summary),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { page } = await searchPage(ctx, args);
    return {
      items: await withSnippets(ctx, page.page, args.ownerId),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

const TITLE_UNITS = 512;
const ROW_LABELS = 3;

const compactRow = v.object({
  _id: v.id("items"),
  title: v.optional(v.string()),
  titleTruncated: v.optional(v.literal(true)),
  url: v.optional(v.string()),
  excerpt: v.optional(
    v.object({
      text: v.string(),
      source: v.union(v.literal("content"), v.literal("userInput")),
      truncated: v.boolean(),
    }),
  ),
  enrichment: itemDetail.fields.enrichmentStatus,
  hasDistinctUserInput: v.optional(v.literal(true)),
  linkedItemCount: v.optional(v.number()),
  suggested: v.optional(v.literal(true)),
  needsReview: v.optional(v.literal(true)),
  labels: v.optional(
    v.array(
      v.object({
        _id: v.id("labels"),
        name: v.string(),
        unsure: v.optional(v.boolean()),
      }),
    ),
  ),
  labelsTruncated: v.optional(v.boolean()),
});
const compactPage = v.object({
  label: labelResult,
  items: v.array(compactRow),
  continueCursor: v.string(),
  isDone: v.boolean(),
});

/**
 * One owned page row reduced to what choosing needs. Reads the item body (one
 * document, as the standard shape does) and, only when asked, its labels.
 */
async function compactRows(
  ctx: QueryCtx,
  ownerId: string,
  previews: Infer<typeof itemPreview>[],
  options: {
    label: Doc<"labels"> | null;
    includeLabels: boolean;
    terms?: readonly string[];
  },
) {
  return Promise.all(
    previews.map(async (preview) => {
      const item = await ctx.db.get(preview._id);
      if (!item || item.ownerId !== ownerId || !isNormalItem(item))
        throw notFound();
      const count = item.linkedItemStats?.count;
      if (count === undefined)
        throw new ConvexError({
          code: "UNAVAILABLE",
          message: "Resource counts are being prepared; retry shortly",
        });
      const content = contentOf(item);
      const relation = userInputRelation(item, content);
      const found =
        (options.terms &&
          (() => {
            const hit = matchExcerpt(content, options.terms);
            if (hit) return { ...hit, source: "content" as const };
            const input =
              relation === "distinct"
                ? matchExcerpt(item.originalInput, options.terms)
                : undefined;
            return input && { ...input, source: "userInput" as const };
          })()) ||
        undefined;
      const lead = leadingExcerpt(content);
      const fallback = lead
        ? { ...lead, source: "content" as const }
        : relation === "distinct"
          ? (() => {
              const input = leadingExcerpt(item.originalInput);
              return input && { ...input, source: "userInput" as const };
            })()
          : undefined;
      const excerpt = found ?? fallback;
      const title = item.sourceMetadata?.title
        ? clipTitle(item.sourceMetadata.title, TITLE_UNITS)
        : undefined;
      // Suggestion state is the membership of the requested label itself, never
      // inferred from a preview's label sample; the library scope has the
      // item-level review flag instead.
      const membership = options.label
        ? await ctx.db
            .query("itemLabels")
            .withIndex("by_owner_pair", (q) =>
              q
                .eq("ownerId", ownerId)
                .eq("itemId", item._id)
                .eq("labelId", options.label!._id),
            )
            .unique()
        : null;
      const others = options.includeLabels
        ? await otherLabels(ctx, ownerId, item._id, options.label?._id)
        : undefined;
      return {
        _id: item._id,
        ...(title?.text ? { title: title.text } : {}),
        ...(title?.truncated ? { titleTruncated: true as const } : {}),
        ...(item.originalUrl ? { url: item.originalUrl } : {}),
        ...(excerpt ? { excerpt } : {}),
        enrichment: item.enrichmentStatus,
        ...(relation === "distinct" && excerpt?.source !== "userInput"
          ? { hasDistinctUserInput: true as const }
          : {}),
        ...(count ? { linkedItemCount: Math.min(20, count) } : {}),
        ...(membership?.unsure ? { suggested: true as const } : {}),
        ...(!options.label && item.needsReview
          ? { needsReview: true as const }
          : {}),
        ...(others ?? {}),
      };
    }),
  );
}

/** At most three other owned included labels; a fourth proves truncation. */
async function otherLabels(
  ctx: QueryCtx,
  ownerId: string,
  itemId: Id<"items">,
  exclude: Id<"labels"> | undefined,
) {
  const links = await ctx.db
    .query("itemLabels")
    .withIndex("by_owner_item_decision", (q) =>
      q
        .eq("ownerId", ownerId)
        .eq("itemId", itemId)
        .eq("manualDecision", "include"),
    )
    .take(ROW_LABELS + 2);
  const named = (
    await Promise.all(
      links
        .filter((link) => link.labelId !== exclude)
        .map(async (link) => {
          const label = await ctx.db.get(link.labelId);
          return label && label.ownerId === ownerId
            ? {
                _id: label._id,
                name: label.name,
                ...(link.unsure ? { unsure: true } : {}),
              }
            : null;
        }),
    )
  ).filter((label) => label !== null);
  return {
    labels: named.slice(0, ROW_LABELS),
    labelsTruncated: named.length > ROW_LABELS,
  };
}

export const browseItemsCompact = internalQuery({
  args: { ...pageArgs, includeLabels: v.boolean() },
  returns: compactPage,
  handler: async (ctx, { includeLabels, ...args }) => {
    const { label, page } = await browsePage(ctx, args);
    return {
      ...(label ? { label: { _id: label._id, name: label.name } } : {}),
      items: await compactRows(ctx, args.ownerId, page.page, {
        label,
        includeLabels,
      }),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const searchItemsCompact = internalQuery({
  args: { ...pageArgs, query: v.string(), includeLabels: v.boolean() },
  returns: compactPage,
  handler: async (ctx, { includeLabels, ...args }) => {
    const { label, page } = await searchPage(ctx, args);
    return {
      ...(label ? { label: { _id: label._id, name: label.name } } : {}),
      items: await compactRows(ctx, args.ownerId, page.page, {
        label,
        includeLabels,
        terms: queryTerms(args.query),
      }),
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
    .withIndex("by_owner_role_from", (q) =>
      q
        .eq("ownerId", ownerId)
        .eq("libraryRole", undefined)
        .eq("fromItemId", itemId),
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

const {
  images: _images,
  imageAssets: _assets,
  ...readFields
} = itemDetail.fields;

/**
 * Lean read for efficient modes: the owned item itself, plus labels only for
 * context and the parent post / children only for resources. A continuation
 * with both off reads one document. Images and storage URLs are never read.
 */
export const readItem = internalQuery({
  args: {
    ownerId: v.string(),
    itemId: v.string(),
    context: v.boolean(),
    resources: v.boolean(),
  },
  returns: v.object({
    ...readFields,
    labels: v.optional(v.array(detailLabel)),
    labelsTruncated: v.optional(v.boolean()),
    linkedItems: v.optional(v.array(linkedItem)),
    linkedItemsTruncated: v.optional(v.boolean()),
  }),
  handler: async (ctx, { ownerId, itemId, context, resources }) => {
    const id = ctx.db.normalizeId("items", itemId);
    const item = id ? await ctx.db.get(id) : null;
    if (!item || item.ownerId !== ownerId || !isNormalItem(item))
      throw notFound();
    const children = resources ? await linkedRows(ctx, item._id, ownerId) : [];
    const links = context
      ? await ctx.db
          .query("itemLabels")
          .withIndex("by_owner_item_decision", (q) =>
            q
              .eq("ownerId", ownerId)
              .eq("itemId", item._id)
              .eq("manualDecision", "include"),
          )
          .take(101)
      : [];
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
      _id: item._id,
      _creationTime: item._creationTime,
      inputType: item.inputType,
      originalInput: item.originalInput,
      ...(item.originalUrl ? { originalUrl: item.originalUrl } : {}),
      ...(item.canonicalUrl ? { canonicalUrl: item.canonicalUrl } : {}),
      captureSource: item.captureSource,
      enrichmentStatus: item.enrichmentStatus,
      ...(item.sourceMetadata ? { sourceMetadata: item.sourceMetadata } : {}),
      ...(item.extractedText ? { extractedText: item.extractedText } : {}),
      ...(item.redditCapture ? { redditCapture: item.redditCapture } : {}),
      ...(resources ? await fromPost(ctx, ownerId, item) : {}),
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
      ...(context
        ? {
            labels: labels.filter((label) => label !== null),
            labelsTruncated: links.length > 100,
          }
        : {}),
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
