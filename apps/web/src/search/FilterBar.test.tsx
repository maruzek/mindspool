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
import { backend, resetBackend } from "../test-utils/mocks";
import type { LibrarySearch } from "./searchParams";

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
const search = (router: Awaited<ReturnType<typeof renderAt>>) =>
  router.state.matches.at(-1)!.search as LibrarySearch;
const sources = () => within(screen.getByRole("group", { name: "Source" }));
const chip = (name: string) => sources().getByRole("button", { name });
const review = () => screen.getByRole("button", { name: "Needs review" });

describe("filter bar", () => {
  it("offers every source and the needs review toggle, none active", async () => {
    await renderAt("/library");
    expect(
      sources()
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([
      "All sources",
      "X",
      "Instagram",
      "TikTok",
      "YouTube",
      "Reddit",
      "Web",
      "Notes",
    ]);
    expect(chip("All sources").getAttribute("aria-pressed")).toBe("true");
    expect(chip("X").getAttribute("aria-pressed")).toBe("false");
    expect(review().getAttribute("aria-pressed")).toBe("false");
  });

  it("selects one source at a time, drops the item, keeps the layout", async () => {
    const router = await renderAt("/library?layout=grid&item=abc");
    fireEvent.click(chip("X"));
    await waitFor(() => expect(search(router).source).toBe("x"));
    expect(search(router)).toMatchObject({ layout: "grid" });
    expect(search(router).item).toBeUndefined();
    expect(chip("X").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(chip("Reddit"));
    await waitFor(() => expect(search(router).source).toBe("reddit"));
    expect(chip("X").getAttribute("aria-pressed")).toBe("false");
    expect(chip("All sources").getAttribute("aria-pressed")).toBe("false");
  });

  it("ignores a click on the active source and clears with All sources", async () => {
    const router = await renderAt("/library?source=x");
    fireEvent.click(chip("X"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(search(router).source).toBe("x");
    fireEvent.click(chip("All sources"));
    await waitFor(() => expect(search(router).source).toBeUndefined());
  });

  it("toggles needs review on and off, keeping the source and query", async () => {
    const router = await renderAt("/library?source=x&q=ramen&item=abc");
    fireEvent.click(review());
    await waitFor(() => expect(search(router).review).toBe(1));
    expect(search(router)).toMatchObject({ source: "x", q: "ramen" });
    expect(search(router).item).toBeUndefined();
    expect(review().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(review());
    await waitFor(() => expect(search(router).review).toBeUndefined());
  });

  it("replaces the history entry instead of adding one", async () => {
    const router = await renderAt("/library");
    const entries = router.history.length;
    fireEvent.click(chip("Web"));
    await waitFor(() => expect(search(router).source).toBe("web"));
    expect(router.history.length).toBe(entries);
  });

  it("asks the backend for the new filter, from the first page", async () => {
    await renderAt("/library");
    expect(backend.paginatedArgs["items:list"]).toEqual({});
    fireEvent.click(chip("Notes"));
    await waitFor(() =>
      expect(backend.paginatedArgs["items:list"]).toEqual({ source: "note" }),
    );
  });

  it("is present in the inbox and in a label", async () => {
    await renderAt("/inbox");
    expect(sources().getAllByRole("button")).toHaveLength(8);
    cleanup();
    backend.label = { _id: "l1", name: "Recipes" };
    await renderAt("/labels/l1");
    expect(sources().getAllByRole("button")).toHaveLength(8);
    expect(review()).toBeTruthy();
  });

  it("contains its own horizontal scroll so the page never scrolls sideways", async () => {
    await renderAt("/library");
    const bar = screen.getByRole("group", { name: "Filters" });
    expect(bar.className).toContain("overflow-x-auto");
  });
});
