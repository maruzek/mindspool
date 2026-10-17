import type { Infer } from "convex/values";
import { describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { itemDetail } from "../../validators";
import { detailOf } from "./shape";

const row = {
  _id: "item" as Id<"items">,
  _creationTime: 0,
  inputType: "text",
  originalInput: "Note",
  captureSource: "web",
  enrichmentStatus: "not_started",
  labels: [],
  labelsTruncated: false,
} satisfies Infer<typeof itemDetail> & { labels: []; labelsTruncated: boolean };

describe("detailOf", () => {
  it("returns an empty, complete window for a clip without saved content", () => {
    expect(detailOf(row, 0)).toMatchObject({
      savedAt: "1970-01-01T00:00:00.000Z",
      linkedPageRead: false,
      userInput: { text: "Note", truncated: false },
      content: { text: "", offset: 0, totalChars: 0, truncated: false },
      links: [],
      linksTruncated: false,
    });
  });

  it("prioritizes canonical links and keeps balanced URL punctuation", () => {
    const detail = detailOf(
      {
        ...row,
        canonicalUrl: "https://example.com/a",
        extractedText:
          "https://www.example.com/a/?utm_source=x (https://example.org/wiki/A_(B)). https://example.org/item[1]]. https://user:password@example.net/secret",
      },
      0,
    );
    expect(detail.links).toEqual([
      { url: "https://example.com/a", role: "canonical" },
      { url: "https://example.org/wiki/A_(B)", role: "in-content" },
      { url: "https://example.org/item[1]", role: "in-content" },
    ]);
  });

  it("does not flag exact content and link limits as truncated", () => {
    const links = Array.from(
      { length: 50 },
      (_, i) => `https://example.com/${i}`,
    ).join(" ");
    const detail = detailOf(
      { ...row, extractedText: links.padEnd(20000, " ") },
      0,
    );
    expect(detail.content.text).toHaveLength(20000);
    expect(detail.content.nextOffset).toBeUndefined();
    expect(detail.content.truncated).toBe(false);
    expect(detail.links).toHaveLength(50);
    expect(detail.linksTruncated).toBe(false);
  });
});

it("extracts URLs with long punctuation tails in bounded time", () => {
  const start = performance.now();
  const detail = detailOf(
    {
      ...row,
      extractedText: `https://example.org/resource${")".repeat(30000)}.`,
    },
    0,
  );
  expect(detail.links).toEqual([
    { url: "https://example.org/resource", role: "in-content" },
  ]);
  // A generous budget catches repeated whole-string scans (several seconds).
  expect(performance.now() - start).toBeLessThan(1000);
});
