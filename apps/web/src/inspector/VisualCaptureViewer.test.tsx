import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ImageViewer } from "@mindspool/ui/components/mindspool/image-viewer";
afterEach(cleanup);
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open reference</button>
      <ImageViewer
        images={["https://stored.example/capture.webp"]}
        index={0}
        onIndexChange={() => {}}
        open={open}
        onOpenChange={setOpen}
        inspection={{ width: 1000, height: 2100 }}
      />
    </>
  );
}
it("fits by default and allows readable original-size inspection with scrolling", async () => {
  render(<Harness />);
  fireEvent.click(screen.getByText("Open reference"));
  await screen.findByRole("dialog");
  const image = document.querySelector<HTMLImageElement>(
    "[data-slot='image-viewer'] img",
  )!;
  expect(image.classList.contains("object-contain")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "100%" }));
  expect(image.style.width).toBe("1000px");
  expect(image.style.height).toBe("2100px");
  expect(
    screen
      .getByRole("region", { name: "Scrollable image" })
      .classList.contains("overflow-auto"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Fit" }));
  expect(image.style.width).toBe("");
});
it("retains Escape and focus return while zoomed", async () => {
  render(<Harness />);
  const opener = screen.getByText("Open reference");
  opener.focus();
  fireEvent.click(opener);
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "100%" }));
  fireEvent.keyDown(dialog, { key: "Escape" });
  await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(opener);
});
