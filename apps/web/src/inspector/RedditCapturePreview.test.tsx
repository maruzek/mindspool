import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RedditCapturePreview } from "./RedditCapturePreview";
import type { RedditCapture } from "@mindspool/schema";

afterEach(cleanup);
const capture: RedditCapture = {
  postId: "abc123",
  postText: "Post <b>plain</b>\nSecond paragraph",
  outboundUrl: "https://example.com/article",
  comments: [
    {
      commentId: "reply1",
      postId: "abc123",
      author: "u/reader",
      text: "First selected reply",
      permalink: "https://www.reddit.com/comments/abc123/_/reply1/",
      capturedAt: 1,
    },
    {
      commentId: "parent1",
      postId: "abc123",
      text: "Second selected comment",
      permalink: "https://www.reddit.com/comments/abc123/_/parent1/",
      capturedAt: 2,
    },
  ],
};
it("renders post and independent selected snapshots in saved order as plain text", () => {
  const { container } = render(<RedditCapturePreview capture={capture} />);
  expect(screen.getByRole("heading", { name: "Post" })).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Selected comments" }),
  ).toBeTruthy();
  expect(screen.getByLabelText("Post text").textContent).toBe(
    "Post <b>plain</b>\nSecond paragraph",
  );
  expect(container.querySelector("b")).toBeNull();
  expect(
    [...container.querySelectorAll("li")].map((n) => n.textContent),
  ).toEqual([
    "u/readerFirst selected replyOpen comment on Reddit",
    "Second selected commentOpen comment on Reddit",
  ]);
  const links = screen.getAllByRole("link", { name: "Open comment on Reddit" });
  expect(links.map((n) => n.getAttribute("href"))).toEqual([
    "https://www.reddit.com/comments/abc123/_/reply1/",
    "https://www.reddit.com/comments/abc123/_/parent1/",
  ]);
  for (const link of screen.getAllByRole("link")) {
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  }
});
it("omits a selected-comments section for a post-only capture", () => {
  render(
    <RedditCapturePreview
      capture={{ postId: "abc123", postText: "", comments: [] }}
    />,
  );
  expect(
    screen.queryByRole("heading", { name: "Selected comments" }),
  ).toBeNull();
  expect(
    screen.getByRole("link", { name: "Open post on Reddit" }),
  ).toBeTruthy();
});
it("does not render unsafe or unrelated comment source URLs", () => {
  render(
    <RedditCapturePreview
      capture={{
        ...capture,
        outboundUrl: "javascript:alert(1)",
        comments: capture.comments.map((c) => ({
          ...c,
          permalink: "https://evil.example/comments/abc123/_/reply1/",
        })),
      }}
    />,
  );
  expect(
    screen.queryByRole("link", { name: "Open comment on Reddit" }),
  ).toBeNull();
  expect(screen.queryByRole("link", { name: "Open captured link" })).toBeNull();
  expect(screen.getByText("First selected reply")).toBeTruthy();
});
