import { cleanup, render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppRouter } from "./router";
import { backend, resetBackend } from "./test-utils/mocks";

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

  it("keeps search and filter params on every library-style route", async () => {
    for (const path of ["/library", "/inbox"]) {
      const router = await renderAt(`${path}?q=ramen&source=x&review=1`);
      expect(router.state.matches.at(-1)!.search).toEqual({
        q: "ramen",
        source: "x",
        review: 1,
      });
      cleanup();
    }
    const bad = await renderAt("/library?source=myspace&review=0&q=%20");
    expect(bad.state.matches.at(-1)!.search).toEqual({});
  });

  it("renders the inbox as the library view in inbox mode", async () => {
    await renderAt("/inbox");
    expect(await screen.findByRole("heading", { name: "Inbox" })).toBeTruthy();
    expect(
      screen.getByPlaceholderText("Paste a link or write a note…"),
    ).toBeTruthy();
    expect(backend.paginatedArgs["items:list"]).toMatchObject({ inbox: true });
  });

  it("shows a not-found state for unknown paths", async () => {
    await renderAt("/nope");
    expect(
      await screen.findByRole("heading", { name: "Not found" }),
    ).toBeTruthy();
  });
});
