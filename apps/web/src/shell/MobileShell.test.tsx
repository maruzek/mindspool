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

const desktopWidth = window.innerWidth;
beforeEach(resetBackend);
afterEach(() => {
  cleanup();
  window.innerWidth = desktopWidth;
});

async function renderAt(path: string, width: number) {
  window.innerWidth = width;
  const router = createAppRouter(
    { authConfigured: true, backendConfigured: true },
    createMemoryHistory({ initialEntries: [path] }),
  );
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}

describe("mobile sidebar sheet", () => {
  it("keeps navigation in a sheet opened from the menu button", async () => {
    await renderAt("/library", 390);
    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
    fireEvent.click(await screen.findByLabelText("Open menu"));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("navigation", { name: "Primary" }),
    ).toBeTruthy();
  });

  it("closes with Escape", async () => {
    await renderAt("/library", 390);
    fireEvent.click(await screen.findByLabelText("Open menu"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes after choosing a destination", async () => {
    const router = await renderAt("/library", 390);
    fireEvent.click(await screen.findByLabelText("Open menu"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("link", { name: "Inbox" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.state.location.pathname).toBe("/inbox");
  });

  it("shows the sidebar inline, without the menu bar, on desktop", async () => {
    await renderAt("/library", 1440);
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("accessibility landmarks", () => {
  it.each([
    ["/library", 1440],
    ["/graph", 1440],
  ])("%s has a skip link to a focusable main", async (path, width) => {
    await renderAt(path, width);
    const main = screen.getByRole("main");
    expect(main.id).toBe("main");
    fireEvent.click(screen.getByText("Skip to content"));
    expect(document.activeElement).toBe(main);
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("labels the sidebar and navigation landmarks", async () => {
    await renderAt("/library", 1440);
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Labels" })).toBeTruthy();
  });
});
