import {
  act,
  fireEvent,
  render,
  screen,
  cleanup,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LibraryTray } from "./LibraryTray";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});
it("shows sparse continuation, placed Locate and changes filters without changing cards", () => {
  const onFilters = vi.fn();
  const onLocate = vi.fn();
  const { rerender } = render(
    <LibraryTray
      items={[]}
      status="CanLoadMore"
      filters={{}}
      onFilters={onFilters}
      placed={new Set()}
      onAdd={vi.fn()}
      onLocate={onLocate}
      loadMore={vi.fn()}
      boardKey="test"
      labels={[]}
      disabled={false}
    />,
  );
  expect(screen.queryByText("No results")).toBeNull();
  expect(screen.getByText("Load more")).toBeTruthy();
  rerender(
    <LibraryTray
      items={[
        {
          itemId: "item" as never,
          title: "Hello",
          body: "Text",
          source: "note",
          originalUrl: null,
          hasText: true,
          imageUrl: null,
          labels: [],
        },
      ]}
      status="Exhausted"
      filters={{}}
      onFilters={onFilters}
      placed={new Set(["item"])}
      onAdd={vi.fn()}
      onLocate={onLocate}
      loadMore={vi.fn()}
      boardKey="test"
      labels={[]}
      disabled={false}
    />,
  );
  fireEvent.click(screen.getByText("Locate"));
  expect(onLocate).toHaveBeenCalledWith("item");
  fireEvent.click(screen.getByLabelText("Tray scope"));
  fireEvent.click(screen.getByRole("menuitemradio", { name: "All library" }));
  expect(onFilters).toHaveBeenCalledWith({ trayScope: "all" });
});

const preview = (id: string) => ({
  itemId: id as never,
  title: id,
  body: "Text",
  source: "reddit" as const,
  originalUrl: null,
  hasText: true,
  imageUrl: null,
  labels: [],
});
function tray(
  overrides: Partial<React.ComponentProps<typeof LibraryTray>> = {},
) {
  return (
    <LibraryTray
      items={[preview("placed"), preview("available")]}
      status="Exhausted"
      filters={{}}
      onFilters={vi.fn()}
      placed={new Set(["placed"])}
      onAdd={vi.fn()}
      onLocate={vi.fn()}
      loadMore={vi.fn()}
      boardKey="test"
      labels={[]}
      disabled={false}
      {...overrides}
    />
  );
}
it("moves placed cards after available cards and offers a keyboard resize handle", () => {
  render(tray());
  const cards = screen.getAllByRole("listitem");
  expect(within(cards[0]!).getByText("available")).toBeTruthy();
  expect(within(cards[1]!).getByText("placed")).toBeTruthy();
  expect(screen.queryByRole("slider")).toBeNull();
  const handle = screen.getByRole("separator", { name: "Resize library tray" });
  const initial = Number(handle.getAttribute("aria-valuenow"));
  fireEvent.keyDown(handle, { key: "ArrowUp" });
  expect(Number(handle.getAttribute("aria-valuenow"))).toBe(initial + 20);
});
it("debounces search, cancels pending searches on reset, and follows external filters", () => {
  vi.useFakeTimers();
  const onFilters = vi.fn();
  const { rerender, unmount } = render(tray({ onFilters }));
  fireEvent.change(screen.getByLabelText("Search tray"), {
    target: { value: "r" },
  });
  act(() => vi.advanceTimersByTime(200));
  fireEvent.change(screen.getByLabelText("Search tray"), {
    target: { value: "reddit" },
  });
  act(() => vi.advanceTimersByTime(299));
  expect(onFilters).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(onFilters).toHaveBeenCalledWith({ q: "reddit" });
  rerender(tray({ onFilters, filters: { q: "reddit" } }));
  fireEvent.change(screen.getByLabelText("Search tray"), {
    target: { value: "pending" },
  });
  fireEvent.click(screen.getByText("Reset filters"));
  act(() => vi.advanceTimersByTime(400));
  expect(onFilters).not.toHaveBeenCalledWith({ q: "pending" });
  rerender(tray({ onFilters, filters: { q: "external" } }));
  expect((screen.getByLabelText("Search tray") as HTMLInputElement).value).toBe(
    "external",
  );
  unmount();
  vi.useRealTimers();
});
