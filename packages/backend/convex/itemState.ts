import { internal } from "./_generated/api";
import { UNSURE_THRESHOLD } from "./decisionProvider";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Pure rules for the denormalized facts that search and filters read. Convex
 * plumbing (reading links, patching, counters) lives beside these, not in them.
 */

export type SourceKind =
  "x" | "instagram" | "tiktok" | "youtube" | "reddit" | "web" | "note";

export const SEARCH_TEXT_MAX = 8000;
export const LINK_SEARCH_TEXT_MAX = 1000;
const INPUT_PREFIX = 512;

// Keep in sync with BRAND_HOSTS in apps/web/src/library/itemDisplay.ts.
const HOST_KINDS: [SourceKind, string[]][] = [
  ["x", ["x.com", "twitter.com"]],
  ["instagram", ["instagram.com"]],
  ["tiktok", ["tiktok.com"]],
  ["youtube", ["youtube.com", "youtu.be"]],
  ["reddit", ["reddit.com", "redd.it"]],
];

function hostOf(url: string): string | null {
  try {
    return new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function sourceKindOf(item: {
  inputType: "url" | "text";
  originalUrl?: string;
}): SourceKind {
  if (item.inputType === "text") return "note";
  const host = item.originalUrl ? hostOf(item.originalUrl) : null;
  if (!host) return "web";
  for (const [kind, hosts] of HOST_KINDS)
    if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return kind;
  return "web";
}

interface SearchableItem {
  originalInput: string;
  sourceMetadata?: {
    title?: string;
    description?: string;
    author?: string;
    siteName?: string;
  };
  extractedText?: string;
}

function join(parts: (string | undefined)[], max: number) {
  return parts
    .filter((part): part is string => !!part?.trim())
    .map((part) => part.trim())
    .join(" ")
    .slice(0, max);
}

/** Title first, so the most relevant words survive truncation. */
export function buildSearchText(item: SearchableItem): string {
  const meta = item.sourceMetadata;
  return join(
    [
      meta?.title,
      meta?.description,
      meta?.author,
      meta?.siteName,
      item.originalInput.slice(0, INPUT_PREFIX),
      item.extractedText,
    ],
    SEARCH_TEXT_MAX,
  );
}

/** Repeated on every link of the item, so it stays short and skips extracted text. */
export function buildLinkSearchText(item: SearchableItem): string {
  const meta = item.sourceMetadata;
  return join(
    [meta?.title, meta?.siteName, item.originalInput.slice(0, INPUT_PREFIX)],
    LINK_SEARCH_TEXT_MAX,
  );
}

/** An included model label the owner has not confirmed, below the confident threshold. */
export function isUnsureLink(link: {
  manualDecision: "include" | "exclude";
  origin?: "manual" | "model";
  confirmedAt?: number;
  confidence?: number;
}) {
  return (
    link.manualDecision === "include" &&
    link.origin === "model" &&
    link.confirmedAt === undefined &&
    link.confidence !== undefined &&
    link.confidence < UNSURE_THRESHOLD
  );
}

export interface FlagInputs {
  hasIncludedLink: boolean;
  hasUnsureLink: boolean;
  enrichmentPending: boolean;
  labelingPending: boolean;
}

/** Inbox is anything that still needs attention; needs review is the subset with an unsure label. */
export function deriveFlags(input: FlagInputs) {
  const needsReview = input.hasUnsureLink;
  const inbox =
    !input.hasIncludedLink ||
    input.enrichmentPending ||
    input.labelingPending ||
    needsReview;
  return { inbox, needsReview };
}

const RECENT_RUNS = 3;

type Counts = { total?: number; inbox?: number; needsReview?: number };

/** Applies deltas to the owner's counters, creating the row on first use. Never goes below zero. */
export async function adjustStats(
  ctx: MutationCtx,
  ownerId: string,
  delta: Counts,
) {
  if (!delta.total && !delta.inbox && !delta.needsReview) return;
  const row = await ctx.db
    .query("ownerStats")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();
  const next = (key: keyof Counts) =>
    Math.max(0, (row?.[key] ?? 0) + (delta[key] ?? 0));
  const values = {
    total: next("total"),
    inbox: next("inbox"),
    needsReview: next("needsReview"),
  };
  if (row) await ctx.db.patch(row._id, values);
  else await ctx.db.insert("ownerStats", { ownerId, ...values });
}

/** The link-row copies of item facts; the writer adds `unsure` for the link's own state. */
export function linkSearchFields(item: Doc<"items">) {
  return {
    sourceKind: sourceKindOf(item),
    searchText: buildLinkSearchText(item),
  };
}

/** What an item's denormalized fields should be, from bounded reads of its links and runs. */
async function computeItemState(ctx: MutationCtx, item: Doc<"items">) {
  const { ownerId, _id: itemId } = item;
  const included = await ctx.db
    .query("itemLabels")
    .withIndex("by_owner_item_decision", (q) =>
      q
        .eq("ownerId", ownerId)
        .eq("itemId", itemId)
        .eq("manualDecision", "include"),
    )
    .first();
  const unsure = await ctx.db
    .query("itemLabels")
    .withIndex("by_owner_item_unsure", (q) =>
      q
        .eq("ownerId", ownerId)
        .eq("itemId", itemId)
        .eq("manualDecision", "include")
        .eq("unsure", true),
    )
    .first();
  const runs = await ctx.db
    .query("processingRuns")
    .withIndex("by_owner_item", (q) =>
      q.eq("ownerId", ownerId).eq("itemId", itemId),
    )
    .order("desc")
    .take(RECENT_RUNS);
  const flags = deriveFlags({
    hasIncludedLink: included !== null,
    hasUnsureLink: unsure !== null,
    enrichmentPending: item.enrichmentStatus === "pending",
    labelingPending: runs.some(
      (run) => run.kind === "decision" && run.status === "pending",
    ),
  });
  return {
    sourceKind: sourceKindOf(item),
    searchText: buildSearchText(item),
    inbox: flags.inbox,
    needsReview: flags.needsReview,
  };
}

function differs(
  item: Doc<"items">,
  next: Awaited<ReturnType<typeof computeItemState>>,
) {
  return (
    item.sourceKind !== next.sourceKind ||
    item.searchText !== next.searchText ||
    (item.inbox ?? false) !== next.inbox ||
    (item.needsReview ?? false) !== next.needsReview
  );
}

/**
 * The only code that patches an item's `sourceKind`, `searchText`, `inbox` and
 * `needsReview`, and the only code that moves the inbox/review counters. It
 * recomputes from bounded reads and patches only what changed.
 * (`recountOwnerStats` below repairs drift and may patch them too.)
 */
export async function refreshItemState(
  ctx: MutationCtx,
  itemId: Id<"items">,
): Promise<void> {
  const item = await ctx.db.get(itemId);
  if (!item) return;
  const next = await computeItemState(ctx, item);
  if (!differs(item, next)) return;
  await ctx.db.patch(itemId, next);
  if (item.searchText !== next.searchText) await fanOutLinkText(ctx, itemId);
  await adjustStats(ctx, item.ownerId, {
    inbox: Number(next.inbox) - Number(item.inbox ?? false),
    needsReview: Number(next.needsReview) - Number(item.needsReview ?? false),
  });
}

/** Links rewritten per transaction; more are handled by a scheduled continuation. */
export const FANOUT_BATCH = 100;

/**
 * Brings the item's links (any decision, so a restored label is never stale)
 * in line with the item's current link text. Rows that already match are
 * skipped by the filter, so a continuation needs no cursor: it simply takes
 * the next rows still out of date.
 */
export async function fanOutLinkText(ctx: MutationCtx, itemId: Id<"items">) {
  const item = await ctx.db.get(itemId);
  if (!item) return;
  const fields = linkSearchFields(item);
  const stale = await ctx.db
    .query("itemLabels")
    .withIndex("by_owner_pair", (q) =>
      q.eq("ownerId", item.ownerId).eq("itemId", itemId),
    )
    .filter((q) =>
      q.or(
        q.neq(q.field("searchText"), fields.searchText),
        q.neq(q.field("sourceKind"), fields.sourceKind),
      ),
    )
    .take(FANOUT_BATCH);
  for (const link of stale) await ctx.db.patch(link._id, fields);
  if (stale.length === FANOUT_BATCH)
    await ctx.scheduler.runAfter(0, internal.itemState.fanOutLinks, { itemId });
}

export const fanOutLinks = internalMutation({
  args: { itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, { itemId }) => {
    await fanOutLinkText(ctx, itemId);
    return null;
  },
});

// Whole items are read (up to ~300 KB each with extracted text), so keep a batch well under the 16 MiB read limit.
/**
 * Brings an item's links in line with the item and their own state: source,
 * search text, and whether the link is an unsure model label. Used by the
 * recount for data saved before these fields existed.
 */
async function repairLinks(ctx: MutationCtx, item: Doc<"items">) {
  const fields = linkSearchFields(item);
  const links = await ctx.db
    .query("itemLabels")
    .withIndex("by_owner_pair", (q) =>
      q.eq("ownerId", item.ownerId).eq("itemId", item._id),
    )
    .take(FANOUT_BATCH);
  let repaired = 0;
  for (const link of links) {
    const unsure = isUnsureLink(link);
    if (
      link.sourceKind !== fields.sourceKind ||
      link.searchText !== fields.searchText ||
      (link.unsure ?? false) !== unsure
    ) {
      await ctx.db.patch(link._id, { ...fields, unsure });
      repaired++;
    }
  }
  // Beyond one batch only text and source are caught up, by the usual fan-out.
  if (links.length === FANOUT_BATCH)
    await ctx.scheduler.runAfter(0, internal.itemState.fanOutLinks, {
      itemId: item._id,
    });
  return repaired;
}

const RECOUNT_BATCH = 20;

/**
 * Drift check and repair: recomputes every item's fields and the owner's
 * counters from scratch, in batches (a scheduled continuation carries the
 * running totals). Idempotent; reports what it had to fix. Link rows are
 * repaired by `fanOutLinkText` only when an item's text changes, not here.
 */
export const recountOwnerStats = internalMutation({
  args: {
    ownerId: v.string(),
    cursor: v.optional(v.union(v.string(), v.null())),
    totals: v.optional(
      v.object({
        total: v.number(),
        inbox: v.number(),
        needsReview: v.number(),
        itemsRepaired: v.number(),
        linksRepaired: v.number(),
      }),
    ),
  },
  returns: v.object({
    done: v.boolean(),
    itemsRepaired: v.number(),
    linksRepaired: v.number(),
    statsRepaired: v.boolean(),
  }),
  handler: async (ctx, { ownerId, cursor, totals }) => {
    const acc = totals ?? {
      total: 0,
      inbox: 0,
      needsReview: 0,
      itemsRepaired: 0,
      linksRepaired: 0,
    };
    const page = await ctx.db
      .query("items")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .paginate({ numItems: RECOUNT_BATCH, cursor: cursor ?? null });
    for (const item of page.page) {
      // Links first: the item's flags are derived from the links' `unsure` field,
      // which legacy rows do not have yet.
      acc.linksRepaired += await repairLinks(ctx, {
        ...item,
        sourceKind: sourceKindOf(item),
        searchText: buildSearchText(item),
      });
      const next = await computeItemState(ctx, item);
      if (differs(item, next)) {
        await ctx.db.patch(item._id, next);
        acc.itemsRepaired++;
      }
      acc.total++;
      acc.inbox += Number(next.inbox);
      acc.needsReview += Number(next.needsReview);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.itemState.recountOwnerStats, {
        ownerId,
        cursor: page.continueCursor,
        totals: acc,
      });
      return {
        done: false,
        itemsRepaired: acc.itemsRepaired,
        linksRepaired: acc.linksRepaired,
        statsRepaired: false,
      };
    }
    const row = await ctx.db
      .query("ownerStats")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    const want = {
      total: acc.total,
      inbox: acc.inbox,
      needsReview: acc.needsReview,
    };
    const statsRepaired =
      !row ||
      row.total !== want.total ||
      row.inbox !== want.inbox ||
      row.needsReview !== want.needsReview;
    if (statsRepaired) {
      if (row) await ctx.db.patch(row._id, want);
      else await ctx.db.insert("ownerStats", { ownerId, ...want });
    }
    return {
      done: true,
      itemsRepaired: acc.itemsRepaired,
      linksRepaired: acc.linksRepaired,
      statsRepaired,
    };
  },
});
