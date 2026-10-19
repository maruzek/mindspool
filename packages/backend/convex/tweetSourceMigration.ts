import { v, type Infer } from "convex/values";
import { internalMutation } from "./_generated/server";
import { extractLinks, urlKey } from "../../schema/src/links";
import { sourceKindOf } from "./itemState";
import { insertCapture } from "./libraryWriters";
import { changeLinkedItemStats } from "./linkedItemStats";
import {
  extractTweetResources,
  TWEET_LINKS_VERSION,
} from "./tweetResourceWriters";

const phaseValidator = v.union(v.literal("keys"), v.literal("tweets"));
const progress = v.object({
  version: v.literal(2),
  phase: phaseValidator,
  cursor: v.union(v.string(), v.null()),
  isDone: v.boolean(),
  scanned: v.number(),
  eligible: v.number(),
  converted: v.number(),
  created: v.number(),
  repaired: v.number(),
});

/** Owner-scoped, explicit continuation; preview never writes or schedules work. No external fetching. */
export const batch = internalMutation({
  args: {
    ownerId: v.string(),
    version: v.literal(2),
    preview: v.boolean(),
    phase: v.optional(phaseValidator),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: progress,
  handler: async (
    ctx,
    { ownerId, preview, phase = "keys", cursor = null },
  ): Promise<Infer<typeof progress>> => {
    // One tweet can resolve 20 full resource documents: keep that work within the read budget.
    const page = await ctx.db
      .query("items")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .paginate({
        numItems: phase === "keys" ? 20 : 1,
        maximumRowsRead: phase === "keys" ? 20 : 1,
        maximumBytesRead: 1024 * 1024,
        cursor,
      });
    let eligible = 0,
      converted = 0,
      created = 0,
      repaired = 0;
    for (const item of page.page) {
      if (phase === "keys") {
        const key =
          item.inputType === "url" && item.originalUrl
            ? urlKey(item.originalUrl)
            : null;
        const match = /^xlink:([^:]+):\d+$/.exec(item.captureKey);
        const parentId =
          !item.fromItemId && match
            ? ctx.db.normalizeId("items", match[1]!)
            : null;
        const parent = parentId ? await ctx.db.get(parentId) : null;
        const fromItemId = parent?.ownerId === ownerId ? parent._id : undefined;
        const patch = {
          ...(key && !item.urlKey ? { urlKey: key } : {}),
          ...(fromItemId ? { fromItemId } : {}),
        };
        if (Object.keys(patch).length) {
          repaired++;
          if (!preview) {
            await ctx.db.patch(item._id, patch);
            if (fromItemId)
              await changeLinkedItemStats(ctx, ownerId, fromItemId, 1);
          }
        }
        continue;
      }
      // New pending captures have their own decision/recovery lifecycle.
      if (
        item.libraryRole === "tweet_pending" ||
        item.tweetLinksVersion === TWEET_LINKS_VERSION ||
        (item.sourceKind ?? sourceKindOf(item)) !== "x"
      )
        continue;
      const links = extractLinks(item.extractedText ?? "");
      if (links.length) {
        eligible++;
        if (item.libraryRole !== "tweet_source") converted++;
        if (!preview)
          created += await extractTweetResources(ctx, item._id, insertCapture);
      } else if (!preview) {
        await ctx.db.patch(item._id, {
          tweetLinksVersion: TWEET_LINKS_VERSION,
          linksExtracted: true,
        });
      }
    }
    const nextPhase = phase === "keys" && page.isDone ? "tweets" : phase;
    return {
      version: 2,
      phase: nextPhase,
      cursor: page.isDone ? null : page.continueCursor,
      isDone: phase === "tweets" && page.isDone,
      scanned: page.page.length,
      eligible,
      converted,
      created,
      repaired,
    };
  },
});
