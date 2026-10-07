import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
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

async function renderAt(path: string) {
  const router = createAppRouter(
    { authConfigured: true, backendConfigured: true },
    createMemoryHistory({ initialEntries: [path] }),
  );
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}
const labelsNav = () => screen.getByRole("navigation", { name: "Labels" });
const recipes = { _id: "label-recipes", name: "Recipes" };
const dev = { _id: "label-dev", name: "Dev" };

describe("labels in the sidebar", () => {
  it("links each label to its page and marks the open one", async () => {
    backend.labels = [recipes, dev];
    backend.label = recipes;
    await renderAt("/labels/label-recipes");
    const links = within(labelsNav()).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Recipes", "Dev"]);
    expect(links[0]!.getAttribute("href")).toBe("/labels/label-recipes");
    expect(links[0]!.getAttribute("aria-current")).toBe("page");
    expect(links[1]!.getAttribute("aria-current")).toBeNull();
    const primary = screen.getByRole("navigation", { name: "Primary" });
    expect(
      within(primary)
        .getAllByRole("link")
        .some((link) => link.getAttribute("aria-current") === "page"),
    ).toBe(false);
  });

  it("shows a loading state, an empty state, and a load-more control", async () => {
    backend.labelsStatus = "LoadingFirstPage";
    await renderAt("/library");
    expect(screen.getByRole("status", { name: "Loading labels" })).toBeTruthy();
    cleanup();
    backend.labelsStatus = "Exhausted";
    await renderAt("/library");
    expect(screen.getByText("No labels yet.")).toBeTruthy();
    cleanup();
    backend.labels = [recipes];
    backend.labelsStatus = "CanLoadMore";
    await renderAt("/library");
    fireEvent.click(screen.getByText("More labels"));
    expect(backend.loadMore).toHaveBeenCalledWith(20);
  });
});

describe("label page", () => {
  it("shows the label name", async () => {
    backend.label = recipes;
    await renderAt("/labels/label-recipes");
    expect(
      await screen.findByRole("heading", { name: "Recipes", level: 1 }),
    ).toBeTruthy();
  });

  it("announces loading while the label resolves", async () => {
    backend.label = undefined;
    await renderAt("/labels/label-recipes");
    expect(screen.getByRole("status", { name: "Loading label" })).toBeTruthy();
  });

  it("shows Not found for a foreign, missing, or malformed id", async () => {
    backend.label = null;
    await renderAt("/labels/someone-elses-id");
    expect(
      await screen.findByRole("heading", { name: "Not found" }),
    ).toBeTruthy();
    expect(screen.queryByText("someone-elses-id")).toBeNull();
  });
});

describe("create label dialog", () => {
  async function openDialog() {
    fireEvent.click(await screen.findByLabelText("Create label"));
    return screen.findByRole("dialog");
  }

  it("rejects a blank name without calling the backend", async () => {
    await renderAt("/library");
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "   " },
    });
    fireEvent.click(within(dialog).getByText("Create label"));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "Enter a label name.",
    );
    expect(backend.createLabel).not.toHaveBeenCalled();
  });

  it("limits the name to 80 characters", async () => {
    await renderAt("/library");
    const dialog = await openDialog();
    expect(
      (within(dialog).getByLabelText("Name") as HTMLInputElement).maxLength,
    ).toBe(80);
  });

  it("creates the label with a trimmed name, closes, and opens it", async () => {
    backend.createLabel.mockResolvedValue("label-recipes");
    backend.label = recipes;
    const router = await renderAt("/library");
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "  Recipes  " },
    });
    fireEvent.click(within(dialog).getByText("Create label"));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/labels/label-recipes"),
    );
    expect(backend.createLabel).toHaveBeenCalledWith({ name: "Recipes" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the dialog open and explains a failure", async () => {
    backend.createLabel.mockRejectedValue(new Error("offline"));
    await renderAt("/library");
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Recipes" },
    });
    fireEvent.click(within(dialog).getByText("Create label"));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "Could not create the label",
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("sends a trimmed description when given, with the model-context note", async () => {
    backend.createLabel.mockResolvedValue("label-recipes");
    backend.label = recipes;
    await renderAt("/library");
    const dialog = await openDialog();
    expect(
      within(dialog).getByText(/Sent to the model as context/),
    ).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Recipes" },
    });
    fireEvent.change(within(dialog).getByLabelText("Description (optional)"), {
      target: { value: "  Cooking instructions  " },
    });
    fireEvent.click(within(dialog).getByText("Create label"));
    await waitFor(() =>
      expect(backend.createLabel).toHaveBeenCalledWith({
        name: "Recipes",
        description: "Cooking instructions",
      }),
    );
  });

  it("limits the description and rejects a whitespace-only one", async () => {
    await renderAt("/library");
    const dialog = await openDialog();
    const description = within(dialog).getByLabelText(
      "Description (optional)",
    ) as HTMLTextAreaElement;
    expect(description.maxLength).toBe(500);
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Recipes" },
    });
    fireEvent.change(description, { target: { value: "   " } });
    fireEvent.click(within(dialog).getByText("Create label"));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "description",
    );
    expect(backend.createLabel).not.toHaveBeenCalled();
    expect(description.value).toBe("   ");
  });
});
