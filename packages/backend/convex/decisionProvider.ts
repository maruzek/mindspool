// Pure mapping between Items/Labels and a decision model's request/response.
// No Convex and no network, so the rules are cheap to test and a second
// provider (Jev, OpenAI Decisions) only has to implement DecisionProvider.

export const LABEL_THRESHOLD = 0.5;
export const UNSURE_THRESHOLD = 0.65;
export const MAX_QUESTIONS = 64;
/** Well inside the 65,536-token hosted context window. */
export const STATE_CHAR_BUDGET = 60000;
export const QUESTION_VERSION = "label-noul-v1";
/** USD per million input tokens; output is not billed. */
export const PRICE_PER_MILLION_INPUT_TOKENS = {
  "clef-flash": 0.09,
  clef: 0.24,
} as const;

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
 * Item content as the model's state. Fields are added in priority order and
 * the extracted text takes whatever budget is left, so a long article never
 * pushes out the title or URL.
 */
export function buildState(item: ItemInput): Record<string, unknown> {
  const meta = item.sourceMetadata ?? {};
  const state: Record<string, unknown> = {};
  let remaining = STATE_CHAR_BUDGET;
  const add = (key: string, value: string | undefined) => {
    const text = value?.trim();
    if (!text || remaining <= 0) return;
    state[key] = text.slice(0, remaining);
    remaining -= text.length;
  };
  add("title", meta.title);
  add("description", meta.description);
  add("author", meta.author);
  add("site", meta.siteName);
  add("url", item.canonicalUrl ?? item.originalUrl);
  add("text", item.extractedText ?? item.originalInput);
  state.truncated = remaining < 0;
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

export function costUsd(provider: ClefProvider, inputTokens: number) {
  return (inputTokens / 1e6) * PRICE_PER_MILLION_INPUT_TOKENS[provider];
}

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
