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

  it("keeps valid library search params and drops invalid ones", async () => {
    const router = await renderAt("/library?layout=grid&item=abc");
    expect(router.state.matches.at(-1)!.search).toEqual({
      layout: "grid",
      item: "abc",
    });
    cleanup();
    const bad = await renderAt("/library?layout=tiles");
    expect(bad.state.matches.at(-1)!.search).toEqual({});
  });

  it("shows a not-found state for unknown paths", async () => {
    await renderAt("/nope");
    expect(
      await screen.findByRole("heading", { name: "Not found" }),
    ).toBeTruthy();
  });
});
