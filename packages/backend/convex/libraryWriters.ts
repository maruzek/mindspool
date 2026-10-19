import { extractLinks } from "../../schema/src/links";
import { extractTweetResources } from "./tweetResourceWriters";
import { isNormalItem } from "./itemVisibility";
import { changeLinkedItemStats } from "./linkedItemStats";
import { invalidateMembership } from "./boardState";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOwned } from "./auth";
import { validateCapture, validateClipContent } from "./validators";
import {
  adjustStats,
  refreshItemState,
  transitionLibraryRole,
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
        | "sourceMetadata"
        | "extractedText"
        | "imageAssets"
        | "redditCapture"
        | "fromItemId"
      >
    >,
) {
  const key = input.inputType === "url" ? urlKey(input.originalInput) : null;
  const tweetClip =
    sourceKindOf({
      inputType: input.inputType,
      originalUrl: input.originalInput,
    }) === "x" && !!input.extractedText?.trim();
  const libraryRole = tweetClip
    ? extractLinks(input.extractedText!).length
      ? ("tweet_source" as const)
      : ("tweet_pending" as const)
    : undefined;
  const itemId = await ctx.db.insert("items", {
    ...input,
    libraryRole,
    ownerId,
    ...(input.inputType === "url" ? { originalUrl: input.originalInput } : {}),
    ...(key ? { urlKey: key } : {}),
    linkedItemStats: { count: 0, revision: 0 },
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
  if (input.fromItemId)
    await changeLinkedItemStats(ctx, ownerId, input.fromItemId, 1);
  await adjustStats(ctx, ownerId, { total: libraryRole ? 0 : 1 });
  if (tweetClip) {
    // Preserve the snapshot and partial resource writes if best-effort extraction fails.
    try {
      if (libraryRole === "tweet_source")
        await extractTweetResources(ctx, itemId, insertCapture);
    } catch {
      /* Scheduled work retries. */
    }
    // Recovery also retries a known source whose initial best-effort writes failed.
    await ctx.scheduler.runAfter(0, internal.tweetLinks.run, { itemId });
    await ctx.scheduler.runAfter(30_000, internal.tweetLinks.recover, {
      itemId,
    });
  } else await processNormalCapture(ctx, itemId);
  await refreshItemState(ctx, itemId);
  return itemId;
}

/** Starts the ordinary pipeline once after pending eligibility resolves. */
export async function promotePendingTweet(
  ctx: MutationCtx,
  itemId: Id<"items">,
) {
  const item = await ctx.db.get(itemId);
  if (item?.libraryRole !== "tweet_pending") return;
  await transitionLibraryRole(ctx, itemId, undefined);
  await processNormalCapture(ctx, itemId);
  await refreshItemState(ctx, itemId);
}

async function processNormalCapture(ctx: MutationCtx, itemId: Id<"items">) {
  try {
    const item = await ctx.db.get(itemId);
    if (!item || !isNormalItem(item)) return;
    if (item.inputType === "url") await startEnrichment(ctx, item, true);
    else {
      const hasLabel = await ctx.db
        .query("labels")
        .withIndex("by_owner_name", (q) => q.eq("ownerId", item.ownerId))
        .first();
      if (hasLabel) await startDecisionOrFail(ctx, item, "clef-flash");
    }
  } catch {
    /* Saving the snapshot is independent of enrichment/classification. */
  }
}

export async function decideMembership(
  ctx: MutationCtx,
  ownerId: string,
  { itemId, labelId }: { itemId: Id<"items">; labelId: Id<"labels"> },
  manualDecision: "include" | "exclude",
) {
  const item = requireOwned(await ctx.db.get(itemId), ownerId);
  requireOwned(isNormalItem(item) ? item : null, ownerId);
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
