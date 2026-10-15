import { v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { startDecisionOrFail } from "./decisions";
import { refreshItemState } from "./itemState";
import { parseMetadata } from "./pageMetadata";
import { finishRun } from "./processingRuns";
import { enrichment } from "./validators";

const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 1024 * 1024;
/** Fails an enrichment whose action never reported back. */
const EXPIRY_MS = 60 * 1000;
const USER_AGENT = "MindSpoolBot/1.0 (+link preview; https://mindspool.app)";

/** A failure with a message safe to store on the run. */
export class EnrichmentError extends Error {}

function blockedIPv4(host: string) {
  const parts = host.split(".").map(Number);
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/** True for a URL the server must not fetch: non-http(s), credentials, localhost or private IP literals. */
export function isBlockedUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return true;
  }
  if (!["http:", "https:"].includes(url.protocol)) return true;
  if (url.username || url.password) return true;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return blockedIPv4(host);
  if (host.startsWith("[")) {
    const ip = host.slice(1, -1);
    return (
      ip === "::" ||
      ip === "::1" ||
      ip.startsWith("::ffff:") ||
      /^f[cd]/.test(ip) ||
      /^fe[89ab]/.test(ip)
    );
  }
  return false;
}

async function readBody(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const bytes = new Uint8Array(Math.min(size, MAX_BODY_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - offset);
    bytes.set(part, offset);
    offset += part.length;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/**
 * Fetches a page's HTML. Redirects are followed by hand so every hop is
 * checked; the body is read only up to a limit. Throws EnrichmentError.
 */
export async function fetchPage(start: string) {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (isBlockedUrl(url)) throw new EnrichmentError("Address not allowed");
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml",
        },
      });
    } catch {
      throw new EnrichmentError("Page could not be reached");
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new EnrichmentError("Bad redirect");
      try {
        url = new URL(location, url).href;
      } catch {
        throw new EnrichmentError("Bad redirect");
      }
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new EnrichmentError(`Page returned ${response.status}`);
    }
    const type = response.headers.get("content-type") ?? "";
    if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(type)) {
      await response.body?.cancel().catch(() => undefined);
      throw new EnrichmentError("Not an HTML page");
    }
    try {
      return { html: await readBody(response), finalUrl: url };
    } catch {
      throw new EnrichmentError("Page could not be read");
    }
  }
  throw new EnrichmentError("Too many redirects");
}

/**
 * Start a pending enrichment run for a link and schedule the fetch. With
 * `thenLabel`, labeling starts when the run settles (see `complete`).
 */
export async function startEnrichment(
  ctx: MutationCtx,
  item: Doc<"items">,
  thenLabel: boolean,
) {
  const runId = await ctx.db.insert("processingRuns", {
    ownerId: item.ownerId,
    itemId: item._id,
    kind: "enrichment",
    status: "pending",
    model: "og-fetch",
    modality: "text",
    questionVersion: "og-v1",
    suggestions: [],
  });
  await ctx.db.patch(item._id, {
    pendingEnrichmentRunId: runId,
    enrichmentStatus: "pending",
    updatedAt: Date.now(),
  });
  const args = { runId, itemId: item._id, thenLabel };
  await ctx.scheduler.runAfter(0, internal.enrichment.run, args);
  await ctx.scheduler.runAfter(EXPIRY_MS, internal.enrichment.expire, args);
  await refreshItemState(ctx, item._id);
  return runId;
}

const runArgs = {
  runId: v.id("processingRuns"),
  itemId: v.id("items"),
  thenLabel: v.boolean(),
};
const resultValidator = v.union(
  v.object({
    status: v.literal("succeeded"),
    enrichment: v.optional(enrichment),
    latencyMs: v.optional(v.number()),
  }),
  v.object({
    status: v.literal("failed"),
    error: v.string(),
    latencyMs: v.optional(v.number()),
  }),
);

/** Settle the run, then (for links being saved) start labeling on the enriched item. */
async function settle(
  ctx: MutationCtx,
  {
    runId,
    itemId,
    thenLabel,
    result,
  }: {
    runId: Id<"processingRuns">;
    itemId: Id<"items">;
    thenLabel: boolean;
    result: Infer<typeof resultValidator>;
  },
) {
  await finishRun(ctx, {
    runId,
    itemId,
    result:
      result.status === "succeeded" ? { ...result, suggestions: [] } : result,
  });
  if (!thenLabel) return;
  // Best effort: a labeling problem must never fail the enrichment.
  try {
    const item = await ctx.db.get(itemId);
    const hasLabel =
      item &&
      (await ctx.db
        .query("labels")
        .withIndex("by_owner_name", (q) => q.eq("ownerId", item.ownerId))
        .first());
    // The user may have started labeling while the page was loading.
    const recent = item
      ? await ctx.db
          .query("processingRuns")
          .withIndex("by_owner_item", (q) =>
            q.eq("ownerId", item.ownerId).eq("itemId", itemId),
          )
          .order("desc")
          .take(20)
      : [];
    const labeling = recent.some((r) => r.kind === "decision");
    if (item && hasLabel && !labeling)
      await startDecisionOrFail(ctx, item, "clef-flash");
  } catch {
    // Swallowed on purpose.
  }
}

export const complete = internalMutation({
  args: { ...runArgs, result: resultValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await settle(ctx, args);
    return null;
  },
});

export const input = internalQuery({
  args: { itemId: v.id("items") },
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db.get(itemId);
    return item?.originalUrl ?? null;
  },
});

export const run = internalAction({
  args: runArgs,
  returns: v.null(),
  handler: async (ctx, { runId, itemId, thenLabel }) => {
    const started = Date.now();
    let outcome: Infer<typeof resultValidator>;
    try {
      const url = await ctx.runQuery(internal.enrichment.input, { itemId });
      if (!url) throw new EnrichmentError("No link to fetch");
      const { html, finalUrl } = await fetchPage(url);
      const page = parseMetadata(html, finalUrl);
      const { title, description, siteName, author } = page;
      const sourceMetadata = Object.fromEntries(
        Object.entries({ title, description, siteName, author }).filter(
          ([, value]) => value !== undefined,
        ),
      );
      outcome = {
        status: "succeeded",
        latencyMs: Date.now() - started,
        enrichment: {
          ...(page.canonicalUrl && { canonicalUrl: page.canonicalUrl }),
          ...(Object.keys(sourceMetadata).length > 0 && { sourceMetadata }),
          ...(page.image && {
            imageAssets: [
              { kind: "external", url: page.image, purpose: "thumbnail" },
            ],
          }),
        },
      };
    } catch (error) {
      // Only our own fixed messages reach the run; anything else could echo a secret.
      outcome = {
        status: "failed",
        error:
          error instanceof EnrichmentError
            ? error.message
            : "Enrichment failed",
        latencyMs: Date.now() - started,
      };
    }
    await ctx
      .runMutation(internal.enrichment.complete, {
        runId,
        itemId,
        thenLabel,
        result: outcome,
      })
      // If even this fails, `expire` fails the run later.
      .catch((failure) =>
        console.error("Could not record enrichment", runId, failure),
      );
    return null;
  },
});

/** Fails a run whose action never reported back, so the item is never left "pending". */
export const expire = internalMutation({
  args: runArgs,
  returns: v.null(),
  handler: async (ctx, { runId, itemId, thenLabel }) => {
    const row = await ctx.db.get(runId);
    if (!row || row.status !== "pending" || !(await ctx.db.get(itemId)))
      return null;
    await settle(ctx, {
      runId,
      itemId,
      thenLabel,
      result: { status: "failed", error: "Enrichment timed out" },
    });
    return null;
  },
});

const BACKFILL_BATCH = 10;
const BACKFILL_DELAY_MS = 5000;

/**
 * Enrich links saved before enrichment existed: ten items per call, then the
 * next batch is scheduled. Safe to run again (only `not_started` links are
 * touched), and labeling is not re-run.
 * Run with `npx convex run enrichment:backfill`.
 */
export const backfill = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({ started: v.number() }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("items")
      .paginate({ numItems: BACKFILL_BATCH, cursor: cursor ?? null });
    let started = 0;
    for (const item of page.page) {
      if (item.inputType !== "url" || item.enrichmentStatus !== "not_started")
        continue;
      await startEnrichment(ctx, item, false);
      started++;
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(
        BACKFILL_DELAY_MS,
        internal.enrichment.backfill,
        { cursor: page.continueCursor },
      );
    return { started };
  },
});
