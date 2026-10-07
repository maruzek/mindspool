import { describe, expect, it } from "vitest";
import {
  brandOf,
  captureTypeOf,
  displayTitle,
  hostOf,
  hostOfItem,
  kindOf,
  relativeDate,
} from "./itemDisplay";
import { validateLibrarySearch } from "./search";

describe("captureTypeOf", () => {
  it.each([
    ["https://example.com/a", "url"],
    ["  http://example.com \n", "url"],
    ["https://example.com/a b", "text"],
    ["see https://example.com", "text"],
    ["https://user:pw@example.com", "text"],
    ["https://user@example.com", "text"],
    ["ftp://example.com", "text"],
    ["javascript:alert(1)", "text"],
    ["example.com", "text"],
    ["", "text"],
  ])("%j is %s", (input, expected) => {
    expect(captureTypeOf(input)).toBe(expected);
  });
});

describe("hosts and brands", () => {
  it("normalizes hosts", () => {
    expect(hostOf("https://www.Example.com/x")).toBe("example.com");
    expect(hostOf("not a url")).toBeNull();
    expect(hostOf(undefined)).toBeNull();
  });
  it.each([
    ["x.com", "x"],
    ["twitter.com", "x"],
    ["mobile.twitter.com", "x"],
    ["instagram.com", "instagram"],
    ["tiktok.com", "tiktok"],
    ["youtu.be", "youtube"],
    ["music.youtube.com", "youtube"],
    ["old.reddit.com", "reddit"],
    ["redd.it", "reddit"],
    ["notx.com", null],
    ["example.com", null],
  ])("%s maps to %s", (host, brand) => {
    expect(brandOf(host)).toBe(brand);
  });
});

describe("item display", () => {
  const link = {
    inputType: "url" as const,
    originalInput: "https://www.example.com/recipes/soup?x=1",
  };
  it("prefers the extracted title", () => {
    expect(
      displayTitle({ ...link, sourceMetadata: { title: "  Soup  " } }),
    ).toBe("Soup");
  });
  it("falls back to host and path for links", () => {
    expect(displayTitle(link)).toBe("example.com/recipes/soup");
    expect(
      displayTitle({ ...link, originalInput: "https://example.com/" }),
    ).toBe("example.com");
    expect(
      displayTitle({
        ...link,
        originalUrl: "https://a.org/p",
        originalInput: "x",
      }),
    ).toBe("a.org/p");
  });
  it("uses the first non-empty line of a note", () => {
    expect(
      displayTitle({ inputType: "text", originalInput: "\n  \n Hello \nmore" }),
    ).toBe("Hello");
  });
  it("derives kind and host", () => {
    expect(kindOf(link)).toBe("link");
    expect(kindOf({ inputType: "text" })).toBe("note");
    expect(hostOfItem(link)).toBe("example.com");
    expect(
      hostOfItem({ inputType: "text", originalInput: "https://x.com" }),
    ).toBeNull();
  });
});

describe("relativeDate", () => {
  const now = new Date(2026, 9, 7, 12, 0, 0).getTime();
  const ago = (ms: number) => relativeDate(now - ms, now);
  it("uses compact units", () => {
    expect(ago(10_000)).toBe("now");
    expect(ago(-5000)).toBe("now");
    expect(ago(4 * 60_000)).toBe("4m");
    expect(ago(2 * 3_600_000)).toBe("2h");
    expect(ago(3 * 86_400_000)).toBe("3d");
  });
  it("switches to a short date after a week", () => {
    expect(ago(10 * 86_400_000)).toBe("Sep 27");
    expect(relativeDate(new Date(2025, 11, 24, 12).getTime(), now)).toBe(
      "Dec 24, 2025",
    );
  });
});

describe("validateLibrarySearch", () => {
  it("keeps valid values and drops the rest", () => {
    expect(validateLibrarySearch({ layout: "grid", item: "abc" })).toEqual({
      layout: "grid",
      item: "abc",
    });
    expect(validateLibrarySearch({ layout: "tiles", item: 5 })).toEqual({});
    expect(validateLibrarySearch({ item: "" })).toEqual({});
  });
});
