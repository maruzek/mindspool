import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { backend, resetBackend } from "../test-utils/mocks";
import { AddLabelPopover } from "./AddLabelPopover";

vi.mock(
  "convex/react",
  async () => (await import("../test-utils/mocks")).convexMock,
);

beforeEach(resetBackend);
afterEach(cleanup);
const itemId = "item1" as never;
const opt = (id: string, name: string, isAssigned: boolean) => ({
  _id: id,
  name,
  isAssigned,
});
const open = () =>
  fireEvent.click(screen.getByRole("button", { name: "Add label" }));
const box = (name: string) => screen.getByRole("checkbox", { name });

describe("AddLabelPopover", () => {
  it("does not subscribe while closed, and does once open", async () => {
    backend.available = [opt("l1", "Food", false)];
    render(<AddLabelPopover itemId={itemId} />);
    expect(backend.paginatedArgs["itemLabels:availableLabels"]).toBeUndefined();
    open();
    await screen.findByText("Food");
    expect(backend.paginatedArgs["itemLabels:availableLabels"]).toEqual({
      itemId,
    });
  });
  it("reflects isAssigned and toggles with attach or remove", async () => {
    backend.available = [opt("l1", "Food", false), opt("l2", "Dinner", true)];
    backend.attachItemLabel.mockResolvedValue(null);
    backend.removeItemLabel.mockResolvedValue(null);
    render(<AddLabelPopover itemId={itemId} />);
    open();
    await screen.findByText("Food");
    expect(box("Food").getAttribute("aria-checked")).toBe("false");
    expect(box("Dinner").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(box("Food"));
    await waitFor(() =>
      expect(backend.attachItemLabel).toHaveBeenCalledWith({
        itemId,
        labelId: "l1",
      }),
    );
    fireEvent.click(box("Dinner"));
    await waitFor(() =>
      expect(backend.removeItemLabel).toHaveBeenCalledWith({
        itemId,
        labelId: "l2",
      }),
    );
  });
  it("shows the no-labels message", async () => {
    render(<AddLabelPopover itemId={itemId} />);
    open();
    expect(
      await screen.findByText(
        "You have no labels yet. Create one from the sidebar.",
      ),
    ).toBeTruthy();
  });
  it("requests the next page with Show more", async () => {
    backend.available = [opt("l1", "Food", false)];
    backend.availableStatus = "CanLoadMore";
    render(<AddLabelPopover itemId={itemId} />);
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Show more" }));
    expect(backend.loadMoreAvailable).toHaveBeenCalledWith(10);
  });
  it("announces a failure and keeps the state", async () => {
    backend.available = [opt("l1", "Food", false)];
    backend.attachItemLabel.mockRejectedValue(
      new ConvexError({ code: "NOT_FOUND", message: "Not found" }),
    );
    render(<AddLabelPopover itemId={itemId} />);
    open();
    await screen.findByText("Food");
    fireEvent.click(box("Food"));
    expect((await screen.findByRole("alert")).textContent).toBe("Not found");
    expect(box("Food").getAttribute("aria-checked")).toBe("false");
  });
});
