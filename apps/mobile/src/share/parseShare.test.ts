import { describe, expect, it } from "vitest";
import { parseShare } from "./parseShare";

const ref = { id: "20", handle: "jack" };

describe("parseShare", () => {
  it.each([
    "https://x.com/jack/status/20",
    "https://x.com/jack/status/20?s=20",
    "https://x.com/jack/status/20?s=20&t=abcDEF",
    "https://twitter.com/jack/status/20",
    "https://mobile.twitter.com/jack/status/20",
    "https://www.x.com/jack/status/20",
    "https://fxtwitter.com/jack/status/20",
    "https://vxtwitter.com/jack/status/20",
    "https://fixupx.com/jack/status/20",
    "http://x.com/jack/status/20",
    "https://x.com/jack/statuses/20",
    "https://x.com/jack/status/20/photo/1",
    "https://x.com/jack/status/20#reply",
    "https://X.COM/jack/status/20",
  ])("reads %s", (text) => {
    expect(parseShare(text)).toEqual({ kind: "x", ref });
  });

  it.each([
    "Look at this post https://x.com/jack/status/20?s=20",
    "https://x.com/jack/status/20?s=20 via X",
    "Check this out\nhttps://x.com/jack/status/20?s=20\nShared from X",
    "(https://x.com/jack/status/20).",
    "  https://x.com/jack/status/20  ",
    "see https://example.com first, then https://x.com/jack/status/20",
  ])("finds the link in %j", (text) => {
    expect(parseShare(text)).toEqual({ kind: "x", ref });
  });

  it("uses i as the handle for links without a user", () => {
    expect(parseShare("https://x.com/i/status/99")).toEqual({
      kind: "x",
      ref: { id: "99", handle: "i" },
    });
    expect(parseShare("https://x.com/i/web/status/99")).toEqual({
      kind: "x",
      ref: { id: "99", handle: "i" },
    });
  });

  it("keeps the first of several links", () => {
    expect(
      parseShare("https://x.com/a/status/1 https://x.com/b/status/2"),
    ).toEqual({ kind: "x", ref: { id: "1", handle: "a" } });
  });

  it.each([
    "",
    "hello",
    "https://example.com/jack/status/20",
    "https://x.com/jack",
    "https://x.com/jack/likes",
    "https://x.com/home",
    "https://x.com/jack/status/abc",
    "https://notx.com/jack/status/20",
    "https://x.com.evil.example/jack/status/20",
    "https://evil.example/?u=https://x.com/jack/status/20",
    "ftp://x.com/jack/status/20",
    "x.com/jack/status/20",
    "https://www.reddit.com/r/a/comments/1/b/",
  ])("does not support %j", (text) => {
    expect(parseShare(text)).toEqual({ kind: "unsupported" });
  });
});
