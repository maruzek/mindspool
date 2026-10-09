import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ItemCardContent } from "./ItemCardNode";
afterEach(cleanup);
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
        labels: [],
      }}
      open={vi.fn()}
    />,
  );
  expect(screen.getByText("Hello")).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByLabelText("Open details")).toBeTruthy();
  expect(screen.getByTestId("card-text").style.height).toBe("120px");
});
