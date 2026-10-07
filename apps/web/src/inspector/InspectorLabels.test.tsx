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
import { InspectorLabels } from "./InspectorLabels";

vi.mock(
  "convex/react",
  async () => (await import("../test-utils/mocks")).convexMock,
);

beforeEach(resetBackend);
afterEach(cleanup);
const itemId = "item1" as never;
const label = (id: string, name: string) => ({ _id: id, name });

describe("InspectorLabels", () => {
  it("lists confirmed labels and passes the page size", () => {
    backend.itemLabels = [label("l1", "Food"), label("l2", "Dinner")];
    render(<InspectorLabels itemId={itemId} />);
    expect(screen.getByText("Food")).toBeTruthy();
    expect(screen.getByText("Dinner")).toBeTruthy();
    expect(backend.paginatedArgs["itemLabels:listForItem"]).toEqual({ itemId });
  });
  it("says so when there are none", () => {
    render(<InspectorLabels itemId={itemId} />);
    expect(screen.getByText("No labels yet.")).toBeTruthy();
  });
  it("removes a label with the right ids", async () => {
    backend.itemLabels = [label("l1", "Food")];
    backend.removeItemLabel.mockResolvedValue(null);
    render(<InspectorLabels itemId={itemId} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Food" }));
    await waitFor(() =>
      expect(backend.removeItemLabel).toHaveBeenCalledWith({
        itemId,
        labelId: "l1",
      }),
    );
  });
  it("disables only the button of the label being removed", async () => {
    backend.itemLabels = [label("l1", "Food"), label("l2", "Dinner")];
    backend.removeItemLabel.mockReturnValue(new Promise(() => {}));
    render(<InspectorLabels itemId={itemId} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Food" }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Remove Food",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Remove Dinner",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  it("announces a failure and keeps the list", async () => {
    backend.itemLabels = [label("l1", "Food")];
    backend.removeItemLabel.mockRejectedValue(
      new ConvexError({ code: "NOT_FOUND", message: "Not found" }),
    );
    render(<InspectorLabels itemId={itemId} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Food" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Not found");
    expect(screen.getByText("Food")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Remove Food" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
  it("requests the next page with Show more", () => {
    backend.itemLabels = [label("l1", "Food")];
    backend.itemLabelsStatus = "CanLoadMore";
    render(<InspectorLabels itemId={itemId} />);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(backend.loadMoreItemLabels).toHaveBeenCalledWith(10);
  });

  describe("model labels", () => {
    const model = (extra: Record<string, unknown> = {}) => ({
      ...label("l1", "Food"),
      origin: "model",
      provider: "clef-flash",
      model: "clef-flash",
      confidence: 0.87,
      ...extra,
    });
    it("marks a confident model label as AI with provider and percentage", () => {
      backend.itemLabels = [model()];
      render(<InspectorLabels itemId={itemId} />);
      expect(screen.getByTitle("Added by Clef-flash · 87%")).toBeTruthy();
      expect(screen.queryByText(/Unsure/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Keep Food" })).toBeNull();
    });
    it("leaves manual labels unmarked", () => {
      backend.itemLabels = [
        label("l1", "Food"),
        { ...label("l2", "Dev"), origin: "manual" },
      ];
      render(<InspectorLabels itemId={itemId} />);
      expect(screen.queryByTitle(/Added by/)).toBeNull();
      expect(screen.queryByText(/Unsure/)).toBeNull();
    });
    it("flags an unsure label in text with Keep and Remove", () => {
      backend.itemLabels = [model({ confidence: 0.55 })];
      render(<InspectorLabels itemId={itemId} />);
      expect(screen.getByText("Unsure 55%")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Keep Food" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Remove Food" })).toBeTruthy();
    });
    it("treats 65% as confident", () => {
      backend.itemLabels = [model({ confidence: 0.65 })];
      render(<InspectorLabels itemId={itemId} />);
      expect(screen.queryByText(/Unsure/)).toBeNull();
    });
    it("Keep confirms with the right ids; a kept label has no unsure marker but keeps AI", () => {
      backend.confirmItemLabel.mockResolvedValue(null);
      backend.itemLabels = [model({ confidence: 0.55 })];
      const { rerender } = render(<InspectorLabels itemId={itemId} />);
      fireEvent.click(screen.getByRole("button", { name: "Keep Food" }));
      expect(backend.confirmItemLabel).toHaveBeenCalledWith({
        itemId,
        labelId: "l1",
      });
      backend.itemLabels = [model({ confidence: 0.55, confirmedAt: 1 })];
      rerender(<InspectorLabels itemId={itemId} />);
      expect(screen.queryByText(/Unsure/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Keep Food" })).toBeNull();
      expect(screen.getByTitle("Added by Clef-flash · 55%")).toBeTruthy();
    });
    it("Remove on an unsure label uses itemLabels.remove", async () => {
      backend.removeItemLabel.mockResolvedValue(null);
      backend.itemLabels = [model({ confidence: 0.55 })];
      render(<InspectorLabels itemId={itemId} />);
      fireEvent.click(screen.getByRole("button", { name: "Remove Food" }));
      await waitFor(() =>
        expect(backend.removeItemLabel).toHaveBeenCalledWith({
          itemId,
          labelId: "l1",
        }),
      );
    });
    it("shows an error when Keep fails", async () => {
      backend.confirmItemLabel.mockRejectedValue(new Error("offline"));
      backend.itemLabels = [model({ confidence: 0.55 })];
      render(<InspectorLabels itemId={itemId} />);
      fireEvent.click(screen.getByRole("button", { name: "Keep Food" }));
      expect((await screen.findByRole("alert")).textContent).toContain(
        "Could not keep",
      );
    });
  });
});
