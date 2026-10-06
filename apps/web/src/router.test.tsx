import { cleanup, render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppRouter } from "./router";
import { resetBackend } from "./test-utils/mocks";

vi.mock(
  "@clerk/react",
  async () => (await import("./test-utils/mocks")).clerkMock,
);
vi.mock(
  "convex/react",
  async () => (await import("./test-utils/mocks")).convexMock,
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

describe("routing", () => {
  it("redirects / to /library", async () => {
    const router = await renderAt("/");
    expect(router.state.location.pathname).toBe("/library");
    expect(
      await screen.findByRole("heading", { name: "Library" }),
    ).toBeTruthy();
  });

  it("shows a not-found state for unknown paths", async () => {
    await renderAt("/nope");
    expect(
      await screen.findByRole("heading", { name: "Not found" }),
    ).toBeTruthy();
  });
});
