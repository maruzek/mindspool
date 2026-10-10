import { useEffect } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CanvasProps } from "./BoardCanvas";
import type { BoardPreview } from "./types";
import type { Doc } from "@mindspool/backend/data-model";
import type { BoardLayout } from "./useBoardLayout";
import { BoardEditor } from "./BoardEditor";

const state = vi.hoisted(() => ({
  tray: [] as BoardPreview[],
  placed: undefined as BoardPreview[] | undefined,
  filters: {},
  apply: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: () => state.placed,
  useMutation: () => state.apply,
}));
vi.mock("@tanstack/react-router", () => ({
  useSearch: () => state.filters,
  useNavigate: () => state.navigate,
  useBlocker: () => {},
}));
vi.mock("../inspector/ItemInspector", () => ({ ItemInspector: () => null }));
vi.mock("./BoardCanvas", () => ({
  BoardCanvas: ({ layout, previews }: CanvasProps) => (
    <div aria-label="Board canvas">
      {layout.elements.map(({ key, data }) => (
        <article key={key} data-key={key}>
          {data.type === "item"
            ? (previews.find((p) => p.itemId === data.itemId)?.title ??
              "Loading preview")
            : "Organization"}
        </article>
      ))}
    </div>
  ),
}));
vi.mock("./BoardLibrary", () => ({
  BoardLibrary: ({
    report,
    onAdd,
  }: {
    report: (items: BoardPreview[]) => void;
    onAdd: (id: BoardPreview["itemId"]) => void;
  }) => {
    useEffect(() => report(state.tray), [report, state.tray]);
    return (
      <button onClick={() => onAdd(state.tray[0]!.itemId)}>
        Add from tray
      </button>
    );
  },
}));
const item: BoardPreview = {
  itemId: "item" as never,
  title: "Placed reference",
  body: "Saved text",
  source: "reddit",
  imageUrl: "https://example.com/image.png",
  originalUrl: "https://reddit.com/example",
  hasText: true,
  labels: [],
};
const board = {
  _id: "board",
  viewport: { x: 0, y: 0, zoom: 1 },
} as Doc<"boards">;
const empty: BoardLayout = { revision: 0, elements: [], connections: [] };
const saved: BoardLayout = {
  ...empty,
  elements: [
    {
      key: "card",
      data: {
        type: "item",
        itemId: item.itemId,
        membership: "one",
        x: 0,
        y: 0,
        width: 300,
        imageHeight: 200,
        textHeight: 120,
        mode: "combined",
      },
    } as Doc<"boardElements">,
  ],
};
afterEach(() => {
  cleanup();
  state.tray = [];
  state.placed = undefined;
  state.filters = {};
  state.apply.mockReset();
});
it("keeps a newly placed card's preview when filters empty the tray before its save finishes", () => {
  state.tray = [item];
  state.apply.mockImplementation(() => new Promise(() => {}));
  const { rerender } = render(<BoardEditor board={board} layout={empty} />);
  fireEvent.click(screen.getByText("Add from tray"));
  expect(screen.getByText(item.title)).toBeTruthy();
  state.filters = { q: "no matches", source: "note" };
  state.tray = [];
  rerender(<BoardEditor board={board} layout={empty} />);
  expect(screen.getByText(item.title)).toBeTruthy();
  expect(screen.queryByText("Loading preview")).toBeNull();
});
it("keeps saved cards visible while placed previews load and tray filters change", () => {
  state.tray = [item];
  const { rerender } = render(<BoardEditor board={board} layout={saved} />);
  expect(screen.getByText(item.title)).toBeTruthy();
  state.tray = [];
  state.filters = { source: "note", review: 1 };
  rerender(<BoardEditor board={board} layout={saved} />);
  expect(screen.getByText(item.title)).toBeTruthy();
  state.placed = [{ ...item, title: "Updated reference" }];
  rerender(<BoardEditor board={board} layout={saved} />);
  expect(screen.getByText("Updated reference")).toBeTruthy();
  state.placed = [];
  act(() => rerender(<BoardEditor board={board} layout={saved} />));
  expect(screen.queryByText("Updated reference")).toBeNull();
  expect(document.querySelector('[data-key="card"]')).toBeNull();
});
