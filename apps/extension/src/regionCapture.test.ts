import { afterEach, expect, it, vi } from "vitest";
import { selectRegion, pixelCrop } from "./regionCapture";
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});
it("handles reversed drags, clamps edges, and removes the overlay before resolving", async () => {
  const selection = selectRegion();
  const overlay = document.querySelector<HTMLElement>(
    "[data-mindspool-region]",
  )!;
  overlay.dispatchEvent(
    new MouseEvent("pointerdown", {
      clientX: 200,
      clientY: 150,
      bubbles: true,
    }),
  );
  overlay.dispatchEvent(
    new MouseEvent("pointerup", { clientX: -10, clientY: 20, bubbles: true }),
  );
  expect(await selection).toEqual({
    left: 0,
    top: 20,
    width: 200,
    height: 130,
  });
  expect(document.querySelector("[data-mindspool-region]")).toBeNull();
});
it("cancels on Escape and on empty selection without leaving handlers or DOM", async () => {
  const selection = selectRegion();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(await selection).toBeNull();
  expect(document.querySelector("[data-mindspool-region]")).toBeNull();
  const empty = selectRegion();
  const overlay = document.querySelector<HTMLElement>(
    "[data-mindspool-region]",
  )!;
  overlay.dispatchEvent(
    new MouseEvent("pointerdown", { clientX: 20, clientY: 20 }),
  );
  overlay.dispatchEvent(
    new MouseEvent("pointerup", { clientX: 20, clientY: 20 }),
  );
  expect(await empty).toBeNull();
});
it("crops using measured screenshot ratios rather than assumed devicePixelRatio", () => {
  expect(
    pixelCrop(
      { left: 10, top: 20, width: 100, height: 80 },
      1250,
      950,
      1000,
      760,
    ),
  ).toEqual({ left: 12, top: 25, width: 126, height: 100 });
});
it("aborts and restores the page when the viewport changes", async () => {
  const selection = selectRegion();
  window.dispatchEvent(new Event("resize"));
  await expect(selection).rejects.toThrow("page_changed");
  expect(document.querySelector("[data-mindspool-region]")).toBeNull();
});
