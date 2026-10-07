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
  AI_INPUT_CHAR_LIMIT,
  estimateNeurons,
  neuronsFor,
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
  it("caps all content at the limit and keeps the title", () => {
    const state = buildState({
      originalInput: "x",
      extractedText: "a".repeat(100000),
      sourceMetadata: { title: "Title" },
    });
    expect(state.title).toBe("Title");
    expect((state.text as string).length).toBe(AI_INPUT_CHAR_LIMIT - 5);
    expect(state.truncated).toBe(true);
  });
  it("never sends more than the limit in total", () => {
    const long = (c: string) => c.repeat(1000);
    const state = buildState({
      originalInput: "x",
      originalUrl: `https://e.com/${long("u")}`,
      extractedText: long("t"),
      sourceMetadata: {
        title: long("a"),
        description: long("b"),
        author: long("c"),
        siteName: long("d"),
      },
    });
    const { truncated, ...content } = state;
    const total = Object.values(content).join("").length;
    expect(total).toBeLessThanOrEqual(AI_INPUT_CHAR_LIMIT);
    expect(truncated).toBe(true);
  });
  it("sends a description equal to the title once", () => {
    const state = buildState({
      originalInput: "x",
      originalUrl: "https://x.com/a/1",
      extractedText: "tweet body",
      sourceMetadata: { title: "Same words", description: "Same words" },
    });
    expect(state).toEqual({
      title: "Same words",
      url: "https://x.com/a/1",
      text: "tweet body",
      truncated: false,
    });
  });
  it("skips a field contained in an earlier one, case-sensitively", () => {
    const state = buildState({
      originalInput: "x",
      extractedText: "hello",
      sourceMetadata: { title: "Say hello there", description: "Hello" },
    });
    expect(state).toEqual({
      title: "Say hello there",
      description: "Hello",
      truncated: false,
    });
  });
  it("leaves a short item unchanged and not truncated", () => {
    expect(buildState({ originalInput: "buy milk" }).truncated).toBe(false);
  });
});

describe("neuronsFor", () => {
  it("prices a million input tokens at the published rate", () => {
    expect(neuronsFor("clef-flash", 1e6)).toBe(8182);
    expect(neuronsFor("clef", 1e6)).toBe(21818);
    expect(neuronsFor("clef-flash", 0)).toBe(0);
  });
});

describe("estimateNeurons", () => {
  const questions = (n: number) =>
    toQuestions(
      Array.from({ length: n }, (_, i) => ({
        _id: `label${i}`,
        name: `Label number ${i}`,
        description: "Some description of what belongs here",
      })),
    );

  it("is never below the recorded real runs (about 652 and 642 tokens, 5 labels)", () => {
    const state = buildState({
      originalInput: "Pasta recipe: boil water, add salt",
    });
    for (const real of [652, 642])
      expect(
        estimateNeurons("clef-flash", state, questions(5)),
      ).toBeGreaterThanOrEqual(neuronsFor("clef-flash", real));
  });
  it("grows with content and labels and with the model rate", () => {
    const small = buildState({ originalInput: "a" });
    const big = buildState({ originalInput: "a".repeat(500) });
    expect(estimateNeurons("clef-flash", big, questions(5))).toBeGreaterThan(
      estimateNeurons("clef-flash", small, questions(5)),
    );
    expect(estimateNeurons("clef-flash", small, questions(20))).toBeGreaterThan(
      estimateNeurons("clef-flash", small, questions(5)),
    );
    expect(estimateNeurons("clef", small, questions(5))).toBeGreaterThan(
      estimateNeurons("clef-flash", small, questions(5)),
    );
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
