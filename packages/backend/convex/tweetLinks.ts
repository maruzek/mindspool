import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { refreshItemState, sourceKindOf } from "./itemState";
import { findLink, insertCapture } from "./libraryWriters";
import { extractLinks, MIN_TWEET_LINKS, urlKey } from "../../schema/src/links";

const isTweet = (item: Doc<"items">) =>
  (item.sourceKind ?? sourceKindOf(item)) === "x";

/** Links that were turned into Items from this text (none when below the threshold). */
function extractedKeys(text: string | undefined) {
  const links = text ? extractLinks(text) : [];
  return new Set(
    links.length >= MIN_TWEET_LINKS ? links.map((link) => urlKey(link)) : [],
  );
}

/**
 * Saves each resource a tweet lists as its own link Item, which then gets
 * enriched (title, description, og:image) like any pasted link. Links the
 * owner already has are skipped. Runs once per tweet; when the tweet's text
 * later grows (`previousText`), only links new to that text are considered, so
 * a resource the owner deleted is never re-created.
 */
export async function extractTweetLinks(
  ctx: MutationCtx,
  itemId: Id<"items">,
  previousText?: string,
) {
  const tweet = await ctx.db.get(itemId);
  if (!tweet || !isTweet(tweet) || !tweet.extractedText) return 0;
  if (tweet.linksExtracted && previousText === undefined) return 0;
  const done = tweet.linksExtracted ? extractedKeys(previousText) : new Set();
  await ctx.db.patch(itemId, { linksExtracted: true });
  const links = extractLinks(tweet.extractedText);
  if (links.length < MIN_TWEET_LINKS) return 0;
  let created = 0;
  for (const [n, link] of links.entries()) {
    if (done.has(urlKey(link))) continue;
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

const STATUS =
  /^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})$/;
const FETCH_TIMEOUT_MS = 8000;

/**
 * The post's full text, links expanded, from FxTwitter (the same source the
 * mobile clipper uses). A clip taken from the timeline holds only the text
 * shown before "Show more". Null when the post cannot be fetched.
 */
export async function fetchFullText(tweetUrl: string) {
  const match = STATUS.exec(tweetUrl);
  if (!match) return null;
  const [, handle, id] = match;
  try {
    const response = await fetch(
      `https://api.fxtwitter.com/${handle}/status/${id}`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      code?: unknown;
      tweet?: { id?: unknown; text?: unknown };
    };
    const text = body.tweet?.text;
    if (body.code !== 200 || body.tweet?.id !== id || typeof text !== "string")
      return null;
    return text.trim().slice(0, MAX_TEXT) || null;
  } catch {
    return null;
  }
}

const MAX_TEXT = 100_000;

export const tweet = internalQuery({
  args: { itemId: v.id("items") },
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db.get(itemId);
    return item && isTweet(item) ? (item.originalUrl ?? null) : null;
  },
});

/**
 * Scheduled by `insertCapture` for every new tweet clip: completes the text
 * when the clip was cut short, then extracts the links. Also re-runnable for
 * one tweet: `npx convex run tweetLinks:run '{"itemId": "…"}'`.
 */
export const run = internalAction({
  args: { itemId: v.id("items") },
  returns: v.object({ created: v.number() }),
  handler: async (ctx, { itemId }): Promise<{ created: number }> => {
    const url = await ctx.runQuery(internal.tweetLinks.tweet, { itemId });
    const fullText = url ? await fetchFullText(url) : null;
    return ctx.runMutation(internal.tweetLinks.apply, {
      itemId,
      ...(fullText ? { fullText } : {}),
    });
  },
});

/** Keeps the longer text (the clip's own, unless it was cut short), then extracts. */
export const apply = internalMutation({
  args: { itemId: v.id("items"), fullText: v.optional(v.string()) },
  returns: v.object({ created: v.number() }),
  handler: async (ctx, { itemId, fullText }) => {
    const item = await ctx.db.get(itemId);
    if (!item) return { created: 0 };
    const previous = item.extractedText;
    if (fullText && fullText.length > (previous?.length ?? 0)) {
      await ctx.db.patch(itemId, {
        extractedText: fullText,
        updatedAt: Date.now(),
      });
      await refreshItemState(ctx, itemId);
      return {
        created: await extractTweetLinks(ctx, itemId, previous ?? ""),
      };
    }
    return { created: await extractTweetLinks(ctx, itemId) };
  },
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
