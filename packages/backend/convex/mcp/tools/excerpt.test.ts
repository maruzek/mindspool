import { describe, expect, it } from "vitest";
import {
  clipTitle,
  EXCERPT_UNITS,
  leadingExcerpt,
  matchExcerpt,
  queryTerms,
} from "./excerpt";

describe("leadingExcerpt", () => {
  it("collapses whitespace and reports no omission for short text", () => {
    expect(leadingExcerpt("  a \n\n b\t c ")).toEqual({
      text: "a b c",
      truncated: false,
    });
  });

  it("returns nothing for blank text", () => {
    expect(leadingExcerpt("  \n ")).toBeUndefined();
    expect(leadingExcerpt(undefined)).toBeUndefined();
  });

  it("caps at the window and flags omitted text, not trailing whitespace", () => {
    expect(leadingExcerpt("x".repeat(EXCERPT_UNITS + 5))).toEqual({
      text: "x".repeat(EXCERPT_UNITS),
      truncated: true,
    });
    expect(leadingExcerpt(`${"x".repeat(EXCERPT_UNITS)}   `)?.truncated).toBe(
      false,
    );
  });

  it("never splits a surrogate pair at the end of the window", () => {
    const text = `${"x".repeat(EXCERPT_UNITS - 1)}😀tail`;
    const excerpt = leadingExcerpt(text)!;
    expect(excerpt.text).toBe("x".repeat(EXCERPT_UNITS - 1));
    expect(excerpt.truncated).toBe(true);
  });
});

describe("queryTerms", () => {
  it("de-duplicates case-insensitively in query order", () => {
    expect(queryTerms("  Foo bar FOO  baz ")).toEqual(["foo", "bar", "baz"]);
  });
});

describe("matchExcerpt", () => {
  const filler = "lorem ipsum ".repeat(60);

  it("centres on a deep match with a little lead-in and flags both sides", () => {
    const excerpt = matchExcerpt(`${filler}needle ${filler}`, ["needle"])!;
    expect(excerpt.text).toContain("needle");
    expect(excerpt.text.length).toBeLessThanOrEqual(EXCERPT_UNITS);
    expect(excerpt.truncated).toBe(true);
    expect(excerpt.text.indexOf("needle")).toBeLessThanOrEqual(40);
  });

  it("matches case-insensitively, including non-ASCII", () => {
    expect(matchExcerpt("Große ÉCOLE here", ["école"])?.text).toContain(
      "ÉCOLE",
    );
  });

  it("takes the earliest match and breaks ties by query order", () => {
    const text = `${filler}beta ${filler}alpha`;
    expect(matchExcerpt(text, ["alpha", "beta"])?.text).toContain("beta");
  });

  it("keeps indices valid where lowercasing changes length", () => {
    // "İ".toLowerCase() is two code units; the match must still land correctly.
    const excerpt = matchExcerpt(`${"İ".repeat(100)} target`, ["target"])!;
    expect(excerpt.text).toContain("target");
  });

  it("treats punctuation literally and returns nothing without a match", () => {
    expect(matchExcerpt("a (b) c", ["(b)"])?.text).toBe("a (b) c");
    expect(matchExcerpt("nothing here", ["missing"])).toBeUndefined();
    expect(matchExcerpt("text", [])).toBeUndefined();
  });
});

describe("clipTitle", () => {
  it("leaves short titles alone and cuts before a split pair", () => {
    expect(clipTitle("short", 10)).toEqual({ text: "short", truncated: false });
    expect(clipTitle("ab😀", 3)).toEqual({ text: "ab", truncated: true });
  });
});
