import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BoardControls } from "./BoardControls";
afterEach(cleanup);
it("exposes zoom, pan and acknowledged save/retry state", () => {
  const retry = vi.fn();
  const zoom = vi.fn();
  render(
    <BoardControls
      tool="select"
      setTool={vi.fn()}
      status="error"
      retry={retry}
      reload={vi.fn()}
      zoom={1}
      onZoom={zoom}
      fit={vi.fn()}
      undo={vi.fn()}
      redo={vi.fn()}
      canUndo={false}
      canRedo={false}
      disabled={false}
      create={vi.fn()}
    />,
  );
  expect(screen.getByText("Couldn't save")).toBeTruthy();
  fireEvent.click(screen.getByText("Retry"));
  expect(retry).toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("Zoom in"));
  expect(zoom).toHaveBeenCalledWith(1.25);
  expect(screen.queryByText("Export")).toBeNull();
});
