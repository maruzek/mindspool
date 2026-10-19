import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { extractLinks, urlKey } from "../../schema/src/links";
import { sourceKindOf } from "./itemState";
import { changeLinkedItemStats } from "./linkedItemStats";
import { convertTweetSource } from "./tweetSourceState";

type InsertResource = typeof import("./libraryWriters").insertCapture;
export const TWEET_LINKS_VERSION = 2;

/** Legacy two-link processing differs from v2; never recreate the old effective set. */
export function processedTweetKeys(text: string | undefined, version?: number) {
  const links = extractLinks(text ?? "");
  return new Set(
    links.length >= (version === TWEET_LINKS_VERSION ? 1 : 2)
      ? links.map((link) => urlKey(link)!)
      : [],
  );
}

/** Inject the ordinary resource writer so capture and extraction modules do not form a runtime cycle. */
export async function extractTweetResources(
  ctx: MutationCtx,
  itemId: Id<"items">,
  insertResource: InsertResource,
  previousText?: string,
) {
  const tweet = await ctx.db.get(itemId);
  if (!tweet || (tweet.sourceKind ?? sourceKindOf(tweet)) !== "x") return 0;
  const links = extractLinks(tweet.extractedText ?? "");
  const processed = tweet.linksExtracted
    ? processedTweetKeys(
        previousText ?? tweet.extractedText,
        tweet.tweetLinksVersion,
      )
    : new Set<string>();
  if (links.length) await convertTweetSource(ctx, itemId);
  let created = 0;
  for (const [n, link] of links.entries()) {
    const key = urlKey(link)!;
    const existing = await ctx.db
      .query("items")
      .withIndex("by_owner_url_key", (q) =>
        q.eq("ownerId", tweet.ownerId).eq("urlKey", key),
      )
      .first();
    if (existing) {
      if (existing.fromItemId === undefined) {
        await ctx.db.patch(existing._id, { fromItemId: itemId });
        await changeLinkedItemStats(ctx, tweet.ownerId, itemId, 1);
      }
      continue;
    }
    if (processed.has(key)) continue;
    // Appearance order remains the initial identity; expansion may bind that slot to another URL.
    const base = `xlink:${itemId}:${n}`;
    let captureKey = base;
    for (let attempt = 0; ; attempt++) {
      const occupied = await ctx.db
        .query("items")
        .withIndex("by_owner_capture_key", (q) =>
          q.eq("ownerId", tweet.ownerId).eq("captureKey", captureKey),
        )
        .unique();
      if (!occupied) break;
      if (attempt >= 20)
        throw new Error("Tweet resource capture identity exhausted");
      captureKey = `${base}:${hashKey(key)}:${attempt}`;
    }
    await insertResource(ctx, tweet.ownerId, {
      originalInput: link,
      inputType: "url",
      captureSource: tweet.captureSource,
      captureKey,
      fromItemId: itemId,
    });
    created++;
  }
  // A caught error cannot leave a success marker ahead of surviving partial writes.
  await ctx.db.patch(itemId, {
    linksExtracted: true,
    tweetLinksVersion: TWEET_LINKS_VERSION,
  });
  return created;
}

function hashKey(key: string) {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}
