import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppRouter } from "../router";
import type { LibrarySearch } from "./searchParams";
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
const box = () =>
  screen.getByLabelText("Search everything") as HTMLInputElement;
const type = (text: string) =>
  fireEvent.change(box(), { target: { value: text } });
const enter = () => fireEvent.submit(box().closest("form")!);
const search = (router: Awaited<ReturnType<typeof renderAt>>) =>
  router.state.matches.at(-1)!.search as LibrarySearch;

describe("sidebar search box", () => {
  it("is an enabled search field in a search landmark", async () => {
    await renderAt("/library");
    expect(box().disabled).toBe(false);
    expect(screen.getByRole("search")).toBeTruthy();
  });

  it("submits to the library with the query and keeps the layout", async () => {
    const router = await renderAt("/library?layout=grid");
    type("  ramen  ");
    enter();
    await waitFor(() => expect(search(router)).toMatchObject({ q: "ramen" }));
    expect(router.state.location.pathname).toBe("/library");
    expect(search(router)).toMatchObject({ layout: "grid", q: "ramen" });
  });

  it("does nothing for a blank query", async () => {
    const router = await renderAt("/library");
    const entries = router.history.length;
    type("   ");
    enter();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(search(router).q).toBeUndefined();
    expect(router.history.length).toBe(entries);
  });

  it("keeps filters, drops the selected item, and stays in the inbox", async () => {
    const router = await renderAt("/inbox?source=x&review=1&item=abc");
    type("ramen");
    enter();
    await waitFor(() => expect(search(router)).toMatchObject({ q: "ramen" }));
    expect(router.state.location.pathname).toBe("/inbox");
    expect(search(router)).toMatchObject({ source: "x", review: 1 });
    expect(search(router).item).toBeUndefined();
  });

  it("searches within a label when opened from a label page", async () => {
    const { backend } = await import("../test-utils/mocks");
    backend.label = { _id: "label1", name: "Recipes" };
    const router = await renderAt("/labels/label1");
    type("ramen");
    enter();
    await waitFor(() => expect(search(router)).toMatchObject({ q: "ramen" }));
    expect(router.state.location.pathname).toBe("/labels/label1");
  });

  it("mirrors the query in the URL and follows back navigation", async () => {
    const router = await renderAt("/library?q=ramen");
    expect(box().value).toBe("ramen");
    type("noodles");
    enter();
    await waitFor(() => expect(box().value).toBe("noodles"));
    router.history.back();
    await waitFor(() => expect(box().value).toBe("ramen"));
  });

  it("Escape clears the text and the query", async () => {
    const router = await renderAt("/library?q=ramen&source=x");
    box().focus();
    fireEvent.keyDown(box(), { key: "Escape" });
    await waitFor(() => expect(search(router).q).toBeUndefined());
    expect(box().value).toBe("");
    expect(search(router).source).toBe("x");
  });

  it("slash focuses the box from outside a text field", async () => {
    await renderAt("/library");
    const press = fireEvent.keyDown(document.body, { key: "/" });
    expect(press).toBe(false); // default prevented
    expect(document.activeElement).toBe(box());
  });

  it("slash typed in the capture field is left alone", async () => {
    await renderAt("/library");
    const capture = screen.getByPlaceholderText(
      "Paste a link or write a note…",
    );
    capture.focus();
    const press = fireEvent.keyDown(capture, { key: "/" });
    expect(press).toBe(true);
    expect(document.activeElement).toBe(capture);
  });

  it("ignores slash with a modifier key", async () => {
    await renderAt("/library");
    fireEvent.keyDown(document.body, { key: "/", ctrlKey: true });
    expect(document.activeElement).not.toBe(box());
  });
});
