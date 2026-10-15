import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { sourceKindOf } from "./itemState";
import { findLink, insertCapture } from "./libraryWriters";
import { extractLinks, MIN_TWEET_LINKS, urlKey } from "../../schema/src/links";

/**
 * Saves each resource a tweet lists as its own link Item, which then gets
 * enriched (title, description, og:image) like any pasted link. Links the
 * owner already has are skipped. Runs once per tweet.
 */
export async function extractTweetLinks(ctx: MutationCtx, itemId: Id<"items">) {
  const tweet = await ctx.db.get(itemId);
  if (
    !tweet ||
    (tweet.sourceKind ?? sourceKindOf(tweet)) !== "x" ||
    !tweet.extractedText ||
    tweet.linksExtracted
  )
    return 0;
  await ctx.db.patch(itemId, { linksExtracted: true });
  const links = extractLinks(tweet.extractedText);
  if (links.length < MIN_TWEET_LINKS) return 0;
  let created = 0;
  for (const [n, link] of links.entries()) {
    if (await findLink(ctx, tweet.ownerId, link)) continue;
    await insertCapture(ctx, tweet.ownerId, {
      originalInput: link,
      inputType: "url",
      captureSource: tweet.captureSource,
      captureKey: `xlink:${itemId}:${n}`,
    });
    created++;
  }
  return created;
}

/** Scheduled by `insertCapture` for every new tweet clip. */
export const extract = internalMutation({
  args: { itemId: v.id("items") },
  returns: v.object({ created: v.number() }),
  handler: async (ctx, { itemId }) => ({
    created: await extractTweetLinks(ctx, itemId),
  }),
});

const KEY_BATCH = 100;
const EXTRACT_BATCH = 5;

/**
 * For data saved before this feature: first gives every link Item its
 * `urlKey`, then extracts the links of every tweet not processed yet. Batches
 * schedule the next one. Safe to run again.
 * Run with `npx convex run tweetLinks:backfill`.
 */
export const backfill = internalMutation({
  args: {
    phase: v.optional(v.union(v.literal("keys"), v.literal("extract"))),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({ updated: v.number() }),
  handler: async (ctx, { phase = "keys", cursor }) => {
    const page = await ctx.db.query("items").paginate({
      numItems: phase === "keys" ? KEY_BATCH : EXTRACT_BATCH,
      cursor: cursor ?? null,
    });
    let updated = 0;
    for (const item of page.page) {
      if (phase === "keys") {
        const key = item.originalUrl ? urlKey(item.originalUrl) : null;
        if (item.inputType !== "url" || item.urlKey || !key) continue;
        await ctx.db.patch(item._id, { urlKey: key });
        updated++;
      } else {
        updated += await extractTweetLinks(ctx, item._id);
      }
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.tweetLinks.backfill, {
        phase,
        cursor: page.continueCursor,
      });
    else if (phase === "keys")
      await ctx.scheduler.runAfter(0, internal.tweetLinks.backfill, {
        phase: "extract",
      });
    return { updated };
  },
});
