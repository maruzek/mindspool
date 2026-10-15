import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageViewer } from "@mindspool/ui/components/mindspool/image-viewer";

afterEach(cleanup);

const urls = [1, 2, 3, 4].map((n) => `https://cdn.test/${n}.jpg`);

function Harness({
  images = urls,
  start = 0,
}: {
  images?: string[];
  start?: number;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(start);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <ImageViewer
        images={images}
        index={index}
        onIndexChange={setIndex}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
async function open(props?: Parameters<typeof Harness>[0]) {
  render(<Harness {...props} />);
  const opener = screen.getByRole("button", { name: "Open" });
  opener.focus(); // a real click focuses the button; fireEvent does not
  fireEvent.click(opener);
  return screen.findByRole("dialog");
}
const shown = () =>
  document.querySelector<HTMLImageElement>("[data-slot='image-viewer'] img")!;

describe("ImageViewer", () => {
  it("opens at the given image with a counter", async () => {
    await open({ start: 1 });
    expect(shown().getAttribute("src")).toBe(urls[1]);
    expect(shown().getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(screen.getByText("2 / 4").getAttribute("aria-live")).toBe("polite");
  });

  it("navigates with the buttons and disables them at the ends", async () => {
    await open();
    const previous = screen.getByRole("button", { name: "Previous image" });
    const next = screen.getByRole("button", { name: "Next image" });
    expect((previous as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(next);
    expect(screen.getByText("2 / 4")).toBeTruthy();
    expect(shown().getAttribute("src")).toBe(urls[1]);
    fireEvent.click(next);
    fireEvent.click(next);
    expect(screen.getByText("4 / 4")).toBeTruthy();
    expect((next as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(previous);
    expect(screen.getByText("3 / 4")).toBeTruthy();
  });

  it("navigates with the arrow keys and stops at the ends", async () => {
    const dialog = await open();
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 4")).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByText("3 / 4")).toBeTruthy();
    for (let i = 0; i < 5; i++)
      fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByText("4 / 4")).toBeTruthy();
  });

  it("swipes past 50px but ignores short drags", async () => {
    await open({ start: 1 });
    const area = shown().parentElement!;
    fireEvent.pointerDown(area, { clientX: 200 });
    fireEvent.pointerUp(area, { clientX: 180 });
    expect(screen.getByText("2 / 4")).toBeTruthy();
    fireEvent.pointerDown(area, { clientX: 200 });
    fireEvent.pointerUp(area, { clientX: 100 });
    expect(screen.getByText("3 / 4")).toBeTruthy();
    fireEvent.pointerDown(area, { clientX: 100 });
    fireEvent.pointerUp(area, { clientX: 200 });
    expect(screen.getByText("2 / 4")).toBeTruthy();
  });

  it("closes with Escape and returns focus to the opener", async () => {
    await open();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open" }),
    );
  });

  it("closes from the close button", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows no navigation or counter for a single image", async () => {
    await open({ images: [urls[0]!] });
    expect(screen.queryByRole("button", { name: "Next image" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Previous image" })).toBeNull();
    expect(screen.queryByText(/\d \/ \d/)).toBeNull();
    expect(shown().getAttribute("src")).toBe(urls[0]);
  });

  it("preloads the neighbouring images", async () => {
    const loaded: string[] = [];
    const Original = window.Image;
    class Spy extends Original {
      constructor() {
        super();
        Object.defineProperty(this, "src", {
          set: (value: string) => {
            // The policy must be set before the request starts.
            expect(this.referrerPolicy).toBe("no-referrer");
            loaded.push(value);
          },
        });
      }
    }
    vi.stubGlobal("Image", Spy);
    try {
      await open({ start: 1 });
      expect(loaded.sort()).toEqual([urls[0], urls[2]]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
