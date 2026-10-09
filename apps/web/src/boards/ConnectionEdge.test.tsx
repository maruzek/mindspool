import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConnectionControls } from "./ConnectionControls";
afterEach(cleanup);
it("edits arrows and palette without exposing global relationships", () => {
  const update = vi.fn();
  render(
    <ConnectionControls
      connection={{
        key: "e",
        source: "a",
        target: "b",
        arrows: "none",
        label: "",
        color: "ink",
      }}
      update={update}
      remove={vi.fn()}
      disabled={false}
    />,
  );
  fireEvent.change(screen.getByLabelText("Connection arrows"), {
    target: { value: "both" },
  });
  expect(update).toHaveBeenCalledWith({ arrows: "both" });
  expect(screen.getByLabelText("Connection label")).toBeTruthy();
});
