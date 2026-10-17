import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { listLabelItemsPage } from "./itemLabels";
import { listItemsPage } from "./items";
import { listLabelsPage } from "./labels";
import { itemPreview, sourceKind } from "./validators";

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
});

async function withSnippets(
  ctx: QueryCtx,
  previews: Infer<typeof itemPreview>[],
) {
  return Promise.all(
    previews.map(async (preview) => {
      const snippet = snippetOf((await ctx.db.get(preview._id))?.extractedText);
      return { ...preview, ...(snippet ? { snippet } : {}) };
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
      items: await withSnippets(ctx, page.page),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});
