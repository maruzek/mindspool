import { describe, expect, it } from "vitest";
import {
  buildState,
  classify,
  costUsd,
  hasUsableText,
  MAX_QUESTIONS,
  parseAnswers,
  parseUsage,
  selectLabels,
  STATE_CHAR_BUDGET,
  toQuestions,
} from "./decisionProvider";

const answer = (labelId: string, probability: number) => ({
  labelId,
  probability,
});

describe("classify", () => {
  it("splits at the 50% and 65% thresholds", () => {
    const result = classify([
      answer("a", 0.499),
      answer("b", 0.5),
      answer("c", 0.649),
      answer("d", 0.65),
      answer("e", 1),
    ]);
    expect(result.below.map((x) => x.labelId)).toEqual(["a"]);
    expect(result.unsure.map((x) => x.labelId)).toEqual(["b", "c"]);
    expect(result.confident.map((x) => x.labelId)).toEqual(["d", "e"]);
  });
});

describe("selectLabels", () => {
  it("keeps the 64 most recent and reports asked and total", () => {
    const labels = Array.from({ length: 70 }, (_, i) => ({
      _id: `l${i}`,
      _creationTime: i,
    }));
    const { selected, asked, total } = selectLabels(labels);
    expect(asked).toBe(MAX_QUESTIONS);
    expect(total).toBe(70);
    expect(selected[0]?._id).toBe("l69");
    expect(selected.at(-1)?._id).toBe("l6");
  });
  it("handles no labels", () => {
    expect(selectLabels([])).toEqual({ selected: [], asked: 0, total: 0 });
  });
});

describe("toQuestions", () => {
  it("sends a description as criteria.true and omits it otherwise", () => {
    const questions = toQuestions([
      { _id: "a", name: "Recipes", description: "Cooking instructions" },
      { _id: "b", name: "News" },
      { _id: "c", name: "Blank", description: "" },
    ]);
    expect(questions.a).toEqual({
      type: "noul",
      instructions: 'Does this item belong in the label "Recipes"?',
      criteria: { true: "Cooking instructions" },
    });
    expect(questions.b).not.toHaveProperty("criteria");
    expect(questions.c).not.toHaveProperty("criteria");
  });
  it("refuses more than 64 questions", () => {
    const labels = Array.from({ length: 65 }, (_, i) => ({
      _id: `l${i}`,
      name: "x",
    }));
    expect(() => toQuestions(labels)).toThrow("Too many questions");
  });
});

describe("buildState", () => {
  it("includes metadata, url and text", () => {
    const state = buildState({
      originalInput: "https://example.com/a",
      originalUrl: "https://example.com/a",
      canonicalUrl: "https://example.com/canonical",
      extractedText: "Body",
      sourceMetadata: {
        title: "Title",
        description: "Desc",
        author: "Ann",
        siteName: "Example",
      },
    });
    expect(state).toEqual({
      title: "Title",
      description: "Desc",
      author: "Ann",
      site: "Example",
      url: "https://example.com/canonical",
      text: "Body",
      truncated: false,
    });
  });
  it("falls back to the original input for a note", () => {
    expect(buildState({ originalInput: "buy milk" })).toEqual({
      text: "buy milk",
      truncated: false,
    });
  });
  it("truncates text to the budget and keeps the title", () => {
    const state = buildState({
      originalInput: "x",
      extractedText: "a".repeat(STATE_CHAR_BUDGET * 2),
      sourceMetadata: { title: "Title" },
    });
    expect(state.title).toBe("Title");
    expect((state.text as string).length).toBe(STATE_CHAR_BUDGET - 5);
    expect(state.truncated).toBe(true);
  });
});

describe("hasUsableText", () => {
  it("is false for blank content", () => {
    expect(hasUsableText({ originalInput: "   " })).toBe(false);
    expect(hasUsableText({ originalInput: "note" })).toBe(true);
  });
});

describe("parseAnswers", () => {
  const ok = (extra = {}) => ({
    answers: {
      a: { type: "noul", noul: 0.5355 },
      b: { type: "noul", noul: 0 },
      ...extra,
    },
    usage: { input_tokens: 395, output_tokens: 0 },
  });
  it("maps noul answers and usage", () => {
    expect(parseAnswers(ok(), ["a", "b"])).toEqual([
      answer("a", 0.5355),
      answer("b", 0),
    ]);
    expect(parseUsage(ok())).toBe(395);
  });
  it("rejects malformed responses with a bounded error", () => {
    const cases: unknown[] = [
      null,
      "text",
      {},
      { answers: [] },
      ok({ z: { type: "noul", noul: 0.9 } }),
      ok({ b: { type: "score", score: 1 } }),
      ok({ b: { type: "noul", noul: 1.01 } }),
      ok({ b: { type: "noul", noul: -0.1 } }),
      ok({ b: { type: "noul", noul: "0.9" } }),
      ok({ b: { type: "noul", noul: Number.NaN } }),
      ok({ b: null }),
    ];
    for (const body of cases)
      expect(() => parseAnswers(body, ["a", "b"])).toThrow(
        /^Malformed decision response/,
      );
    expect(() => parseAnswers(ok(), ["a", "b", "c"])).toThrow("missing");
  });
  it("rejects missing or invalid usage", () => {
    for (const body of [
      null,
      {},
      { usage: {} },
      { usage: { input_tokens: -1 } },
    ])
      expect(() => parseUsage(body)).toThrow("usage");
  });
});

describe("costUsd", () => {
  it("prices input tokens per model", () => {
    expect(costUsd("clef-flash", 1_000_000)).toBeCloseTo(0.09);
    expect(costUsd("clef", 500_000)).toBeCloseTo(0.12);
    expect(costUsd("clef", 0)).toBe(0);
  });
});
