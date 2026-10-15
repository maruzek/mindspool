import { describe, expect, it } from "vitest";
import { extractLinks, MAX_TWEET_LINKS, urlKey } from "./links";

const noah = `7  Mockup tools every designer should bookmark.

1. https://mocku.com
2. https://studio.morflax.com
3. https://mockupfreak.com
4. https://phone.framer.website
5. https://artboard.studio
6. https://mockupanda.com
7. https://dynamicmockups.com

What did I miss?`;

const palak = `I have tried 100s of UI libraries so far, but I keep coming back to these two: https://ui.aceternity.com and https://reactbits.dev.`;

const simoom = `Bookmark these motion design tools before your next project. 🎬

https://prompt-motion.com - AI motion design with the prompts and skills

https://arqe.ai - Motion templates, animated device mockups, stock library in one place.

https://swishy.ai - AI motion designer for stunning animations and typefaces

https://raylight.app - Build motion
videos in minutes

https://animos.app - Showcase your designs in motion.`;

describe("extractLinks", () => {
  it("finds every resource in the example tweets, in order", () => {
    expect(extractLinks(noah)).toEqual([
      "https://mocku.com",
      "https://studio.morflax.com",
      "https://mockupfreak.com",
      "https://phone.framer.website",
      "https://artboard.studio",
      "https://mockupanda.com",
      "https://dynamicmockups.com",
    ]);
    expect(extractLinks(palak)).toEqual([
      "https://ui.aceternity.com",
      "https://reactbits.dev",
    ]);
    expect(extractLinks(simoom)).toEqual([
      "https://prompt-motion.com",
      "https://arqe.ai",
      "https://swishy.ai",
      "https://raylight.app",
      "https://animos.app",
    ]);
  });

  it("trims sentence punctuation, quotes and unbalanced brackets", () => {
    expect(
      extractLinks(
        `See https://a.com/x. Or (https://b.com/y), "https://c.com/z"! https://d.com/e… https://en.wikipedia.org/wiki/Foo_(bar);`,
      ),
    ).toEqual([
      "https://a.com/x",
      "https://b.com/y",
      "https://c.com/z",
      "https://d.com/e",
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    ]);
  });

  it("skips X, Twitter and t.co links", () => {
    expect(
      extractLinks(
        "https://x.com/a/status/1 https://mobile.twitter.com/b https://t.co/abc https://keep.dev",
      ),
    ).toEqual(["https://keep.dev"]);
  });

  it("skips links without a scheme, with credentials, or too long", () => {
    expect(
      extractLinks(
        `mocku.com e.g. Node.js https://u:p@a.com https://b.com/${"a".repeat(2100)} ftp://c.com`,
      ),
    ).toEqual([]);
  });

  it("drops later links with the same key", () => {
    expect(
      extractLinks(
        "https://mocku.com https://www.mocku.com/ http://mocku.com?utm_source=x",
      ),
    ).toEqual(["https://mocku.com"]);
  });

  it("returns at most the cap", () => {
    const text = Array.from(
      { length: 30 },
      (_, i) => `https://site${i}.com`,
    ).join(" ");
    expect(extractLinks(text)).toHaveLength(MAX_TWEET_LINKS);
  });
});

describe("urlKey", () => {
  it.each([
    ["https://www.Mocku.com/?utm_source=x", "mocku.com"],
    ["http://mocku.com", "mocku.com"],
    ["https://mocku.com:443/", "mocku.com"],
    ["https://a.com/Path/?b=2&a=1#top", "a.com/Path?a=1&b=2"],
    ["https://a.com/p?fbclid=1&gclid=2&si=3&keep=1", "a.com/p?keep=1"],
    ["https://a.com:8080/p", "a.com:8080/p"],
    ["https://a.com./", "a.com"],
  ])("%s → %s", (input, key) => expect(urlKey(input)).toBe(key));

  it("is null for non-http input", () => {
    expect(urlKey("not a url")).toBeNull();
    expect(urlKey("javascript:alert(1)")).toBeNull();
  });
});
