import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireOwner } from "./auth";
import { nextResetAt, parseDailyLimit, utcDay } from "./aiBudget";
import {
  NEURONS_PER_MILLION_INPUT_TOKENS,
  PRICE_PER_MILLION_INPUT_TOKENS,
} from "./decisionProvider";
import type { ClefProvider } from "./decisionProvider";

// Daily neuron budget, one `aiUsage` row per owner per UTC day. A run reserves
// its estimate when it starts (same transaction that schedules the action, so
// concurrent starts serialize on the row), then settles to the real figure or
// releases when it fails.

const dailyLimit = () => parseDailyLimit(process.env.AI_DAILY_NEURON_LIMIT);

function invalid(): never {
  throw new ConvexError({ code: "INVALID_INPUT", message: "Invalid usage" });
}
function amount(value: number) {
  if (!Number.isFinite(value) || value < 0) invalid();
}

async function todayRow(ctx: MutationCtx, ownerId: string, day: string) {
  const row = await ctx.db
    .query("aiUsage")
    .withIndex("by_owner_day", (q) => q.eq("ownerId", ownerId).eq("day", day))
    .unique();
  if (row) return row;
  const id = await ctx.db.insert("aiUsage", {
    ownerId,
    day,
    neurons: 0,
    reserved: 0,
    inputTokens: 0,
    runs: 0,
  });
  return (await ctx.db.get(id))!;
}

/** Hold `estimate` neurons for a run about to start; throws LIMIT_REACHED and changes nothing past the limit. */
export async function reserve(
  ctx: MutationCtx,
  ownerId: string,
  estimate: number,
) {
  amount(estimate);
  const row = await todayRow(ctx, ownerId, utcDay(Date.now()));
  if (row.neurons + row.reserved + estimate > dailyLimit())
    throw new ConvexError({
      code: "LIMIT_REACHED",
      message: "Daily AI limit reached",
    });
  await ctx.db.patch(row._id, { reserved: row.reserved + estimate });
}

/** Replace a run's reservation with what it really cost. `day` is the day it reserved on. */
export async function settle(
  ctx: MutationCtx,
  ownerId: string,
  day: string,
  reserved: number,
  actualNeurons: number,
  inputTokens: number,
) {
  amount(reserved);
  amount(actualNeurons);
  amount(inputTokens);
  const row = await todayRow(ctx, ownerId, day);
  await ctx.db.patch(row._id, {
    reserved: Math.max(0, row.reserved - reserved),
    neurons: row.neurons + actualNeurons,
    inputTokens: row.inputTokens + inputTokens,
    runs: row.runs + 1,
  });
}

/** Give back a reservation for a run that never ran the model. */
export async function release(
  ctx: MutationCtx,
  ownerId: string,
  day: string,
  reserved: number,
) {
  amount(reserved);
  const row = await todayRow(ctx, ownerId, day);
  await ctx.db.patch(row._id, {
    reserved: Math.max(0, row.reserved - reserved),
  });
}

/** Today's usage for the signed-in owner, for the sidebar meter. */
export const today = query({
  // The client says which UTC day to show, so the handler never reads the clock
  // (a query's result is cached) and the bar rolls over at midnight.
  args: { day: v.string() },
  returns: v.object({
    used: v.number(),
    limit: v.number(),
    fraction: v.number(),
    resetsAt: v.number(),
    tokens: v.number(),
    runs: v.number(),
  }),
  handler: async (ctx, { day }) => {
    const ownerId = await requireOwner(ctx);
    const start = /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(day) : NaN;
    if (!Number.isFinite(start) || utcDay(start) !== day) invalid();
    const row = await ctx.db
      .query("aiUsage")
      .withIndex("by_owner_day", (q) => q.eq("ownerId", ownerId).eq("day", day))
      .unique();
    const limit = dailyLimit();
    const used = (row?.neurons ?? 0) + (row?.reserved ?? 0);
    return {
      used,
      limit,
      fraction: used / limit,
      resetsAt: nextResetAt(start),
      tokens: row?.inputTokens ?? 0,
      runs: row?.runs ?? 0,
    };
  },
});

/**
 * One-off: fold today's runs that predate the budget (they have a cost but no
 * reservation) into the owner's row. Safe to run twice; the row remembers it.
 */
export const backfillToday = internalMutation({
  args: { ownerId: v.string() },
  returns: v.object({ added: v.number(), runs: v.number() }),
  handler: async (ctx, { ownerId }) => {
    const day = utcDay(Date.now());
    const row = await todayRow(ctx, ownerId, day);
    if (row.backfilled) return { added: 0, runs: 0 };
    const runs = (
      await ctx.db
        .query("processingRuns")
        .withIndex("by_owner_item", (q) => q.eq("ownerId", ownerId))
        .take(5000)
    ).filter(
      (r) =>
        r.kind === "decision" &&
        (r.provider === "clef" || r.provider === "clef-flash") &&
        r.costUsd !== undefined &&
        r.reservedNeurons === undefined &&
        utcDay(r._creationTime) === day,
    );
    let neurons = 0;
    let tokens = 0;
    for (const { provider, costUsd } of runs) {
      const price = PRICE_PER_MILLION_INPUT_TOKENS[provider as ClefProvider];
      neurons +=
        (costUsd! / price) *
        NEURONS_PER_MILLION_INPUT_TOKENS[provider as ClefProvider];
      tokens += (costUsd! / price) * 1e6;
    }
    await ctx.db.patch(row._id, {
      neurons: row.neurons + neurons,
      inputTokens: row.inputTokens + tokens,
      runs: row.runs + runs.length,
      backfilled: true,
    });
    return { added: neurons, runs: runs.length };
  },
});
