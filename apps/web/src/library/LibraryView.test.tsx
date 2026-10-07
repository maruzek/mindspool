import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppRouter } from "../router";
import { backend, resetBackend } from "../test-utils/mocks";

vi.mock(
  "@clerk/react",
  async () => (await import("../test-utils/mocks")).clerkMock,
);
vi.mock(
  "convex/react",
  async () => (await import("../test-utils/mocks")).convexMock,
);

const NOW = new Date(2026, 9, 7, 12, 0, 0).getTime();
beforeEach(() => {
  resetBackend();
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function item(id: string, overrides: Record<string, unknown> = {}) {
  return {
    _id: id,
    _creationTime: NOW - 4 * 60_000,
    inputType: "url",
    originalInput: `https://example.com/${id}`,
    originalUrl: `https://example.com/${id}`,
    enrichmentStatus: "succeeded",
    captureSource: "web",
    labels: [],
    labelCount: 0,
    ...overrides,
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
const rows = () =>
  main()
    .getAllByRole("listitem")
    .map((li) => li.textContent!);

describe("library list", () => {
  it("renders newest-first rows with source, tags, status and date", async () => {
    backend.items = [
      item("b", {
        sourceMetadata: { title: "Soup recipe" },
        captureSource: "extension",
        labels: [
          { _id: "l1", name: "Food" },
          { _id: "l2", name: "Dinner" },
          { _id: "l3", name: "Quick" },
        ],
        labelCount: 4,
        enrichmentStatus: "pending",
      }),
      item("a", {
        inputType: "text",
        originalInput: "\n First thought\nmore",
        originalUrl: undefined,
        enrichmentStatus: "not_started",
        _creationTime: NOW - 3 * 86_400_000,
      }),
      item("c", { enrichmentStatus: "failed" }),
    ];
    await renderAt("/library");
    const [first, second, third] = rows();
    expect(first).toContain("Soup recipe");
    expect(first).toContain("example.com");
    expect(first).toContain("via browser extension");
    for (const tag of ["Food", "Dinner", "Quick", "+1"])
      expect(first).toContain(tag);
    expect(first).toContain("Processing…");
    expect(first).toContain("4m");
    expect(second).toContain("First thought");
    expect(second).toContain("note");
    expect(second).toContain("Saved — original stored");
    expect(second).toContain("3d");
    expect(third).toContain("Extraction failed — link kept");
    expect(screen.getByRole("textbox", { name: /capture/i })).toBeTruthy();
  });

  it("shows no count when empty and the count once items load", async () => {
    await renderAt("/library");
    expect(screen.queryByText(/^\d+ items?/)).toBeNull();
    cleanup();
    backend.items = [item("a"), item("b")];
    await renderAt("/library");
    expect(screen.getByText("2 items")).toBeTruthy();
  });

  it("asks for 10 items at a time and loads more on demand", async () => {
    backend.items = [item("a")];
    backend.itemsStatus = "CanLoadMore";
    await renderAt("/library");
    expect(screen.getByText("1 item loaded")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(backend.loadMoreItems).toHaveBeenCalledWith(10);
  });

  it("announces and disables while loading more", async () => {
    backend.items = [item("a")];
    backend.itemsStatus = "LoadingMore";
    await renderAt("/library");
    expect(
      (screen.getByRole("button", { name: "Load more" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("hides Load more once everything is loaded", async () => {
    backend.items = [item("a")];
    await renderAt("/library");
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("shows skeletons while the first page loads", async () => {
    backend.itemsStatus = "LoadingFirstPage";
    await renderAt("/library");
    expect(screen.getByRole("status", { name: "Loading items" })).toBeTruthy();
    expect(main().queryAllByRole("listitem")).toHaveLength(0);
  });

  it("links each row to its item and marks the selected one", async () => {
    backend.items = [item("a"), item("b")];
    await renderAt("/library?layout=grid&item=b");
    const links = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("href")?.includes("item="));
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/library?layout=grid&item=a",
      "/library?layout=grid&item=b",
    ]);
    expect(links[0]!.getAttribute("aria-current")).toBeNull();
    expect(links[1]!.getAttribute("aria-current")).toBe("true");
  });
});

describe("label view", () => {
  it("lists only the label's items under the label's name", async () => {
    backend.label = { _id: "l1", name: "Recipes" };
    backend.items = [item("not-shown")];
    backend.labelItems = [
      item("x", { sourceMetadata: { title: "Only in label" } }),
    ];
    await renderAt("/labels/l1");
    expect(
      screen.getByRole("heading", { level: 1, name: "Recipes" }),
    ).toBeTruthy();
    const list = main().getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(list.textContent).toContain("Only in label");
    expect(backend.paginatedArgs["itemLabels:listItemsForLabel"]).toEqual({
      labelId: "l1",
    });
  });

  it("keeps the shell's Not found for an unknown label", async () => {
    backend.label = null;
    await renderAt("/labels/nope");
    expect(screen.getByRole("heading", { name: "Not found" })).toBeTruthy();
  });
});

describe("layout toggle", () => {
  const toggle = (name: string) =>
    screen.getByRole("button", { name }) as HTMLButtonElement;

  it("defaults to the list and switches to the grid through the URL", async () => {
    backend.items = [item("a"), item("b")];
    const router = await renderAt("/library?item=a");
    expect(toggle("List").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle("Grid"));
    await vi.waitFor(() =>
      expect(router.state.location.search).toEqual({
        layout: "grid",
        item: "a",
      }),
    );
    await vi.waitFor(() =>
      expect(toggle("Grid").getAttribute("aria-pressed")).toBe("true"),
    );
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toContain("example.com");
  });

  it("restores the grid from the URL and back/forward", async () => {
    backend.items = [item("a")];
    const router = await renderAt("/library?layout=grid");
    expect(toggle("Grid").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle("List"));
    await vi.waitFor(() =>
      expect(toggle("List").getAttribute("aria-pressed")).toBe("true"),
    );
    router.history.back();
    await vi.waitFor(() =>
      expect(toggle("Grid").getAttribute("aria-pressed")).toBe("true"),
    );
  });

  it("falls back to the list for an invalid layout", async () => {
    backend.items = [item("a")];
    await renderAt("/library?layout=tiles");
    expect(toggle("List").getAttribute("aria-pressed")).toBe("true");
  });

  it("renders cards with the same data, tags and pagination in the grid", async () => {
    backend.items = [
      item("a", {
        sourceMetadata: { title: "Card title" },
        labels: [{ _id: "l1", name: "Food" }],
        labelCount: 1,
      }),
    ];
    backend.itemsStatus = "CanLoadMore";
    await renderAt("/library?layout=grid&item=a");
    const [card] = rows();
    expect(card).toContain("Card title");
    expect(card).toContain("Food");
    const link = main()
      .getAllByRole("link")
      .find((l) => l.getAttribute("href")?.includes("item=a"))!;
    expect(link.getAttribute("aria-current")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(backend.loadMoreItems).toHaveBeenCalledWith(10);
  });
});

describe("states", () => {
  it("explains an empty library", async () => {
    await renderAt("/library");
    expect(screen.getByText("Your library starts here.")).toBeTruthy();
    expect(screen.getByText(/Paste a link or write a note/)).toBeTruthy();
    expect(main().queryAllByRole("listitem")).toHaveLength(0);
  });

  it("explains an empty label", async () => {
    backend.label = { _id: "l1", name: "Recipes" };
    await renderAt("/labels/l1");
    expect(screen.getByText("No items in this label yet.")).toBeTruthy();
    expect(screen.getByText(/added to a label from the item/)).toBeTruthy();
    expect(screen.queryByText("Your library starts here.")).toBeNull();
  });

  it("does not show the empty state while loading or when items exist", async () => {
    backend.itemsStatus = "LoadingFirstPage";
    await renderAt("/library");
    expect(screen.queryByText("Your library starts here.")).toBeNull();
    cleanup();
    backend.itemsStatus = "Exhausted";
    backend.items = [item("a")];
    await renderAt("/library");
    expect(screen.queryByText("Your library starts here.")).toBeNull();
  });

  it("surfaces a query failure through the shell's boundary", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    backend.itemsError = new Error("subscription failed");
    const router = createAppRouter(
      { authConfigured: true, backendConfigured: true },
      createMemoryHistory({ initialEntries: ["/library"] }),
    );
    await router.load();
    render(<RouterProvider router={router} />);
    expect(
      await screen.findByRole("heading", {
        name: "Your library could not load",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    quiet.mockRestore();
  });
});

describe("selection", () => {
  const rowLink = (id: string) =>
    main()
      .getAllByRole("link")
      .find((l) => l.getAttribute("href")?.includes(`item=${id}`))!;

  it("sets ?item on click and keeps the layout", async () => {
    backend.items = [item("a"), item("b")];
    const router = await renderAt("/library?layout=grid");
    fireEvent.click(rowLink("b"));
    await vi.waitFor(() =>
      expect(router.state.location.search).toEqual({
        layout: "grid",
        item: "b",
      }),
    );
    await vi.waitFor(() =>
      expect(rowLink("b").getAttribute("aria-current")).toBe("true"),
    );
    expect(rowLink("a").getAttribute("aria-current")).toBeNull();
  });

  it("makes rows natively focusable links in tab order", async () => {
    backend.items = [item("a")];
    await renderAt("/library");
    const link = rowLink("a");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("tabindex")).toBeNull();
    link.focus();
    expect(document.activeElement).toBe(link);
  });

  it("restores the selection after back and survives an unknown id", async () => {
    backend.items = [item("a")];
    const router = await renderAt("/library?item=a");
    expect(rowLink("a").getAttribute("aria-current")).toBe("true");
    router.history.push("/library?item=missing");
    await vi.waitFor(() =>
      expect(router.state.location.search).toEqual({ item: "missing" }),
    );
    await vi.waitFor(() =>
      expect(rowLink("a").getAttribute("aria-current")).toBeNull(),
    );
    expect(rows()).toHaveLength(1);
    router.history.back();
    await vi.waitFor(() =>
      expect(rowLink("a").getAttribute("aria-current")).toBe("true"),
    );
  });

  it("highlights a newly saved item without opening it", async () => {
    backend.items = [item("new"), item("old")];
    backend.createItem.mockResolvedValue("new");
    const router = await renderAt("/library");
    fireEvent.change(screen.getByRole("textbox", { name: /capture/i }), {
      target: { value: "a fresh note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(rowLink("new")).toBeTruthy());
    await vi.waitFor(() =>
      expect(rowLink("new").hasAttribute("data-new")).toBe(true),
    );
    expect(rowLink("old").hasAttribute("data-new")).toBe(false);
    expect(router.state.location.search).toEqual({});
    expect(rowLink("new").getAttribute("aria-current")).toBeNull();
  });

  it("sizes grid columns from the container, not the viewport", async () => {
    backend.items = [item("a")];
    await renderAt("/library?layout=grid");
    const grid = main().getAllByRole("list")[0]!;
    expect(grid.parentElement!.className).toContain("@container");
    expect(grid.className).toContain("@min-[560px]:grid-cols-2");
    expect(grid.className).toContain("@min-[960px]:grid-cols-3");
    expect(grid.className).not.toMatch(/(^| )(md|xl):grid-cols/);
  });
});

describe("labeling state", () => {
  it("shows Labeling… in the row and an unsure marker on the label", async () => {
    backend.items = [
      item("a", {
        labeling: true,
        labels: [
          { _id: "l1", name: "Food", unsure: true },
          { _id: "l2", name: "Dinner" },
        ],
        labelCount: 2,
        unsureCount: 1,
      }),
    ];
    await renderAt("/library");
    expect(main().getByText("Labeling…")).toBeTruthy();
    expect(main().getByText("(unsure)")).toBeTruthy();
    expect(
      main()
        .getByText("Food")
        .closest("[data-state]")
        ?.getAttribute("data-state"),
    ).toBe("suggested");
    expect(
      main()
        .getByText("Dinner")
        .closest("[data-state]")
        ?.getAttribute("data-state"),
    ).toBe("confirmed");
  });
  it("shows nothing extra when not labeling", async () => {
    backend.items = [item("a")];
    await renderAt("/library");
    expect(main().queryByText("Labeling…")).toBeNull();
  });
  it("shows Labeling… in grid cards", async () => {
    backend.items = [item("a", { labeling: true })];
    await renderAt("/library?layout=grid");
    expect(main().getByText("Labeling…")).toBeTruthy();
  });
});
