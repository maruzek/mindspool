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
const opt = (id: string, name: string, isAssigned = false) => ({
  _id: id,
  name,
  isAssigned,
});
const open = () =>
  fireEvent.click(screen.getByRole("combobox", { name: "Add label" }));
const option = (name: string) => screen.getByRole("option", { name });
const search = (text: string) =>
  fireEvent.change(screen.getByRole("combobox", { name: "Search labels" }), {
    target: { value: text },
  });

describe("AddLabelPopover", () => {
  it("loads on first open and filters locally without changing the subscription", async () => {
    backend.available = [opt("l1", "Food"), opt("l2", "Travel inspiration")];
    render(<AddLabelPopover itemId={itemId} />);
    expect(backend.paginatedArgs["itemLabels:availableLabels"]).toBe("skip");
    open();
    await screen.findByRole("option", { name: "Food" });
    search("  inspiration  ");
    expect(backend.paginatedArgs["itemLabels:availableLabels"]).toEqual({
      itemId,
    });
    expect(option("Travel inspiration")).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Food" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Search labels" }), {
      key: "Escape",
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("combobox", { name: "Search labels" }),
      ).toBeNull(),
    );
    expect(backend.paginatedArgs["itemLabels:availableLabels"]).toEqual({
      itemId,
    });
    open();
    expect(await screen.findByRole("option", { name: "Food" })).toBeTruthy();
  });

  it("reflects assignment and toggles labels without closing the picker", async () => {
    backend.available = [opt("l1", "Food"), opt("l2", "Dinner", true)];
    backend.attachItemLabel.mockResolvedValue(null);
    backend.removeItemLabel.mockResolvedValue(null);
    render(<AddLabelPopover itemId={itemId} />);
    open();
    await screen.findByRole("option", { name: "Food" });
    expect(option("Food").getAttribute("aria-selected")).toBe("false");
    expect(option("Dinner").getAttribute("aria-selected")).toBe("true");
    search("food");
    expect(screen.queryByRole("option", { name: "Dinner" })).toBeNull();
    fireEvent.click(option("Food"));
    await waitFor(() =>
      expect(backend.attachItemLabel).toHaveBeenCalledWith({
        itemId,
        labelId: "l1",
      }),
    );
    await waitFor(() =>
      expect(option("Food").getAttribute("aria-disabled")).not.toBe("true"),
    );
    search("dinner");
    expect(option("Dinner").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(option("Dinner"));
    await waitFor(() =>
      expect(backend.removeItemLabel).toHaveBeenCalledWith({
        itemId,
        labelId: "l2",
      }),
    );
    expect(
      screen.getByRole("combobox", { name: "Search labels" }),
    ).toBeTruthy();
  });

  it("offers an empty-state hint and creates and attaches the trimmed search term", async () => {
    backend.createLabel.mockResolvedValue("new-label");
    backend.attachItemLabel.mockResolvedValue(null);
    render(<AddLabelPopover itemId={itemId} />);
    open();
    expect(
      await screen.findByText("Search or type a name to create a label."),
    ).toBeTruthy();
    search("  Travel  ");
    fireEvent.click(
      await screen.findByRole("option", { name: "Create “Travel”" }),
    );
    await waitFor(() =>
      expect(backend.createLabel).toHaveBeenCalledWith({ name: "Travel" }),
    );
    await waitFor(() =>
      expect(backend.attachItemLabel).toHaveBeenCalledWith({
        itemId,
        labelId: "new-label",
      }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("combobox", {
            name: "Search labels",
          }) as HTMLInputElement
        ).value,
      ).toBe(""),
    );
  });

  it("does not offer creation for an exact match regardless of case or whitespace", async () => {
    backend.available = [opt("l1", "Food")];
    render(<AddLabelPopover itemId={itemId} />);
    open();
    search("  fOoD  ");
    expect(screen.queryByRole("option", { name: /Create/ })).toBeNull();
  });

  it("allows creating a distinct name alongside partial matches", async () => {
    backend.available = [opt("l1", "Food ideas")];
    render(<AddLabelPopover itemId={itemId} />);
    open();
    search("Food");
    expect(
      await screen.findByRole("option", { name: "Create “Food”" }),
    ).toBeTruthy();
    expect(option("Food ideas")).toBeTruthy();
  });

  it("does not offer creation for whitespace, overlong names, or while loading", async () => {
    const view = render(<AddLabelPopover itemId={itemId} />);
    open();
    search("   ");
    expect(screen.queryByRole("option", { name: /Create/ })).toBeNull();
    search("x".repeat(81));
    expect(screen.queryByRole("option", { name: /Create/ })).toBeNull();
    expect(
      screen.getByText("Label names can have up to 80 characters."),
    ).toBeTruthy();
    backend.availableStatus = "LoadingFirstPage";
    view.rerender(<AddLabelPopover itemId={itemId} />);
    search("Travel");
    expect(screen.queryByRole("option", { name: /Create/ })).toBeNull();
  });

  it("automatically loads remaining pages before offering creation", async () => {
    backend.available = [opt("l1", "Food")];
    backend.availableStatus = "CanLoadMore";
    const view = render(<AddLabelPopover itemId={itemId} />);
    open();
    await waitFor(() =>
      expect(backend.loadMoreAvailable).toHaveBeenCalledWith(10),
    );
    search("Travel");
    expect(screen.queryByRole("option", { name: /Create/ })).toBeNull();
    expect(screen.queryByRole("option", { name: "Food" })).toBeNull();
    backend.available = [opt("l1", "Food"), opt("l2", "Travel", true)];
    backend.availableStatus = "Exhausted";
    view.rerender(<AddLabelPopover itemId={itemId} />);
    expect(await screen.findByRole("option", { name: "Travel" })).toBeTruthy();
    expect(option("Travel").getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("option", { name: /Create/ })).toBeNull();
  });

  it("announces an assignment failure and keeps server selection", async () => {
    backend.available = [opt("l1", "Food")];
    backend.attachItemLabel.mockRejectedValue(
      new ConvexError({ code: "NOT_FOUND", message: "Not found" }),
    );
    render(<AddLabelPopover itemId={itemId} />);
    open();
    fireEvent.click(await screen.findByRole("option", { name: "Food" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Not found");
    expect(option("Food").getAttribute("aria-selected")).toBe("false");
  });

  it("keeps the search available for retry when creation fails", async () => {
    backend.createLabel.mockRejectedValue(new Error("offline"));
    render(<AddLabelPopover itemId={itemId} />);
    open();
    search("Travel");
    fireEvent.click(
      await screen.findByRole("option", { name: "Create “Travel”" }),
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      (
        screen.getByRole("combobox", {
          name: "Search labels",
        }) as HTMLInputElement
      ).value,
    ).toBe("Travel");
    expect(backend.attachItemLabel).not.toHaveBeenCalled();
  });

  it("retains the query and prevents duplicate writes while creating", async () => {
    let finish!: (id: string) => void;
    backend.createLabel.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    backend.attachItemLabel.mockRejectedValue(new Error("offline"));
    render(<AddLabelPopover itemId={itemId} />);
    open();
    search("Travel");
    const create = await screen.findByRole("option", {
      name: "Create “Travel”",
    });
    fireEvent.click(create);
    fireEvent.click(create);
    expect(backend.createLabel).toHaveBeenCalledTimes(1);
    expect(
      (
        screen.getByRole("combobox", {
          name: "Search labels",
        }) as HTMLInputElement
      ).value,
    ).toBe("Travel");
    finish("new-label");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      (
        screen.getByRole("combobox", {
          name: "Search labels",
        }) as HTMLInputElement
      ).value,
    ).toBe("Travel");
  });
});
