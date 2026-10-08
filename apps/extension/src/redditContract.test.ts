import { describe, expect, it } from "vitest";
import {
  normalizeRedditId,
  redditCaptureKey,
  redditCommentUrl,
  redditIdentityFromUrl,
  redditPostUrl,
  renderRedditCapture,
} from "@mindspool/schema";

describe("Reddit identity contract", () => {
  it("normalizes complete IDs and the correct fullname kind", () => {
    expect(normalizeRedditId("T3_ABC123", "post")).toBe("abc123");
    expect(normalizeRedditId("t1_REPLY1", "comment")).toBe("reply1");
    expect(normalizeRedditId("ABC123", "post")).toBe("abc123");
    for (const id of [
      "",
      " abc123",
      "abc123!",
      "a/b",
      "a".repeat(33),
      "t1_abc123",
    ])
      expect(normalizeRedditId(id, "post")).toBeNull();
    expect(normalizeRedditId("t3_abc123", "comment")).toBeNull();
  });

  it.each([
    [
      "https://www.reddit.com/r/example/comments/ABC123/old_title/?utm_source=x#fragment",
      { postId: "abc123" },
    ],
    ["https://reddit.com/comments/abc123/changed_title/", { postId: "abc123" }],
    [
      "https://www.reddit.com/comments/abc123/_/reply1/",
      { postId: "abc123", commentId: "reply1" },
    ],
    [
      "https://www.reddit.com/r/example/comments/abc123/comment/reply1/?context=3",
      { postId: "abc123", commentId: "reply1" },
    ],
    [
      "/r/example/comments/abc123/title/reply1/",
      { postId: "abc123", commentId: "reply1" },
    ],
  ])("resolves %s without depending on metadata", (url, expected) => {
    expect(redditIdentityFromUrl(url)).toEqual(expected);
  });

  it.each([
    "https://evil.example/r/example/comments/abc123/title/",
    "https://www.reddit.com.evil.example/comments/abc123/",
    "https://user:password@www.reddit.com/comments/abc123/",
    "javascript:/comments/abc123/",
    "https://www.reddit.com/comments/abc-123/title/",
    "https://www.reddit.com/comments/abc123/title/reply1/extra/",
    "https://www.reddit.com/user/abc123/",
    "https://www.reddit.com/comments/",
  ])("rejects unrelated or malformed identity URLs: %s", (url) => {
    expect(redditIdentityFromUrl(url)).toBeNull();
  });

  it("derives the same key and verified URLs from normalized identity", () => {
    expect(redditCaptureKey("ABC123")).toBe("reddit:abc123");
    expect(redditPostUrl("t3_ABC123")).toBe(
      "https://www.reddit.com/comments/abc123/",
    );
    expect(redditCommentUrl("ABC123", "t1_REPLY1")).toBe(
      "https://www.reddit.com/comments/abc123/_/reply1/",
    );
    expect(() => redditPostUrl("abc123/evil")).toThrow();
    expect(() => redditCommentUrl("abc123", "t3_abc123")).toThrow();
  });

  it("renders separate ordered snapshots without interpreting HTML", () => {
    expect(
      renderRedditCapture({
        postId: "abc123",
        postText: "Post text\nSecond paragraph",
        outboundUrl: "https://example.com/article",
        comments: [
          {
            commentId: "reply1",
            postId: "abc123",
            author: "u/reader",
            text: "<b>Plain</b> 😀",
            permalink: "https://www.reddit.com/comments/abc123/_/reply1/",
            capturedAt: 1,
          },
          {
            commentId: "parent1",
            postId: "abc123",
            text: "Another selection",
            permalink: "https://www.reddit.com/comments/abc123/_/parent1/",
            capturedAt: 2,
          },
        ],
      }),
    ).toBe(
      "Post\n\nPost text\nSecond paragraph\n\nhttps://example.com/article\n\nSelected comments\n\nu/reader\n<b>Plain</b> 😀\nhttps://www.reddit.com/comments/abc123/_/reply1/\n\nComment\nAnother selection\nhttps://www.reddit.com/comments/abc123/_/parent1/",
    );
    expect(
      renderRedditCapture({ postId: "abc123", postText: "", comments: [] }),
    ).toBe("");
  });
});
