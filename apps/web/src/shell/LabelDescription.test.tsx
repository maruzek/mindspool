import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

beforeEach(resetBackend);
afterEach(cleanup);

async function renderLabel(description?: string) {
  backend.label = { _id: "label-recipes", name: "Recipes", description };
  const router = createAppRouter(
    { authConfigured: true, backendConfigured: true },
    createMemoryHistory({ initialEntries: ["/labels/label-recipes"] }),
  );
  await router.load();
  render(<RouterProvider router={router} />);
}

function save() {
  const form = screen.getByLabelText("Description").closest("form")!;
  fireEvent.click(within(form).getByText("Save"));
}

describe("label description", () => {
  it("shows the description as muted text under the heading", async () => {
    await renderLabel("Cooking instructions");
    expect(await screen.findByText("Cooking instructions")).toBeTruthy();
    expect(screen.getByText("Edit description")).toBeTruthy();
  });

  it("offers to add one when empty and saves a trimmed value", async () => {
    backend.updateLabel.mockResolvedValue(null);
    await renderLabel();
    fireEvent.click(await screen.findByText("Add description"));
    expect(screen.getByText(/Sent to the model as context/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "  Food  " },
    });
    save();
    await waitFor(() =>
      expect(backend.updateLabel).toHaveBeenCalledWith({
        id: "label-recipes",
        description: "Food",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Description")).toBeNull(),
    );
  });

  it("clears an existing description by saving an empty one", async () => {
    backend.updateLabel.mockResolvedValue(null);
    await renderLabel("Old");
    fireEvent.click(await screen.findByText("Edit description"));
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "" },
    });
    save();
    await waitFor(() =>
      expect(backend.updateLabel).toHaveBeenCalledWith({
        id: "label-recipes",
        description: "",
      }),
    );
  });

  it("shows the error and keeps the draft when over the limit or failing", async () => {
    await renderLabel("Old");
    fireEvent.click(await screen.findByText("Edit description"));
    const field = screen.getByLabelText("Description") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "a".repeat(501) } });
    save();
    expect((await screen.findByRole("alert")).textContent).toContain("500");
    expect(backend.updateLabel).not.toHaveBeenCalled();

    backend.updateLabel.mockRejectedValue(
      new ConvexError({
        code: "INVALID_INPUT",
        message: "Invalid label description",
      }),
    );
    fireEvent.change(field, { target: { value: "keep me" } });
    save();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Invalid label description",
      ),
    );
    expect(field.value).toBe("keep me");
  });

  it("cancel leaves the description unchanged", async () => {
    await renderLabel("Old");
    fireEvent.click(await screen.findByText("Edit description"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Old")).toBeTruthy();
    expect(backend.updateLabel).not.toHaveBeenCalled();
  });
});
