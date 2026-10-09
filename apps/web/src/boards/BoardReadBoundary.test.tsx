import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BoardReadBoundary } from "./BoardReadBoundary";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("contains read failures and retries without remounting the editing draft", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let failed = false;
  function Read() {
    if (failed) throw new Error("query failed");
    return <p>Preview loaded</p>;
  }
  const ui = (
    <>
      <input aria-label="Draft" />
      <BoardReadBoundary>
        <Read />
      </BoardReadBoundary>
    </>
  );
  const { rerender } = render(ui);
  const draft = screen.getByLabelText("Draft");
  fireEvent.change(draft, { target: { value: "Keep this" } });
  failed = true;
  rerender(
    <>
      <input aria-label="Draft" />
      <BoardReadBoundary>
        <Read />
      </BoardReadBoundary>
    </>,
  );
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.getByLabelText("Draft")).toBe(draft);
  failed = false;
  fireEvent.click(screen.getByText("Retry loading"));
  expect(screen.getByText("Preview loaded")).toBeTruthy();
  expect((draft as HTMLInputElement).value).toBe("Keep this");
});
