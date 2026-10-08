import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { parseRedditPost } from "./reddit";

const fixture = readFileSync("src/__fixtures__/reddit/posts.html", "utf8");
const post = (name: string): Element =>
  document.querySelector(`[data-case="${name}"] shreddit-post`)!;
beforeEach(() => {
  document.body.innerHTML = fixture;
});

describe("rendered Reddit post extraction", () => {
  it("excludes CSS-hidden content and captures it only after reveal", () => {
    const p = post("card-text");
    const body = p.querySelector('[slot="text-body"]')!;
    const style = document.createElement("style");
    style.textContent = ".hidden-body { display:none }";
    document.body.append(style);
    body.classList.add("hidden-body");
    expect(parseRedditPost(p)?.text).toBe("");
    body.classList.remove("hidden-body");
    expect(parseRedditPost(p)?.text).toContain("First paragraph");
  });
  it("respects the rendered slot's shadow ancestors", () => {
    const p = post("card-text");
    p.attachShadow({ mode: "open" }).innerHTML =
      '<div style="display:none"><slot name="text-body"></slot></div>';
    expect(parseRedditPost(p)?.text).toBe("");
    const revealed = p.cloneNode(true) as Element;
    revealed.attachShadow({ mode: "open" }).innerHTML =
      '<div><slot name="text-body"></slot></div>';
    document.body.append(revealed);
    expect(parseRedditPost(revealed)?.text).toContain("First paragraph");
  });
  it("reads the current outer post's identity, metadata and useful plain text", () => {
    expect(parseRedditPost(post("card-text"))).toEqual({
      id: "abc123",
      title: "A useful post",
      author: "u/reader",
      subreddit: "example",
      text: "First paragraph 😀\n\nSecond paragraph\nNext line\n\nOne\nTwo readable link",
      images: [],
    });
  });
  it("keeps feed/detail/compact identities stable without reading collapsed compact text", () => {
    expect(parseRedditPost(post("detail"))).toMatchObject({
      id: "abc123",
      text: "Full available post text",
    });
    expect(parseRedditPost(post("compact"))).toMatchObject({
      id: "abc123",
      text: "",
      images: [],
    });
  });
  it("preserves eligible gallery image parameters and ignores decorative images", () => {
    expect(parseRedditPost(post("gallery"))).toEqual({
      id: "def456",
      title: "Gallery",
      text: "",
      images: [
        "https://preview.redd.it/one.png?width=640&auto=webp",
        "https://i.redd.it/two.jpg",
      ],
    });
  });
  it("captures a video's available poster without player UI images", () => {
    expect(parseRedditPost(post("video"))?.images).toEqual([
      "https://external-preview.redd.it/poster.png?width=640",
    ]);
  });
  it("keeps a crosspost's outer title without embedded original text or media", () => {
    post("crosspost")
      .querySelector('[slot="post-media-container"]')!
      .insertAdjacentHTML(
        "beforeend",
        '<shreddit-post-text-body slot="text-body"><p>Embedded original body</p></shreddit-post-text-body>',
      );
    expect(parseRedditPost(post("crosspost"))).toEqual({
      id: "outer1",
      title: "Outer title",
      author: "u/outerreader",
      subreddit: "example",
      text: "",
      images: [],
    });
  });
  it("excludes unrevealed spoiler media and accepts title-only snapshots", () => {
    expect(parseRedditPost(post("spoiler"))).toEqual({
      id: "spoil1",
      title: "Spoiler title",
      text: "",
      images: [],
    });
  });
  it("uses the outer post's available outbound link without replacing Reddit identity", () => {
    const p = post("card-text");
    p.setAttribute("post-type", "link");
    p.setAttribute("content-href", "https://example.com/article?keep=1");
    expect(parseRedditPost(p)).toMatchObject({
      id: "abc123",
      outboundUrl: "https://example.com/article?keep=1",
    });
  });
  it("rejects inconsistent identities and unsafe outbound links without a partial capture", () => {
    const p = post("card-text");
    p.setAttribute("id", "t3_other1");
    expect(parseRedditPost(p)).toBeNull();
    p.setAttribute("id", "t3_abc123");
    p.setAttribute("content-href", "javascript:alert(1)");
    expect(parseRedditPost(p)).toBeNull();
    p.setAttribute("content-href", "https://user:password@example.com/");
    expect(parseRedditPost(p)).toBeNull();
  });
  it("ignores nested posts and comments even if they appear in a text slot", () => {
    const p = post("card-text");
    p.querySelector('[property="schema:articleBody"]')!.insertAdjacentHTML(
      "beforeend",
      "<shreddit-post><p>Embedded neighbor</p></shreddit-post><shreddit-comment><p>Unselected comment</p></shreddit-comment><button>Vote</button>",
    );
    expect(parseRedditPost(p)?.text).not.toContain("Embedded");
    expect(parseRedditPost(p)?.text).not.toContain("Unselected");
    expect(parseRedditPost(p)?.text).not.toContain("Vote");
  });
  it("does not truncate out-of-bound text or titles", () => {
    const p = post("card-text");
    p.setAttribute("post-title", "a".repeat(301));
    expect(parseRedditPost(p)).toBeNull();
    p.setAttribute("post-title", "Valid title");
    p.querySelector('[slot="text-body"]')!.textContent = "x".repeat(100001);
    expect(parseRedditPost(p)).toBeNull();
  });
  it("rejects a recycled post while its body still identifies another post", () => {
    const p = post("card-text");
    p.setAttribute("id", "t3_other1");
    p.setAttribute("permalink", "/comments/other1/");
    p.setAttribute("content-href", "https://www.reddit.com/comments/other1/");
    expect(parseRedditPost(p)).toBeNull();
    p.querySelector("shreddit-post-text-body")!.setAttribute(
      "post-id",
      "t3_other1",
    );
    expect(parseRedditPost(p)?.id).toBe("other1");
  });
  it("keeps at most ten unique HTTPS image references within URL bounds", () => {
    const p = post("gallery");
    const media = p.querySelector('[slot="post-media-container"]')!;
    media.innerHTML =
      Array.from(
        { length: 12 },
        (_, i) =>
          `<zoomable-img><img src="https://i.redd.it/${i}.jpg" /></zoomable-img>`,
      ).join("") +
      '<img src="javascript:bad" /><img src="https://i.redd.it/0.jpg" />';
    const images = parseRedditPost(p)!.images;
    expect(images).toHaveLength(10);
    expect(images[0]).toBe("https://i.redd.it/0.jpg");
    expect(images[9]).toBe("https://i.redd.it/9.jpg");
  });
});
