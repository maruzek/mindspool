import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InspectorPreview } from "./InspectorPreview";
import type { ItemDetail } from "./types";

afterEach(cleanup);

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
const external = (url: string) => ({
  kind: "external" as const,
  url,
  purpose: "image" as const,
});

describe("InspectorPreview for a clipped tweet", () => {
  const tweet = link({
    sourceMetadata: { title: "Jane (@jane)", author: "jane", siteName: "X" },
    extractedText: "Line one\nLine two <b>not html</b>",
    imageAssets: [
      external("https://pbs.twimg.com/media/A.jpg"),
      external("https://pbs.twimg.com/media/B.jpg"),
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
  it("shows each image lazily, decorative, without a referrer", () => {
    const { container } = render(<InspectorPreview item={tweet} />);
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual([
      "https://pbs.twimg.com/media/A.jpg",
      "https://pbs.twimg.com/media/B.jpg",
    ]);
    for (const img of imgs) {
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("loading")).toBe("lazy");
      expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    }
  });
  it("shows images for a tweet without text", () => {
    const { container } = render(
      <InspectorPreview
        item={link({
          imageAssets: [external("https://pbs.twimg.com/media/A.jpg")],
        })}
      />,
    );
    expect(screen.queryByLabelText("Text")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });
  it("skips stored assets, which have no URL here", () => {
    const { container } = render(
      <InspectorPreview
        item={link({
          imageAssets: [
            {
              kind: "stored",
              storageId: "s" as never,
              purpose: "image",
            },
          ],
        })}
      />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
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
