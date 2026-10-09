import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BoardView } from "./BoardView";
const state = vi.hoisted(() => ({
  open: vi.fn(),
  layout: undefined as unknown,
  error: false,
}));
vi.mock("convex/react", () => ({ useMutation: () => state.open }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("./useBoardLayout", () => ({
  useBoardLayout: () => ({
    board: { _id: "board" },
    layout: state.layout,
    error: state.error,
    retry: vi.fn(),
  }),
}));
vi.mock("./BoardEditor", () => ({
  BoardEditor: () => (
    <div>
      <p>Drag items from the library below onto this board.</p>
      <input aria-label="Editor draft" />
    </div>
  ),
}));
afterEach(() => {
  cleanup();
  state.open.mockReset();
  state.layout = undefined;
  state.error = false;
});
it("waits for complete layout and never auto-places saved label items", async () => {
  state.open.mockResolvedValue({ _id: "board" });
  const { rerender } = render(
    <BoardView labelId={"label" as never} name="Design" />,
  );
  await screen.findByText("Loading complete layout…");
  state.layout = { revision: 0, elements: [], connections: [] };
  rerender(<BoardView labelId={"label" as never} name="Design" />);
  expect(
    await screen.findByText(
      "Drag items from the library below onto this board.",
    ),
  ).toBeTruthy();
});
it("offers retry without losing the route on failed open", async () => {
  state.open
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce({ _id: "board" });
  render(<BoardView labelId={"label" as never} name="Design" />);
  fireEvent.click(await screen.findByText("Retry"));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

it("keeps the mounted editor and its draft after a background read fails", async () => {
  state.open.mockResolvedValue({ _id: "board" });
  state.layout = { revision: 0, elements: [], connections: [] };
  const { rerender } = render(
    <BoardView labelId={"label" as never} name="Design" />,
  );
  const input = await screen.findByLabelText("Editor draft");
  fireEvent.change(input, { target: { value: "unsaved" } });
  state.error = true;
  rerender(<BoardView labelId={"label" as never} name="Design" />);
  expect(screen.getByLabelText("Editor draft")).toBe(input);
  expect((input as HTMLInputElement).value).toBe("unsaved");
  expect(screen.getByRole("alert")).toBeTruthy();
});
