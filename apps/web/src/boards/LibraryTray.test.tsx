import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LibraryTray } from "./LibraryTray";
afterEach(cleanup);
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
  fireEvent.change(screen.getByLabelText("Tray scope"), {
    target: { value: "all" },
  });
  expect(onFilters).toHaveBeenCalledWith({ trayScope: "all" });
});
