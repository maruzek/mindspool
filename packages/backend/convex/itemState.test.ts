import { describe, expect, it } from "vitest";
import {
  LINK_SEARCH_TEXT_MAX,
  SEARCH_TEXT_MAX,
  buildLinkSearchText,
  buildSearchText,
  deriveFlags,
  sourceKindOf,
} from "./itemState";

// Keep in sync with the same list in apps/web/src/library/BrandIcon.test.tsx.
export const SOURCE_FIXTURES: [string, string][] = [
  ["https://x.com/a/status/1", "x"],
  ["https://twitter.com/a", "x"],
  ["https://mobile.twitter.com/a", "x"],
  ["https://www.instagram.com/p/abc", "instagram"],
  ["https://www.tiktok.com/@a/video/1", "tiktok"],
  ["https://vm.tiktok.com/abc", "tiktok"],
  ["https://www.youtube.com/watch?v=1", "youtube"],
  ["https://m.youtube.com/watch?v=1", "youtube"],
  ["https://youtu.be/1", "youtube"],
  ["https://www.reddit.com/r/a", "reddit"],
  ["https://old.reddit.com/r/a", "reddit"],
  ["https://redd.it/abc", "reddit"],
  ["https://example.com/x.com", "web"],
  ["https://notx.com/a", "web"],
  ["https://fakeyoutu.be/1", "web"],
];

describe("sourceKindOf", () => {
  it.each(SOURCE_FIXTURES)("%s is %s", (originalUrl, kind) => {
    expect(sourceKindOf({ inputType: "url", originalUrl })).toBe(kind);
  });
  it("treats text input as a note even when it mentions a link", () => {
    expect(
      sourceKindOf({ inputType: "text", originalUrl: "https://x.com/a" }),
    ).toBe("note");
    expect(sourceKindOf({ inputType: "text" })).toBe("note");
  });
  it("falls back to web for a malformed or missing url", () => {
    expect(sourceKindOf({ inputType: "url", originalUrl: "not a url" })).toBe(
      "web",
    );
    expect(sourceKindOf({ inputType: "url" })).toBe("web");
  });
});

describe("buildSearchText", () => {
  const item = {
    originalInput: "https://example.com/recipe",
    sourceMetadata: {
      title: "Spicy ramen",
      description: "A bowl",
      author: "Sam",
      siteName: "Noodles",
    },
    extractedText: "Boil the noodles.",
  };
  it("puts the title first and includes every source", () => {
    const text = buildSearchText(item);
    expect(text.startsWith("Spicy ramen")).toBe(true);
    for (const part of [
      "A bowl",
      "Sam",
      "Noodles",
      "https://example.com/recipe",
      "Boil the noodles.",
    ])
      expect(text).toContain(part);
  });
  it("never contains undefined and handles a bare note", () => {
    expect(buildSearchText({ originalInput: "buy milk" })).toBe("buy milk");
  });
  it("caps the original input at 512 characters and the whole at the limit", () => {
    const text = buildSearchText({
      originalInput: "a".repeat(5000),
      extractedText: "b".repeat(20000),
    });
    expect(text.length).toBeLessThanOrEqual(SEARCH_TEXT_MAX);
    expect(text).not.toContain("a".repeat(513));
  });
});

describe("buildLinkSearchText", () => {
  it("uses title, site name and a short input, within its cap", () => {
    const text = buildLinkSearchText({
      originalInput: "c".repeat(5000),
      sourceMetadata: {
        title: "T",
        siteName: "S",
        description: "not included",
      },
      extractedText: "not included",
    });
    expect(text.startsWith("T S ")).toBe(true);
    expect(text).not.toContain("not included");
    expect(text.length).toBeLessThanOrEqual(LINK_SEARCH_TEXT_MAX);
  });
});

describe("deriveFlags", () => {
  const settled = {
    hasIncludedLink: true,
    hasUnsureLink: false,
    enrichmentPending: false,
    labelingPending: false,
  };
  it("is out of the inbox when labeled, settled and confirmed", () => {
    expect(deriveFlags(settled)).toEqual({ inbox: false, needsReview: false });
  });
  it("puts an unlabeled item in the inbox without needing review", () => {
    expect(deriveFlags({ ...settled, hasIncludedLink: false })).toEqual({
      inbox: true,
      needsReview: false,
    });
  });
  it("keeps items with pending enrichment or labeling in the inbox", () => {
    expect(deriveFlags({ ...settled, enrichmentPending: true }).inbox).toBe(
      true,
    );
    expect(deriveFlags({ ...settled, labelingPending: true })).toEqual({
      inbox: true,
      needsReview: false,
    });
  });
  it("needs review only for an unsure link, and that is also inbox", () => {
    expect(deriveFlags({ ...settled, hasUnsureLink: true })).toEqual({
      inbox: true,
      needsReview: true,
    });
  });
});
