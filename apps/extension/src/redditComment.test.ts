import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { parseRedditComment } from "./redditComment";

const fixture = readFileSync("src/__fixtures__/reddit/comments.html", "utf8");
const comment = (id: string) =>
  document.querySelector(`shreddit-comment[thingid="t1_${id}"]`)!;
beforeEach(() => {
  document.body.innerHTML = fixture;
});
describe("individual Reddit comments", () => {
  it("reads only a parent's own text, excluding nested replies and controls", () => {
    expect(parseRedditComment(comment("parent1"), "abc123")).toEqual({
      id: "parent1",
      postId: "abc123",
      author: "u/reader",
      text: "Parent paragraph 😀\n\nSecond line\n\nFirst\nSecond link text",
    });
  });
  it("reads an independently eligible reply without including its parent", () => {
    expect(parseRedditComment(comment("reply1"), "abc123")).toEqual({
      id: "reply1",
      postId: "abc123",
      author: "u/replyreader",
      text: "Independent reply",
    });
  });
  it("rejects wrong-post and inconsistent permalink identities", () => {
    expect(parseRedditComment(comment("parent1"), "other1")).toBeNull();
    comment("parent1").setAttribute(
      "permalink",
      "/r/example/comments/abc123/comment/other1/",
    );
    expect(parseRedditComment(comment("parent1"), "abc123")).toBeNull();
  });
  it("allows a deleted author with a readable body, but excludes deleted-empty and hidden content", () => {
    const c = comment("parent1");
    c.setAttribute("author", "[deleted]");
    expect(parseRedditComment(c, "abc123")?.author).toBeUndefined();
    c.querySelector('[slot="comment"]')!.textContent = "[deleted]";
    expect(parseRedditComment(c, "abc123")).toBeNull();
    const r = comment("reply1");
    r.querySelector("details")!.removeAttribute("open");
    expect(parseRedditComment(r, "abc123")).toBeNull();
  });
});
