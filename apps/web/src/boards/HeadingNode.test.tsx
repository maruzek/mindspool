import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HeadingControl } from "./HeadingNode";
afterEach(cleanup);
it("edits organizational text as plain text with fixed typography", () => {
  const update = vi.fn();
  render(<HeadingControl text="Ideas" update={update} disabled={false} />);
  fireEvent.change(screen.getByLabelText("Heading text"), {
    target: { value: "<b>Research</b>" },
  });
  fireEvent.blur(screen.getByLabelText("Heading text"));
  expect(update).toHaveBeenCalledWith("<b>Research</b>");
});
