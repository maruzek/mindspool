import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InspectorPreview } from "./InspectorPreview";
import type { ItemDetail } from "./types";

afterEach(cleanup);

it("renders a structured Reddit discussion without a second flattened copy", () => {
  render(
    <InspectorPreview
      item={link({
        originalInput: "https://www.reddit.com/comments/abc123/",
        originalUrl: "https://www.reddit.com/comments/abc123/",
        sourceMetadata: {
          title: "Reddit post",
          siteName: "Reddit",
          author: "u/reader",
          description: "r/example",
        },
        extractedText: "Flattened duplicate",
        redditCapture: {
          postId: "abc123",
          postText: "Own post body",
          comments: [
            {
              commentId: "reply1",
              postId: "abc123",
              author: "u/replyreader",
              text: "Selected reply body",
              permalink: "https://www.reddit.com/comments/abc123/_/reply1/",
              capturedAt: 1,
            },
          ],
        },
      })}
    />,
  );
  expect(screen.getByRole("heading", { name: "Reddit post" })).toBeTruthy();
  expect(screen.getByLabelText("Post text").textContent).toBe("Own post body");
  expect(screen.getByText("Selected reply body")).toBeTruthy();
  expect(screen.queryByText("Flattened duplicate")).toBeNull();
  expect(screen.queryByLabelText("Text")).toBeNull();
});

const link = (extra: Partial<ItemDetail> = {}): ItemDetail => ({
  _id: "a" as ItemDetail["_id"],
  _creationTime: 0,
  inputType: "url",
  originalInput: "https://x.com/jane/status/1",
  originalUrl: "https://x.com/jane/status/1",
  captureSource: "extension",
  enrichmentStatus: "not_started",
  ...extra,
});
describe("InspectorPreview for a clipped tweet", () => {
  const tweet = link({
    sourceMetadata: { title: "Jane (@jane)", author: "jane", siteName: "X" },
    extractedText: "Line one\nLine two <b>not html</b>",
    images: [
      "https://pbs.twimg.com/media/A.jpg",
      "https://pbs.twimg.com/media/B.jpg",
    ],
  });

  it("shows the title, author and the text with its line breaks as plain text", () => {
    render(<InspectorPreview item={tweet} />);
    expect(screen.getByRole("heading", { name: "Jane (@jane)" })).toBeTruthy();
    expect(screen.getByText("jane")).toBeTruthy();
    const text = screen.getByLabelText("Text");
    expect(text.textContent).toBe("Line one\nLine two <b>not html</b>");
    expect(text.className).toContain("whitespace-pre-wrap");
    expect(text.querySelector("b")).toBeNull();
  });
  it("shows the first image as the header and the rest in a strip", () => {
    const { container } = render(<InspectorPreview item={tweet} />);
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual([
      "https://pbs.twimg.com/media/A.jpg",
      "https://pbs.twimg.com/media/B.jpg",
    ]);
    for (const img of imgs) {
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    }
    expect(
      screen.getByRole("button", { name: "Open image 1 of 2" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open image 2 of 2" }),
    ).toBeTruthy();
  });
  it("shows a hero but no strip for one image", () => {
    const { container } = render(
      <InspectorPreview
        item={link({ images: ["https://pbs.twimg.com/media/A.jpg"] })}
      />,
    );
    expect(screen.queryByLabelText("Text")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("ul")).toBeNull();
  });
  it("gives four images a hero plus three strip buttons", () => {
    const { container } = render(
      <InspectorPreview
        item={link({
          images: [1, 2, 3, 4].map((n) => `https://cdn.test/${n}.jpg`),
        })}
      />,
    );
    expect(container.querySelectorAll("ul button")).toHaveLength(3);
  });
  it("shows the brand tile without images or when the header fails to load", () => {
    const none = render(<InspectorPreview item={link()} />);
    expect(none.container.querySelector("img")).toBeNull();
    expect(none.container.querySelector("svg[data-brand='x']")).not.toBeNull();
    cleanup();
    const broken = render(
      <InspectorPreview
        item={link({ images: ["https://pbs.twimg.com/media/A.jpg"] })}
      />,
    );
    fireEvent.error(broken.container.querySelector("img")!);
    expect(broken.container.querySelector("img")).toBeNull();
    expect(
      broken.container.querySelector("svg[data-brand='x']"),
    ).not.toBeNull();
  });
});

describe("InspectorPreview for other items", () => {
  it("is unchanged for a plain link", () => {
    const { container } = render(
      <InspectorPreview
        item={link({
          originalInput: "https://example.com/a",
          originalUrl: "https://example.com/a",
        })}
      />,
    );
    expect(screen.queryByLabelText("Text")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByText("URL")).toBeTruthy();
  });
  it("still shows a note as its own text", () => {
    render(
      <InspectorPreview
        item={link({ inputType: "text", originalInput: "my note" })}
      />,
    );
    expect(screen.getByLabelText("Note text").textContent).toBe("my note");
  });
});
