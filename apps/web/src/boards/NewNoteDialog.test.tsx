import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NewNoteDialog } from "./NewNoteDialog";
afterEach(cleanup);
it("requires nonblank text, preserves whitespace, and retains failed drafts", () => {
  const create = vi.fn();
  const { rerender } = render(
    <NewNoteDialog onCreate={create} onClose={vi.fn()} status="saved" />,
  );
  fireEvent.change(screen.getByLabelText("Note text"), {
    target: { value: "  https://example.com\n  " },
  });
  fireEvent.click(screen.getByText("Create note"));
  expect(create).toHaveBeenCalledWith("  https://example.com\n  ");
  rerender(
    <NewNoteDialog onCreate={create} onClose={vi.fn()} status="error" />,
  );
  expect(
    (screen.getByLabelText("Note text") as HTMLTextAreaElement).value,
  ).toBe("  https://example.com\n  ");
});

it("offers retry and reload inside the modal while keeping the note draft", () => {
  const retry = vi.fn();
  const reload = vi.fn();
  const { rerender } = render(
    <NewNoteDialog
      onCreate={vi.fn()}
      onClose={vi.fn()}
      status="saved"
      onRetry={retry}
      onReload={reload}
    />,
  );
  fireEvent.change(screen.getByLabelText("Note text"), {
    target: { value: "Keep me" },
  });
  rerender(
    <NewNoteDialog
      onCreate={vi.fn()}
      onClose={vi.fn()}
      status="error"
      onRetry={retry}
      onReload={reload}
    />,
  );
  fireEvent.click(screen.getByText("Retry"));
  expect(retry).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText("Reload latest"));
  expect(reload).toHaveBeenCalledOnce();
  expect(
    (screen.getByLabelText("Note text") as HTMLTextAreaElement).value,
  ).toBe("Keep me");
});
