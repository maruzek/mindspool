import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  buildState,
  classify,
  costUsd,
  DecisionError,
  hasUsableText,
  toQuestions,
  workersAiProvider,
} from "./decisionProvider";
import { clefProvider } from "./decisions";

/** Classify one item with Clef / Clef-flash and finish its pending run. */
export const run = internalAction({
  args: {
    runId: v.id("processingRuns"),
    itemId: v.id("items"),
    provider: clefProvider,
  },
  returns: v.null(),
  handler: async (ctx, { runId, itemId, provider }) => {
    const started = Date.now();
    try {
      const input = await ctx.runQuery(internal.decisions.input, {
        runId,
        itemId,
      });
      const counts = { labelsAsked: input.asked, labelsTotal: input.total };
      if (input.labels.length === 0 || !hasUsableText(input.item)) {
        await ctx.runMutation(internal.decisions.complete, {
          runId,
          itemId,
          suggestions: [],
          ...counts,
        });
        return null;
      }
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const token = process.env.CLOUDFLARE_AUTH_TOKEN;
      if (!accountId || !token)
        throw new DecisionError("Labeling is not configured");
      const result = await workersAiProvider({
        accountId,
        token,
        provider,
      }).decide({
        state: buildState(input.item),
        questions: toQuestions(input.labels),
      });
      const { confident, unsure } = classify(result.answers);
      await ctx.runMutation(internal.decisions.complete, {
        runId,
        itemId,
        suggestions: [...confident, ...unsure].map((a) => ({
          labelId: a.labelId as (typeof input.labels)[number]["_id"],
          confidence: a.probability,
        })),
        model: result.model,
        latencyMs: Date.now() - started,
        costUsd: costUsd(provider, result.inputTokens),
        ...counts,
      });
    } catch (error) {
      // Only our own fixed messages reach the run; anything else could echo a secret.
      const message =
        error instanceof DecisionError ? error.message : "Labeling failed";
      await ctx
        .runMutation(internal.processingRuns.finish, {
          runId,
          itemId,
          result: {
            status: "failed",
            error: message,
            latencyMs: Date.now() - started,
          },
        })
        .catch(() => undefined);
    }
    return null;
  },
});
