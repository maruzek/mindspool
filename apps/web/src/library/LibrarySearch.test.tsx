import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppRouter } from "../router";
import type { LibrarySearch } from "../search/searchParams";
import { backend, resetBackend } from "../test-utils/mocks";

vi.mock(
  "@clerk/react",
  async () => (await import("../test-utils/mocks")).clerkMock,
);
vi.mock(
  "convex/react",
  async () => (await import("../test-utils/mocks")).convexMock,
);

beforeEach(resetBackend);
afterEach(cleanup);

function item(id: string, title = id) {
  return {
    _id: id,
    _creationTime: Date.now(),
    inputType: "text",
    originalInput: title,
    sourceMetadata: { title },
    enrichmentStatus: "succeeded",
    captureSource: "web",
    labels: [],
    labelCount: 0,
  };
}
async function renderAt(path: string) {
  const router = createAppRouter(
    { authConfigured: true, backendConfigured: true },
    createMemoryHistory({ initialEntries: [path] }),
  );
  await router.load();
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { level: 1 });
  return router;
}
const main = () => within(document.getElementById("main")!);
const search = (router: Awaited<ReturnType<typeof renderAt>>) =>
  router.state.matches.at(-1)!.search as LibrarySearch;
const args = (name: string) => backend.paginatedArgs[name];

describe("which query each view runs", () => {
  it("lists the library unfiltered, and skips the other three", async () => {
    await renderAt("/library");
    expect(args("items:list")).toEqual({});
    expect(args("items:search")).toBe("skip");
    expect(args("itemLabels:listItemsForLabel")).toBe("skip");
    expect(args("itemLabels:searchItemsForLabel")).toBe("skip");
  });
  it("passes source and needs review to the library list", async () => {
    await renderAt("/library?source=x&review=1");
    expect(args("items:list")).toEqual({ source: "x", needsReview: true });
  });
  it("lists the inbox with the inbox filter", async () => {
    await renderAt("/inbox?source=reddit");
    expect(args("items:list")).toEqual({ inbox: true, source: "reddit" });
  });
  it("searches the library, keeping filters", async () => {
    backend.searchItems = [item("a", "ramen night")];
    await renderAt("/library?q=ramen&source=x&review=1");
    expect(args("items:search")).toEqual({
      query: "ramen",
      source: "x",
      needsReview: true,
    });
    expect(args("items:list")).toBe("skip");
    expect(main().getByText("ramen night")).toBeTruthy();
  });
  it("searches the inbox", async () => {
    await renderAt("/inbox?q=ramen");
    expect(args("items:search")).toEqual({ query: "ramen", inbox: true });
  });
  it("lists and searches within a label, with its filters", async () => {
    backend.label = { _id: "l1", name: "Recipes" };
    await renderAt("/labels/l1?source=note&review=1");
    expect(args("itemLabels:listItemsForLabel")).toEqual({
      labelId: "l1",
      source: "note",
      needsReview: true,
    });
    cleanup();
    backend.labelSearchItems = [item("b", "ramen in label")];
    await renderAt("/labels/l1?q=ramen");
    expect(args("itemLabels:searchItemsForLabel")).toEqual({
      labelId: "l1",
      query: "ramen",
    });
    expect(args("itemLabels:listItemsForLabel")).toBe("skip");
    expect(main().getByText("ramen in label")).toBeTruthy();
  });
});

describe("results heading", () => {
  it("names the query and the view, and clears only the query", async () => {
    backend.searchItems = [item("a")];
    const router = await renderAt("/library?q=ramen&source=x&layout=grid");
    expect(
      screen.getByRole("heading", { level: 1, name: "Results for “ramen”" }),
    ).toBeTruthy();
    expect(main().getByText("in Library")).toBeTruthy();
    fireEvent.click(main().getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(search(router).q).toBeUndefined());
    expect(search(router)).toMatchObject({ source: "x", layout: "grid" });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Library" }),
    ).toBeTruthy();
  });
  it("shows the label name as the scope inside a label", async () => {
    backend.label = { _id: "l1", name: "Recipes" };
    backend.labelSearchItems = [item("a")];
    await renderAt("/labels/l1?q=ramen");
    expect(main().getByText("in Recipes")).toBeTruthy();
  });
  it("offers Search all only inside a label, and widens to the library", async () => {
    backend.label = { _id: "l1", name: "Recipes" };
    backend.labelSearchItems = [item("a")];
    const router = await renderAt("/labels/l1?q=ramen&layout=grid&source=x");
    fireEvent.click(main().getByRole("button", { name: "Search all" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/library"),
    );
    expect(search(router)).toMatchObject({
      q: "ramen",
      layout: "grid",
      source: "x",
    });
    cleanup();
    await renderAt("/library?q=ramen");
    expect(main().queryByRole("button", { name: "Search all" })).toBeNull();
  });
});

describe("empty and loading states", () => {
  it("says nothing matches, naming the query and each filter, with clears", async () => {
    const router = await renderAt("/library?q=ramen&source=x&review=1");
    expect(main().getByText("Nothing matches “ramen”.")).toBeTruthy();
    const empty = within(
      document.querySelector("[data-slot='item-empty']") as HTMLElement,
    );
    expect(empty.getByText(/X/)).toBeTruthy();
    expect(empty.getByText(/Needs review/)).toBeTruthy();
    fireEvent.click(empty.getByRole("button", { name: "Clear source filter" }));
    await waitFor(() => expect(search(router).source).toBeUndefined());
    fireEvent.click(empty.getByRole("button", { name: "Clear needs review" }));
    await waitFor(() => expect(search(router).review).toBeUndefined());
    fireEvent.click(empty.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(search(router).q).toBeUndefined());
  });
  it("explains filters that match nothing without a query", async () => {
    await renderAt("/library?source=reddit");
    expect(main().getByText("No items match these filters.")).toBeTruthy();
  });
  it("celebrates an empty inbox and links back to the library", async () => {
    await renderAt("/inbox");
    expect(main().getByText("Inbox zero. Everything is labeled.")).toBeTruthy();
    expect(
      main().getByRole("link", { name: "Go to Library" }).getAttribute("href"),
    ).toBe("/library");
  });
  it("keeps the first-save welcome for a truly empty library", async () => {
    await renderAt("/library");
    expect(main().getByText("Your library starts here.")).toBeTruthy();
  });
  it("announces searching, then the result", async () => {
    backend.itemsStatus = "LoadingFirstPage";
    await renderAt("/library?q=ramen");
    expect(
      screen.getByRole("status", { name: "Search status" }).textContent,
    ).toBe("Searching…");
    cleanup();
    backend.itemsStatus = "Exhausted";
    backend.searchItems = [item("a")];
    await renderAt("/library?q=ramen");
    expect(
      screen.getByRole("status", { name: "Search status" }).textContent,
    ).toBe("Showing results");
    cleanup();
    backend.searchItems = [];
    await renderAt("/library?q=ramen");
    expect(
      screen.getByRole("status", { name: "Search status" }).textContent,
    ).toBe("No results");
  });
  it("loads more search results", async () => {
    backend.searchItems = [item("a")];
    backend.itemsStatus = "CanLoadMore";
    await renderAt("/library?q=ramen");
    fireEvent.click(main().getByRole("button", { name: "Load more" }));
    expect(backend.loadMoreItems).toHaveBeenCalledWith(10);
  });
});

describe("heading summary", () => {
  const summary = () =>
    [...document.querySelectorAll("header p")]
      .map((p) => p.textContent)
      .find((text) => /\d+ items?/.test(text ?? ""));
  it("shows the total and awaiting review on the unfiltered library", async () => {
    backend.stats = { total: 42, inbox: 12, needsReview: 6 };
    backend.items = [item("a")];
    await renderAt("/library");
    expect(summary()).toBe("42 items · 6 awaiting review");
  });
  it("omits awaiting review at zero and uses singular for one", async () => {
    backend.items = [item("a")];
    backend.stats = { total: 42, inbox: 0, needsReview: 0 };
    await renderAt("/library");
    expect(summary()).toBe("42 items");
    cleanup();
    backend.stats = { total: 1, inbox: 0, needsReview: 0 };
    await renderAt("/library");
    expect(summary()).toBe("1 item");
  });
  it("falls back to the loaded count with a filter, a search, or no stats", async () => {
    backend.stats = { total: 42, inbox: 12, needsReview: 6 };
    backend.items = [item("a"), item("b")];
    backend.searchItems = [item("a"), item("b")];
    await renderAt("/library?source=x");
    expect(summary()).toBe("2 items");
    cleanup();
    await renderAt("/library?q=ramen");
    expect(summary()).toBe("2 items");
    cleanup();
    backend.stats = undefined;
    await renderAt("/library");
    expect(summary()).toBe("2 items");
  });
  it("is not shown on the inbox or a label", async () => {
    backend.stats = { total: 42, inbox: 12, needsReview: 6 };
    backend.items = [item("a")];
    await renderAt("/inbox");
    expect(summary()).toBe("1 item");
    cleanup();
    backend.label = { _id: "l1", name: "Recipes" };
    backend.labelItems = [item("a")];
    await renderAt("/labels/l1");
    expect(summary()).toBe("1 item");
  });
});
