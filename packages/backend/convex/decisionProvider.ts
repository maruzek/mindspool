// Pure mapping between Items/Labels and a decision model's request/response.
// No Convex and no network, so the rules are cheap to test and a second
// provider (Jev, OpenAI Decisions) only has to implement DecisionProvider.

export const LABEL_THRESHOLD = 0.5;
export const UNSURE_THRESHOLD = 0.65;
export const MAX_QUESTIONS = 64;
/** Total characters of item content sent to the model; the cost guard on every run. */
export const AI_INPUT_CHAR_LIMIT = 500;
export const QUESTION_VERSION = "label-noul-v1";
/** USD per million input tokens; output is not billed. */
export const PRICE_PER_MILLION_INPUT_TOKENS = {
  "clef-flash": 0.09,
  clef: 0.24,
} as const;

/** Workers AI neurons per million input tokens (output is not billed). */
export const NEURONS_PER_MILLION_INPUT_TOKENS = {
  "clef-flash": 8182,
  clef: 21818,
} as const;
/**
 * The hosted prompt wraps every request, so even a tiny item costs ~650 input
 * tokens (recorded runs). Added to the estimate so it never undershoots.
 */
export const REQUEST_OVERHEAD_TOKENS = 600;

export type ClefProvider = keyof typeof PRICE_PER_MILLION_INPUT_TOKENS;

export type Question = {
  type: "noul";
  instructions: string;
  criteria?: { true: string };
};

export type LabelInput = {
  _id: string;
  _creationTime: number;
  name: string;
  description?: string;
};

export type ItemInput = {
  originalInput: string;
  originalUrl?: string;
  canonicalUrl?: string;
  extractedText?: string;
  sourceMetadata?: {
    title?: string;
    description?: string;
    author?: string;
    siteName?: string;
  };
};

export type Answer = { labelId: string; probability: number };
export type Classification = {
  confident: Answer[];
  unsure: Answer[];
  below: Answer[];
};

export type DecisionRequest = {
  state: Record<string, unknown>;
  questions: Record<string, Question>;
};
export type DecisionResult = {
  /** Model name as reported by the provider. */
  model?: string;
  answers: Answer[];
  inputTokens: number;
};
export interface DecisionProvider {
  decide(request: DecisionRequest): Promise<DecisionResult>;
}

/** The labels a run asks about (most recently created first) and how many exist. */
export function selectLabels<T extends { _creationTime: number }>(
  labels: T[],
): { selected: T[]; asked: number; total: number } {
  const selected = [...labels]
    .sort((a, b) => b._creationTime - a._creationTime)
    .slice(0, MAX_QUESTIONS);
  return { selected, asked: selected.length, total: labels.length };
}

export function toQuestions(
  labels: Pick<LabelInput, "_id" | "name" | "description">[],
): Record<string, Question> {
  if (labels.length > MAX_QUESTIONS) throw new Error("Too many questions");
  return Object.fromEntries(
    labels.map((label) => [
      label._id,
      {
        type: "noul" as const,
        instructions: `Does this item belong in the label "${label.name}"?`,
        ...(label.description && { criteria: { true: label.description } }),
      },
    ]),
  );
}

/**
 * Item content as the model's state, at most AI_INPUT_CHAR_LIMIT characters in
 * total. Fields are added in priority order and the extracted text takes
 * whatever budget is left, so a long article never pushes out the title or URL.
 * A field already contained in an earlier one (a tweet's description repeating
 * its title) is skipped rather than sent twice.
 */
export function buildState(item: ItemInput): Record<string, unknown> {
  const meta = item.sourceMetadata ?? {};
  const state: Record<string, unknown> = {};
  const seen: string[] = [];
  let remaining = AI_INPUT_CHAR_LIMIT;
  let truncated = false;
  const add = (key: string, value: string | undefined) => {
    const text = value?.trim();
    if (!text || seen.some((earlier) => earlier.includes(text))) return;
    seen.push(text);
    if (remaining <= 0) {
      truncated = true;
      return;
    }
    state[key] = text.slice(0, remaining);
    if (text.length > remaining) truncated = true;
    remaining -= text.length;
  };
  add("title", meta.title);
  add("description", meta.description);
  add("author", meta.author);
  add("site", meta.siteName);
  add("url", item.canonicalUrl ?? item.originalUrl);
  add("text", item.extractedText ?? item.originalInput);
  state.truncated = truncated;
  return state;
}

/** True when the item has text worth sending to the model. */
export function hasUsableText(item: ItemInput) {
  const meta = item.sourceMetadata ?? {};
  return [
    meta.title,
    meta.description,
    item.extractedText,
    item.originalInput,
  ].some((value) => value?.trim());
}

/** Safe to store on a run: built only from fixed text, never from secrets or provider bodies. */
export class DecisionError extends Error {}

function malformed(reason: string): never {
  throw new DecisionError(`Malformed decision response: ${reason}`);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strictly map the unwrapped `result` body to probabilities. Anything the
 * request did not ask for, or that is not a noul probability in [0, 1],
 * rejects the whole response; model output is never trusted as free text.
 */
export function parseAnswers(body: unknown, askedIds: string[]): Answer[] {
  if (!isRecord(body) || !isRecord(body.answers)) malformed("no answers");
  const asked = new Set(askedIds);
  const answers: Answer[] = [];
  for (const [labelId, answer] of Object.entries(body.answers)) {
    if (!asked.has(labelId)) malformed("unknown question id");
    if (!isRecord(answer) || answer.type !== "noul")
      malformed("answer is not a noul");
    const probability = answer.noul;
    if (
      typeof probability !== "number" ||
      !Number.isFinite(probability) ||
      probability < 0 ||
      probability > 1
    )
      malformed("probability out of range");
    answers.push({ labelId, probability });
  }
  if (answers.length !== asked.size) malformed("missing answers");
  return answers;
}

export function parseUsage(body: unknown): number {
  const usage = isRecord(body) ? body.usage : undefined;
  const tokens = isRecord(usage) ? usage.input_tokens : undefined;
  if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens < 0)
    malformed("usage");
  return tokens;
}

export function classify(answers: Answer[]): Classification {
  const result: Classification = { confident: [], unsure: [], below: [] };
  for (const answer of answers) {
    if (answer.probability >= UNSURE_THRESHOLD) result.confident.push(answer);
    else if (answer.probability >= LABEL_THRESHOLD) result.unsure.push(answer);
    else result.below.push(answer);
  }
  return result;
}

export function neuronsFor(provider: ClefProvider, inputTokens: number) {
  return (inputTokens / 1e6) * NEURONS_PER_MILLION_INPUT_TOKENS[provider];
}

/**
 * Upper-ish bound on a run's neurons before it happens: the serialized request
 * at 3 characters per token (real text is nearer 4) plus the fixed overhead.
 */
export function estimateNeurons(
  provider: ClefProvider,
  state: Record<string, unknown>,
  questions: Record<string, Question>,
) {
  const chars = JSON.stringify(state).length + JSON.stringify(questions).length;
  return neuronsFor(provider, chars / 3 + REQUEST_OVERHEAD_TOKENS);
}

export function costUsd(provider: ClefProvider, inputTokens: number) {
  return (inputTokens / 1e6) * PRICE_PER_MILLION_INPUT_TOKENS[provider];
}

/** A provider call that has not answered by now is abandoned, so the run can fail instead of hanging. */
export const PROVIDER_TIMEOUT_MS = 60_000;

export const WORKERS_AI_BASE = "https://api.cloudflare.com/client/v4";

/** Workers AI REST implementation. Errors never carry the token, account id or response body. */
export function workersAiProvider({
  accountId,
  token,
  provider,
  fetchFn = fetch,
}: {
  accountId: string;
  token: string;
  provider: ClefProvider;
  fetchFn?: typeof fetch;
}): DecisionProvider {
  return {
    async decide(request) {
      let response: Response;
      try {
        response = await fetchFn(
          `${WORKERS_AI_BASE}/accounts/${encodeURIComponent(accountId)}/ai/run/@cf/cloudflare/${provider}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ model: provider, ...request }),
            signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
          },
        );
      } catch {
        throw new DecisionError("Provider request failed");
      }
      if (!response.ok)
        throw new DecisionError(`Provider returned HTTP ${response.status}`);
      let envelope: unknown;
      try {
        envelope = await response.json();
      } catch {
        throw new DecisionError("Provider returned invalid JSON");
      }
      if (!isRecord(envelope) || envelope.success === false)
        malformed("unsuccessful envelope");
      const result = (envelope as Record<string, unknown>).result;
      return {
        model:
          isRecord(result) && typeof result.model === "string"
            ? result.model.slice(0, 128)
            : undefined,
        answers: parseAnswers(result, Object.keys(request.questions)),
        inputTokens: parseUsage(result),
      };
    },
  };
}
