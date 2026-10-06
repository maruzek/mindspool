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
import { resetBackend } from "../test-utils/mocks";

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
  return router;
}
const primary = () => screen.getByRole("navigation", { name: "Primary" });
const current = () =>
  within(primary())
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);

describe("icon rail", () => {
  it.each([
    ["/boards", "Boards", "Boards"],
    ["/boards/board-1", "Boards", "Board"],
    ["/graph", "Graph", "Graph"],
  ])("frames %s with the rail and highlights %s", async (path, nav, title) => {
    await renderAt(path);
    expect(current()).toEqual([nav]);
    expect(screen.getByRole("heading", { name: title, level: 1 })).toBeTruthy();
    // Rail frame, not the sidebar frame: no labels list, no search box.
    expect(screen.queryByLabelText("Search everything")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Labels" })).toBeNull();
  });

  it("links all four destinations", async () => {
    await renderAt("/graph");
    expect(
      within(primary())
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/inbox", "/library", "/boards", "/graph"]);
  });

  it("moves between the rail and the sidebar frames", async () => {
    const router = await renderAt("/graph");
    fireEvent.click(within(primary()).getByRole("link", { name: "Library" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Search everything")).toBeTruthy(),
    );
    expect(router.state.location.pathname).toBe("/library");
    fireEvent.click(within(primary()).getByRole("link", { name: "Boards" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("Search everything")).toBeNull(),
    );
    expect(current()).toEqual(["Boards"]);
  });
});
