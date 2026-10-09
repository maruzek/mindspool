import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ColumnControls } from "./ColumnNode";
afterEach(cleanup);
it("renames a column and distinguishes container removal from creating a note", () => {
  const update = vi.fn();
  const remove = vi.fn();
  const note = vi.fn();
  render(
    <ColumnControls
      title="Ideas"
      width={400}
      update={update}
      remove={remove}
      note={note}
      disabled={false}
    />,
  );
  fireEvent.change(screen.getByLabelText("Column title"), {
    target: { value: "Research" },
  });
  fireEvent.blur(screen.getByLabelText("Column title"));
  expect(update).toHaveBeenCalledWith({ title: "Research" });
  fireEvent.click(screen.getByText("Remove column"));
  expect(remove).toHaveBeenCalled();
  fireEvent.click(screen.getByText("New note here"));
  expect(note).toHaveBeenCalled();
});
