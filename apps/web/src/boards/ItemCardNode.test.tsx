import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ItemCardContent } from "./ItemCardNode";
afterEach(cleanup);
it.each(["free", "column", "resized"])(
  "contains the complete visual reference in a %s card",
  (placement) => {
    render(
      <ItemCardContent
        card={{
          type: "item",
          itemId: "visual" as never,
          membership: "one",
          x: 0,
          y: 0,
          width: placement === "resized" ? 500 : 300,
          imageHeight: placement === "resized" ? 100 : 630,
          textHeight: 120,
          mode: "image",
          ...(placement === "column" ? { columnKey: "column", order: 0 } : {}),
        }}
        preview={{
          itemId: "visual" as never,
          title: "Long design",
          body: "",
          imageUrl: "https://stored.example/visual",
          source: "web",
          originalUrl: "https://source.example",
          hasText: false,
          labels: [],
          visualCapture: { kind: "full-page", width: 1000, height: 2100 },
        }}
        open={vi.fn()}
      />,
    );
    expect(
      document.querySelector("img")?.classList.contains("object-contain"),
    ).toBe(true);
    expect(
      document.querySelector("img")?.classList.contains("object-cover"),
    ).toBe(false);
  },
);
it("renders bounded text at saved height without a blank image and exposes details", () => {
  render(
    <ItemCardContent
      card={{
        type: "item",
        itemId: "item" as never,
        membership: "one",
        x: 0,
        y: 0,
        width: 300,
        imageHeight: 200,
        textHeight: 120,
        mode: "combined",
      }}
      preview={{
        itemId: "item" as never,
        title: "Hello",
        body: "Full saved text excerpt",
        imageUrl: null,
        source: "note",
        originalUrl: null,
        hasText: true,
        labels: [],
      }}
      open={vi.fn()}
    />,
  );
  expect(screen.getByText("Hello")).toBeTruthy();
  expect(document.querySelector("img")).toBeNull();
  expect(screen.getByLabelText("Open details")).toBeTruthy();
  expect(screen.getByTestId("card-text").style.height).toBe("120px");
});

it("offers a separate original-link action without opening the inspector", () => {
  const open = vi.fn();
  render(
    <ItemCardContent
      card={{
        type: "item",
        itemId: "link" as never,
        membership: "one",
        x: 0,
        y: 0,
        width: 300,
        imageHeight: 200,
        textHeight: 120,
        mode: "combined",
      }}
      preview={
        {
          itemId: "link" as never,
          title: "Post",
          body: "Text",
          imageUrl: null,
          source: "reddit",
          labels: [],
          originalUrl: "https://reddit.com/r/test",
          hasText: true,
        } as never
      }
      open={open}
    />,
  );
  const link = screen.getByRole("link", {
    name: "Open original link in new tab",
  });
  expect(link.getAttribute("href")).toBe("https://reddit.com/r/test");
  expect(link.getAttribute("target")).toBe("_blank");
  link.click();
  expect(open).not.toHaveBeenCalled();
});
