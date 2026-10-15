import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MediaThumb } from "./MediaThumb";
import type { PreviewItem } from "./types";

afterEach(cleanup);

const item = (over: Partial<PreviewItem> = {}): PreviewItem =>
  ({
    _id: "i1",
    _creationTime: 0,
    inputType: "url",
    originalInput: "https://example.com/a",
    originalUrl: "https://example.com/a",
    enrichmentStatus: "succeeded",
    captureSource: "web",
    labels: [],
    labelCount: 0,
    ...over,
  }) as PreviewItem;

describe("MediaThumb", () => {
  it("renders the image without a referrer and marks extra images", () => {
    const { container } = render(
      <MediaThumb
        item={item({ thumbnailUrl: "https://cdn.test/a.jpg", imageCount: 3 })}
      />,
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://cdn.test/a.jpg");
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(container.textContent).toBe("+2");
  });

  it("shows no badge for a single image", () => {
    const { container } = render(
      <MediaThumb
        item={item({ thumbnailUrl: "https://cdn.test/a.jpg", imageCount: 1 })}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("shows the brand mark for X and a globe for other pages", () => {
    const x = render(
      <MediaThumb item={item({ originalUrl: "https://x.com/a/status/1" })} />,
    );
    expect(x.container.querySelector("svg[data-brand='x']")).not.toBeNull();
    cleanup();
    const web = render(<MediaThumb item={item()} />);
    expect(web.container.querySelector("img")).toBeNull();
    expect(web.container.querySelector("svg[data-brand]")).toBeNull();
    expect(web.container.querySelector("svg.lucide-globe")).not.toBeNull();
  });

  it("shows a note glyph for notes", () => {
    const { container } = render(
      <MediaThumb item={item({ inputType: "text", originalUrl: undefined })} />,
    );
    expect(container.querySelector("svg.lucide-sticky-note")).not.toBeNull();
  });

  it("falls back to the brand tile when the image fails to load", () => {
    const { container } = render(
      <MediaThumb
        item={item({
          originalUrl: "https://x.com/a/status/1",
          thumbnailUrl: "https://cdn.test/gone.jpg",
          imageCount: 2,
        })}
      />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg[data-brand='x']")).not.toBeNull();
    expect(container.textContent).toBe("");
  });
});
