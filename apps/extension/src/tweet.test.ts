import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTweet } from "./tweet";

const load = (name: string) => {
  const host = document.createElement("div");
  // Vitest runs from the package root; under jsdom `import.meta.url` is not a file URL.
  host.innerHTML = readFileSync(
    join(process.cwd(), "src/__fixtures__", `${name}.html`),
    "utf8",
  );
  return host.querySelector("article")!;
};

describe("parseTweet", () => {
  it("reads a plain tweet, keeping emoji, links and line breaks", () => {
    expect(parseTweet(load("plain"))).toEqual({
      id: "1001",
      url: "https://x.com/jane/status/1001",
      author: "Jane Doe",
      handle: "jane",
      text: "Fresh sourdough starter, day three 🍞\nStill bubbling. See example.com/starter",
      images: [],
    });
  });
  it("reads photos at large size, in order", () => {
    expect(parseTweet(load("images"))).toMatchObject({
      id: "1002",
      author: "Pics & Co",
      handle: "pics",
      text: "Two photos",
      images: [
        "https://pbs.twimg.com/media/AAA?format=jpg&name=large",
        "https://pbs.twimg.com/media/BBB?format=png&name=large",
      ],
    });
  });
  it("accepts a tweet with images and no text", () => {
    expect(parseTweet(load("image-only"))).toMatchObject({
      id: "1005",
      text: "",
      images: ["https://pbs.twimg.com/media/CCC?format=jpg&name=large"],
    });
  });
  it("reads a reply as its own text, not the 'Replying to' line", () => {
    expect(parseTweet(load("reply"))).toMatchObject({
      id: "1003",
      handle: "sam",
      text: "Agreed.",
    });
  });
  it("ignores everything inside a quoted tweet", () => {
    expect(parseTweet(load("quoted"))).toEqual({
      id: "1004",
      url: "https://x.com/quoter/status/1004",
      author: "Quoter",
      handle: "quoter",
      text: "This, but with a quote",
      images: [],
    });
  });
  it("ignores a quoted tweet's media even without a quote marker (real X markup)", () => {
    expect(parseTweet(load("quoted-thumb-only"))).toEqual({
      id: "1007",
      url: "https://x.com/atomic/status/1007",
      author: "atomic.chat",
      handle: "atomic_chat_hq",
      text: "Local beat the cloud",
      images: [],
    });
  });
  it("keeps the tweet's own photo and drops the quoted one (real X markup)", () => {
    expect(parseTweet(load("quoted-outer-photo"))).toMatchObject({
      id: "1008",
      text: "My photo, their quote",
      images: ["https://pbs.twimg.com/media/OUTERPHOTO?format=jpg&name=large"],
    });
  });
  it("returns null with no text and no images", () => {
    expect(parseTweet(load("empty"))).toBeNull();
  });
  it("returns null without a status link", () => {
    expect(parseTweet(load("no-id"))).toBeNull();
  });
  it("does not change the page", () => {
    const article = load("plain");
    const before = article.outerHTML;
    parseTweet(article);
    expect(article.outerHTML).toBe(before);
  });
});
