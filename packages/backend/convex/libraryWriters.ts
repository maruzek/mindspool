import { invalidateMembership } from "./boardState";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOwned } from "./auth";
import { validateCapture, validateClipContent } from "./validators";
import {
  adjustStats,
  refreshItemState,
  sourceKindOf,
  linkSearchFields,
} from "./itemState";
import { startDecisionOrFail } from "./decisions";
import { startEnrichment } from "./enrichment";
import { internal } from "./_generated/api";
import { urlKey } from "../../schema/src/links";
type Capture = Pick<
  Doc<"items">,
  "originalInput" | "inputType" | "captureSource" | "captureKey"
> &
  Partial<
    Pick<
      Doc<"items">,
      "sourceMetadata" | "extractedText" | "imageAssets" | "redditCapture"
    >
  >;
export async function captureItem(
  ctx: MutationCtx,
  ownerId: string,
  args: Capture,
) {
  validateCapture(args);
  validateClipContent(args);
  const existing = await ctx.db
    .query("items")
    .withIndex("by_owner_capture_key", (q) =>
      q.eq("ownerId", ownerId).eq("captureKey", args.captureKey),
    )
    .unique();
  if (existing) {
    if (
      existing.originalInput !== args.originalInput ||
      existing.inputType !== args.inputType ||
      existing.captureSource !== args.captureSource
    ) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Capture key already used",
      });
    }
    return existing._id;
  }
  // A link is saved once: a bare link already in the library is that Item.
  // Clips carry their own content, so they keep their capture-key identity.
  if (isPlainLink(args)) {
    const same = await findLink(ctx, ownerId, args.originalInput);
    if (same) return same._id;
  }
  return insertCapture(ctx, ownerId, args);
}

function isPlainLink(args: Capture) {
  return (
    args.inputType === "url" &&
    !args.extractedText &&
    !args.imageAssets?.length &&
    !args.redditCapture &&
    !args.sourceMetadata
  );
}

/** The owner's Item for the same link, if any (by `urlKey`; older duplicates may exist, so the first). */
export async function findLink(ctx: MutationCtx, ownerId: string, url: string) {
  const key = urlKey(url);
  if (!key) return null;
  return ctx.db
    .query("items")
    .withIndex("by_owner_url_key", (q) =>
      q.eq("ownerId", ownerId).eq("urlKey", key),
    )
    .first();
}
/** Shared initial save path; repeats never enter labeling/statistics insertion. */
export async function insertCapture(
  ctx: MutationCtx,
  ownerId: string,
  input: Pick<
    Doc<"items">,
    "originalInput" | "inputType" | "captureSource" | "captureKey"
  > &
    Partial<
      Pick<
        Doc<"items">,
        "sourceMetadata" | "extractedText" | "imageAssets" | "redditCapture"
      >
    >,
) {
  const key = input.inputType === "url" ? urlKey(input.originalInput) : null;
  const itemId = await ctx.db.insert("items", {
    ...input,
    ownerId,
    ...(input.inputType === "url" ? { originalUrl: input.originalInput } : {}),
    ...(key ? { urlKey: key } : {}),
    captureStatus: "captured",
    enrichmentStatus: "not_started",
    imageAssets: input.imageAssets ?? [],
    updatedAt: Date.now(),
    sourceKind: sourceKindOf({
      inputType: input.inputType,
      ...(input.inputType === "url"
        ? { originalUrl: input.originalInput }
        : {}),
    }),
  });
  await adjustStats(ctx, ownerId, { total: 1 });
  // Best effort: an enrichment or labeling problem must never fail the save.
  try {
    const item = await ctx.db.get(itemId);
    if (item && input.inputType === "url") {
      // Labeling waits for the page's title and description (enrichment.complete).
      await startEnrichment(ctx, item, true);
    } else if (item) {
      const hasLabel = await ctx.db
        .query("labels")
        .withIndex("by_owner_name", (q) => q.eq("ownerId", ownerId))
        .first();
      if (hasLabel) await startDecisionOrFail(ctx, item, "clef-flash");
    }
    // A tweet listing resources becomes one Item per resource (tweetLinks.ts).
    if (item?.sourceKind === "x" && item.extractedText)
      await ctx.scheduler.runAfter(0, internal.tweetLinks.run, { itemId });
  } catch {
    // Swallowed on purpose.
  }
  // Not best effort: flags and counters must agree with the stored item.
  await refreshItemState(ctx, itemId);
  return itemId;
}

export async function decideMembership(
  ctx: MutationCtx,
  ownerId: string,
  { itemId, labelId }: { itemId: Id<"items">; labelId: Id<"labels"> },
  manualDecision: "include" | "exclude",
) {
  const item = requireOwned(await ctx.db.get(itemId), ownerId);
  requireOwned(await ctx.db.get(labelId), ownerId);
  const existing = await ctx.db
    .query("itemLabels")
    .withIndex("by_owner_pair", (q) =>
      q.eq("ownerId", ownerId).eq("itemId", itemId).eq("labelId", labelId),
    )
    .unique();
  if (!existing)
    await ctx.db.insert("itemLabels", {
      ownerId,
      itemId,
      labelId,
      manualDecision,
      boardGeneration: 0,
      updatedAt: Date.now(),
      ...linkSearchFields(item),
      unsure: false,
    });
  else if (existing.manualDecision !== manualDecision)
    // A user decision replaces any model attribution on the row.
    await ctx.db.patch(existing._id, {
      manualDecision,
      boardGeneration:
        (existing.boardGeneration ?? 0) + Number(manualDecision === "exclude"),
      updatedAt: Date.now(),
      origin: "manual",
      provider: undefined,
      model: undefined,
      confidence: undefined,
      runId: undefined,
      confirmedAt: undefined,
      ...linkSearchFields(item),
      unsure: false,
    });
  if (manualDecision === "exclude" && existing?.manualDecision === "include")
    await invalidateMembership(ctx, ownerId, labelId, itemId);
  await refreshItemState(ctx, itemId);
}
