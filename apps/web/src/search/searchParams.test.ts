import { describe, expect, it } from "vitest";
import {
  SOURCES,
  changeFilters,
  hasFilters,
  validateLibrarySearch,
} from "./searchParams";

describe("validateLibrarySearch", () => {
  it("keeps valid values", () => {
    expect(
      validateLibrarySearch({
        layout: "grid",
        item: "abc",
        q: "ramen",
        source: "x",
        review: 1,
      }),
    ).toEqual({
      layout: "grid",
      item: "abc",
      q: "ramen",
      source: "x",
      review: 1,
    });
  });
  it("turns every unknown or invalid value into an explicit undefined", () => {
    const result = validateLibrarySearch({
      layout: "tiles",
      item: "",
      q: "   ",
      source: "myspace",
      review: 0,
    });
    expect(result).toEqual({
      layout: undefined,
      item: undefined,
      q: undefined,
      source: undefined,
      review: undefined,
    });
    // Present as keys: the router merges parent search under a route's own result.
    expect(Object.keys(result).sort()).toEqual(
      ["item", "layout", "q", "review", "source"].sort(),
    );
  });
  it("accepts every allowed source and nothing else", () => {
    for (const source of SOURCES)
      expect(validateLibrarySearch({ source }).source).toBe(source);
    expect(validateLibrarySearch({ source: "X" }).source).toBeUndefined();
    expect(validateLibrarySearch({ source: 5 }).source).toBeUndefined();
  });
  it("reads review from the forms the router and a typed URL produce", () => {
    for (const review of [1, "1", true])
      expect(validateLibrarySearch({ review }).review).toBe(1);
    for (const review of [0, "0", "yes", false, 2, null])
      expect(validateLibrarySearch({ review }).review).toBeUndefined();
  });
  it("trims q and reads numbers the router parsed from the URL", () => {
    // Repeated spaces collapse: search splits on whitespace anyway.
    expect(validateLibrarySearch({ q: "  ramen  noodles " }).q).toBe(
      "ramen noodles",
    );
    expect(validateLibrarySearch({ q: 2024 }).q).toBe("2024");
  });
  it("trims q to what the backend accepts: 16 words and 200 characters", () => {
    const words = Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ");
    expect(validateLibrarySearch({ q: words }).q!.split(/\s+/)).toHaveLength(
      16,
    );
    expect(validateLibrarySearch({ q: "a".repeat(500) }).q).toHaveLength(200);
  });
  it("ignores non-string items", () => {
    expect(validateLibrarySearch({ item: 5 }).item).toBeUndefined();
  });
});

describe("changeFilters", () => {
  const prev = {
    layout: "grid" as const,
    item: "abc",
    q: "ramen",
    source: "x" as const,
    review: 1 as const,
  };
  it("drops the selected item and keeps layout and untouched filters", () => {
    expect(changeFilters(prev, { source: "reddit" })).toEqual({
      layout: "grid",
      item: undefined,
      q: "ramen",
      source: "reddit",
      review: 1,
    });
  });
  it("clears a filter when it is set to undefined", () => {
    expect(changeFilters(prev, { q: undefined, review: undefined })).toEqual({
      layout: "grid",
      item: undefined,
      q: undefined,
      source: "x",
      review: undefined,
    });
  });
  it("normalizes the new value", () => {
    expect(changeFilters({}, { q: "  hi  " }).q).toBe("hi");
    expect(changeFilters({}, { q: "   " }).q).toBeUndefined();
  });
});

describe("hasFilters", () => {
  it("is true for a query, a source or review, never for layout or item", () => {
    expect(hasFilters({ q: "a" })).toBe(true);
    expect(hasFilters({ source: "web" })).toBe(true);
    expect(hasFilters({ review: 1 })).toBe(true);
    expect(hasFilters({ layout: "grid", item: "abc" })).toBe(false);
    expect(hasFilters({})).toBe(false);
  });
});
