import { cleanup, render, screen, within } from "@testing-library/react";
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
}
const primary = () =>
  within(screen.getByRole("navigation", { name: "Primary" }));
const badge = () =>
  document.querySelector(
    "[data-slot='sidebar-menu-badge']",
  ) as HTMLElement | null;
const stats = (inbox: number, total = 100, needsReview = 0) => {
  backend.stats = { total, inbox, needsReview };
};

describe("inbox count in the sidebar", () => {
  it("shows the inbox count next to Inbox", async () => {
    stats(12);
    await renderAt("/library");
    expect(badge()?.textContent).toBe("12");
    expect(
      primary()
        .getByRole("link", { name: "Inbox" })
        .getAttribute("aria-describedby"),
    ).toBe(badge()?.id);
  });
  it("is hidden at zero and while loading", async () => {
    stats(0);
    await renderAt("/library");
    expect(badge()).toBeNull();
    cleanup();
    backend.stats = undefined;
    await renderAt("/library");
    expect(badge()).toBeNull();
    expect(
      primary()
        .getByRole("link", { name: "Inbox" })
        .getAttribute("aria-describedby"),
    ).toBeNull();
  });
  it("caps the display at 99+", async () => {
    stats(99);
    await renderAt("/library");
    expect(badge()?.textContent).toBe("99");
    cleanup();
    stats(100);
    await renderAt("/library");
    expect(badge()?.textContent).toBe("99+");
  });
  it("keeps the link's name and active state unchanged", async () => {
    stats(5);
    await renderAt("/inbox");
    const link = primary().getByRole("link", { name: "Inbox" });
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.textContent).toBe("Inbox");
  });
});
