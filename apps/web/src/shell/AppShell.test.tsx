import {
  cleanup,
  fireEvent,
  render,
  within,
  screen,
  waitFor,
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

const state = backend;
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
const current = () =>
  within(screen.getByRole("navigation", { name: "Primary" }))
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);
async function openAccountMenu() {
  fireEvent.click(await screen.findByLabelText("Account menu"));
}

describe("sidebar frame", () => {
  it.each([
    ["/inbox", "Inbox"],
    ["/library", "Library"],
    ["/boards", "Boards"],
    ["/graph", "Graph"],
  ])("marks %s as the active destination", async (path, label) => {
    await renderAt(path);
    expect(current()).toEqual([label]);
    expect(screen.getByRole("heading", { name: label, level: 1 })).toBeTruthy();
  });

  it("follows navigation, including back", async () => {
    const router = await renderAt("/library");
    fireEvent.click(screen.getByRole("link", { name: "Graph" }));
    await waitFor(() => expect(current()).toEqual(["Graph"]));
    router.history.back();
    await waitFor(() => expect(current()).toEqual(["Library"]));
  });

  it("shows the brand, an enabled search box, and primary navigation", async () => {
    await renderAt("/library");
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    const search = screen.getByLabelText("Search everything");
    expect((search as HTMLInputElement).disabled).toBe(false);
    expect(
      within(screen.getByRole("complementary", { name: "Sidebar" })).getByText(
        "mindspool",
      ),
    ).toBeTruthy();
  });
});

describe("account menu", () => {
  it("hides Load examples when the backend does not allow them", async () => {
    await renderAt("/library");
    await openAccountMenu();
    expect(await screen.findByText("Sign out")).toBeTruthy();
    expect(screen.queryByText("Load examples")).toBeNull();
  });

  it("loads examples and reports the result", async () => {
    state.seedEnabled = true;
    state.load.mockResolvedValue({ createdItems: 3 });
    await renderAt("/library");
    await openAccountMenu();
    fireEvent.click(await screen.findByText("Load examples"));
    expect(await screen.findByText("Added 3 examples.")).toBeTruthy();
  });

  it("reports a failed examples load", async () => {
    state.seedEnabled = true;
    state.load.mockRejectedValue(new Error("nope"));
    await renderAt("/library");
    await openAccountMenu();
    fireEvent.click(await screen.findByText("Load examples"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not load examples",
    );
  });

  it("signs out", async () => {
    await renderAt("/library");
    await openAccountMenu();
    fireEvent.click(await screen.findByText("Sign out"));
    expect(state.signOut).toHaveBeenCalled();
  });
});
