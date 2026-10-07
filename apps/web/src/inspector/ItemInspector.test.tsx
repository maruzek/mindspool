import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { ConvexError } from "convex/values";
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

const detail = (id: string) => ({
  _id: id,
  _creationTime: 0,
  inputType: "url",
  originalInput: `https://example.com/${id}`,
  originalUrl: `https://example.com/${id}`,
  captureSource: "web",
  enrichmentStatus: "succeeded",
  sourceMetadata: { title: "Soup recipe" },
});
const widthBefore = window.innerWidth;
beforeEach(() => resetBackend());
afterEach(() => {
  cleanup();
  window.innerWidth = widthBefore;
});

async function renderAt(path: string) {
  const router = createAppRouter(
    { authConfigured: true, backendConfigured: true },
    createMemoryHistory({ initialEntries: [path] }),
  );
  await router.load();
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { level: 1, hidden: true });
  return router;
}

describe("item inspector frame", () => {
  it("opens from ?item and shows the title", async () => {
    backend.detail = (args) => detail((args as { id: string }).id);
    await renderAt("/library?item=a");
    expect(
      await screen.findByRole("heading", { name: "Soup recipe" }),
    ).toBeTruthy();
    expect(
      document
        .querySelector('[data-slot="sidebar"][data-side="right"]')
        ?.getAttribute("data-state"),
    ).toBe("expanded");
  });
  it("shows a skeleton while loading", async () => {
    backend.detail = () => undefined;
    await renderAt("/library?item=a");
    expect(screen.getByLabelText("Loading item")).toBeTruthy();
  });
  it("shows Not found for a missing id and leaves the list usable", async () => {
    await renderAt("/library?item=bad");
    expect(screen.getByText("Not found")).toBeTruthy();
    expect(
      screen.getByText("That page or item does not exist, or it is not yours."),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });
  it("is closed without ?item", async () => {
    await renderAt("/library");
    expect(
      document
        .querySelector('[data-slot="sidebar"][data-side="right"]')
        ?.getAttribute("data-state"),
    ).toBe("collapsed");
  });
  it("closing removes only item and keeps layout", async () => {
    backend.detail = (args) => detail((args as { id: string }).id);
    const router = await renderAt("/library?item=a&layout=grid");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await vi.waitFor(() =>
      expect(router.state.location.search).toEqual({ layout: "grid" }),
    );
  });
  it("uses a full-width sheet on mobile and closes from it", async () => {
    window.innerWidth = 500;
    backend.detail = (args) => detail((args as { id: string }).id);
    const router = await renderAt("/library?item=a");
    const sheet = await screen.findByRole("dialog");
    expect(sheet.getAttribute("data-mobile")).toBe("true");
    fireEvent.click(screen.getByLabelText("Close"));
    await vi.waitFor(() => expect(router.state.location.search).toEqual({}));
  });
  it("ignores Ctrl+B", async () => {
    backend.detail = (args) => detail((args as { id: string }).id);
    const router = await renderAt("/library?item=a");
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(router.state.location.search).toMatchObject({ item: "a" });
    expect(
      document.querySelectorAll('[data-slot="sidebar"][data-state="expanded"]')
        .length,
    ).toBeGreaterThan(0);
  });

  it("shows the saved line, source, and link details", async () => {
    backend.detail = () => ({
      ...detail("a"),
      canonicalUrl: "https://example.com/canon",
      sourceMetadata: {
        title: "Soup recipe",
        description: "Warm soup",
        author: "Ana",
        siteName: "Example",
      },
    });
    await renderAt("/library?item=a");
    expect(await screen.findByText(/^Saved .* from web$/)).toBeTruthy();
    for (const text of [
      "https://example.com/a",
      "https://example.com/canon",
      "Warm soup",
      "Ana",
      "Example",
    ])
      expect(screen.getByText(text)).toBeTruthy();
  });
  it("opens the original safely in a new tab", async () => {
    backend.detail = () => detail("a");
    await renderAt("/library?item=a");
    const link = await screen.findByRole("link", {
      name: "Open original (new tab)",
    });
    expect(link.getAttribute("href")).toBe("https://example.com/a");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
  it("shows note text verbatim as text with no original link", async () => {
    const text = "  line one\n\n  <b>bold</b>\tend ";
    backend.detail = () => ({
      ...detail("n"),
      inputType: "text",
      originalInput: text,
      originalUrl: undefined,
      sourceMetadata: undefined,
    });
    await renderAt("/library?item=n");
    const note = await screen.findByLabelText("Note text");
    expect(note.textContent).toBe(text);
    expect(note.querySelector("b")).toBeNull();
    expect(note.className).toContain("whitespace-pre-wrap");
    expect(screen.queryByRole("link", { name: /Open original/ })).toBeNull();
    expect(screen.getAllByText("note").length).toBeGreaterThan(0);
  });
  it("never offers a non-http original", async () => {
    backend.detail = () => ({
      ...detail("a"),
      originalUrl: "javascript:alert(1)",
    });
    await renderAt("/library?item=a");
    await screen.findByText(/^Saved /);
    expect(screen.queryByRole("link", { name: /Open original/ })).toBeNull();
  });

  describe("delete", () => {
    const open = async () => {
      backend.detail = (args) => detail((args as { id: string }).id);
      const router = await renderAt("/library?item=a&layout=grid");
      fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
      return router;
    };
    it("focuses Cancel, and Cancel or Escape leave the item alone", async () => {
      const router = await open();
      const cancel = await screen.findByRole("button", { name: "Cancel" });
      await vi.waitFor(() => expect(document.activeElement).toBe(cancel));
      fireEvent.click(cancel);
      await vi.waitFor(() =>
        expect(screen.queryByText("Delete this item?")).toBeNull(),
      );
      expect(backend.removeItem).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      fireEvent.keyDown(await screen.findByRole("button", { name: "Cancel" }), {
        key: "Escape",
      });
      await vi.waitFor(() =>
        expect(screen.queryByText("Delete this item?")).toBeNull(),
      );
      expect(backend.removeItem).not.toHaveBeenCalled();
      expect(router.state.location.search).toMatchObject({ item: "a" });
    });
    it("deletes once, closes the panel, keeps layout and announces", async () => {
      backend.removeItem.mockResolvedValue(null);
      const router = await open();
      expect(
        await screen.findByText(/Its original and label links are removed/),
      ).toBeTruthy();
      const buttons = await screen.findAllByRole("button", { name: "Delete" });
      fireEvent.click(buttons[buttons.length - 1]!);
      await vi.waitFor(() =>
        expect(router.state.location.search).toEqual({ layout: "grid" }),
      );
      expect(backend.removeItem).toHaveBeenCalledTimes(1);
      expect(backend.removeItem).toHaveBeenCalledWith({ id: "a" });
      expect(await screen.findByText("Item deleted")).toBeTruthy();
    });
    it("does not flash Not found while the item disappears", async () => {
      backend.removeItem.mockImplementation(() => {
        backend.detail = () => null;
        return new Promise(() => {});
      });
      const router = await open();
      const buttons = await screen.findAllByRole("button", { name: "Delete" });
      fireEvent.click(buttons[buttons.length - 1]!);
      await vi.waitFor(() => expect(backend.removeItem).toHaveBeenCalled());
      // Force a render now that the query reads null, before the URL changes.
      await router.navigate({
        to: ".",
        search: (prev) => ({ ...prev, layout: "list" }),
      });
      expect(screen.queryByText("Not found")).toBeNull();
    });
    it("moves focus to the page when the deleted row is gone", async () => {
      backend.removeItem.mockResolvedValue(null);
      await open();
      const buttons = await screen.findAllByRole("button", { name: "Delete" });
      fireEvent.click(buttons[buttons.length - 1]!);
      await vi.waitFor(() => expect(document.activeElement?.id).toBe("main"));
    });
    it("keeps the dialog and shows the message when delete fails", async () => {
      backend.removeItem.mockRejectedValue(
        new ConvexError({ code: "CONFLICT", message: "Too much history" }),
      );
      const router = await open();
      const buttons = await screen.findAllByRole("button", { name: "Delete" });
      fireEvent.click(buttons[buttons.length - 1]!);
      expect((await screen.findByRole("alert")).textContent).toBe(
        "Too much history",
      );
      expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
      expect(router.state.location.search).toMatchObject({ item: "a" });
    });
  });

  describe("focus and keyboard", () => {
    const realMatchMedia = window.matchMedia;
    const wide = (matches: boolean) => {
      window.matchMedia = ((query: string) => ({
        matches,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })) as unknown as typeof window.matchMedia;
    };
    afterEach(() => {
      window.matchMedia = realMatchMedia;
    });
    const row = (id: string) => ({
      _id: id,
      _creationTime: 0,
      inputType: "url",
      originalInput: `https://example.com/${id}`,
      originalUrl: `https://example.com/${id}`,
      enrichmentStatus: "succeeded",
      captureSource: "web",
      labels: [],
      labelCount: 0,
    });
    const setup = async () => {
      backend.items = [row("a"), row("b")];
      backend.detail = (args) => detail((args as { id: string }).id);
      return renderAt("/library?item=a");
    };

    it("is a labelled complementary region with an h2", async () => {
      await setup();
      const region = await screen.findByRole("complementary", {
        name: "Item inspector",
      });
      expect(region.querySelector("h2")?.textContent).toBe("Soup recipe");
    });
    it("names its controls", async () => {
      backend.labelsStatus = "Exhausted";
      backend.itemLabels = [{ _id: "l1", name: "Food" }];
      await setup();
      await screen.findByRole("complementary", { name: "Item inspector" });
      expect(screen.getByRole("button", { name: "Remove Food" })).toBeTruthy();
      expect(
        screen.getByRole("link", { name: "Open original (new tab)" }),
      ).toBeTruthy();
      expect(screen.getByLabelText("Close")).toBeTruthy();
    });
    it("closes on Escape and returns focus to the selected row", async () => {
      wide(true);
      const router = await setup();
      const region = await screen.findByRole("complementary", {
        name: "Item inspector",
      });
      const link = document.querySelector<HTMLElement>(
        'a[aria-current="true"]',
      )!;
      fireEvent.keyDown(region, { key: "Escape" });
      await vi.waitFor(() => expect(router.state.location.search).toEqual({}));
      await vi.waitFor(() => expect(document.activeElement).toBe(link));
    });
    it("does not steal focus when inline", async () => {
      wide(true);
      await setup();
      await screen.findByRole("complementary", { name: "Item inspector" });
      const region = screen.getByRole("complementary", {
        name: "Item inspector",
      });
      expect(region.contains(document.activeElement)).toBe(false);
    });
    it("takes focus and traps Tab as an overlay", async () => {
      wide(false);
      await setup();
      const region = await screen.findByRole("complementary", {
        name: "Item inspector",
      });
      await vi.waitFor(() => expect(document.activeElement).toBe(region));
      const close = screen.getByLabelText("Close");
      const buttons = [
        ...region.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        ),
      ];
      const last = buttons[buttons.length - 1]!;
      last.focus();
      fireEvent.keyDown(last, { key: "Tab" });
      expect(document.activeElement).toBe(buttons[0]);
      buttons[0]!.focus();
      fireEvent.keyDown(buttons[0]!, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(last);
      expect(buttons).toContain(close);
    });
  });

  describe("review fixes", () => {
    const realMatchMedia = window.matchMedia;
    afterEach(() => {
      window.matchMedia = realMatchMedia;
    });
    const media = (matches: boolean) => {
      window.matchMedia = ((query: string) => ({
        matches,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })) as unknown as typeof window.matchMedia;
    };
    const row = (id: string) => ({
      _id: id,
      _creationTime: 0,
      inputType: "url",
      originalInput: `https://example.com/${id}`,
      originalUrl: `https://example.com/${id}`,
      enrichmentStatus: "succeeded",
      captureSource: "web",
      labels: [],
      labelCount: 0,
    });
    const setup = async () => {
      backend.items = [row("a"), row("b")];
      backend.detail = (args) => detail((args as { id: string }).id);
      return renderAt("/library?item=a");
    };
    const selectB = (router: Awaited<ReturnType<typeof renderAt>>) =>
      router.navigate({
        to: ".",
        search: (prev) => ({ ...prev, item: "b" }),
      });

    it("drops a label error when another item is selected", async () => {
      backend.itemLabels = [{ _id: "l1", name: "Food" }];
      backend.removeItemLabel.mockRejectedValue(
        new ConvexError({ code: "NOT_FOUND", message: "Not found" }),
      );
      const router = await setup();
      fireEvent.click(
        await screen.findByRole("button", { name: "Remove Food" }),
      );
      await screen.findByRole("alert");
      await selectB(router);
      await vi.waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    });
    it("closes the overlay from its backdrop", async () => {
      media(false);
      const router = await setup();
      await screen.findByRole("complementary", { name: "Item inspector" });
      fireEvent.click(
        document.querySelector('[data-slot="inspector-backdrop"]')!,
      );
      await vi.waitFor(() => expect(router.state.location.search).toEqual({}));
    });
    it("has no backdrop inline", async () => {
      media(true);
      await setup();
      await screen.findByRole("complementary", { name: "Item inspector" });
      expect(
        document.querySelector('[data-slot="inspector-backdrop"]'),
      ).toBeNull();
    });
    it("moves focus into the overlay when another item is selected", async () => {
      media(false);
      const router = await setup();
      const region = await screen.findByRole("complementary", {
        name: "Item inspector",
      });
      await vi.waitFor(() => expect(document.activeElement).toBe(region));
      document.querySelector<HTMLElement>('a[aria-current="true"]')!.focus();
      await selectB(router);
      await vi.waitFor(() =>
        expect(
          screen
            .getByRole("complementary", { name: "Item inspector" })
            .contains(document.activeElement),
        ).toBe(true),
      );
    });
    it("keeps the panel open when Escape closes the add-label popover", async () => {
      media(true);
      const router = await setup();
      fireEvent.click(await screen.findByRole("button", { name: "Add label" }));
      const popup = await screen.findByText(/no labels yet/);
      fireEvent.keyDown(popup, { key: "Escape" });
      await vi.waitFor(() =>
        expect(screen.queryByText(/no labels yet/)).toBeNull(),
      );
      expect(router.state.location.search).toMatchObject({ item: "a" });
    });
  });
});
