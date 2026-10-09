import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useBoardSession } from "./useBoardSession";
const state = vi.hoisted(() => ({ blocker: vi.fn(), apply: vi.fn() }));
vi.mock("convex/react", () => ({ useMutation: () => state.apply }));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: (options: unknown) => state.blocker(options),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  state.blocker.mockClear();
});
it("blocks route and tab departure while viewport persistence is pending", () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  const layout = { elements: [], connections: [] };
  const { rerender } = renderHook(
    ({ pending }) => useBoardSession("board" as never, layout, 0, pending),
    { initialProps: { pending: false } },
  );
  let options = state.blocker.mock.lastCall![0];
  expect(
    options.shouldBlockFn({
      current: { pathname: "/labels/one" },
      next: { pathname: "/library", search: {} },
    }),
  ).toBe(false);
  rerender({ pending: true });
  options = state.blocker.mock.lastCall![0];
  expect(
    options.shouldBlockFn({
      current: { pathname: "/labels/one" },
      next: {
        pathname: "/labels/one",
        search: { layout: "board", item: "item" },
      },
    }),
  ).toBe(false);
  expect(options.enableBeforeUnload).toBe(true);
  expect(
    options.shouldBlockFn({
      current: { pathname: "/labels/one" },
      next: { pathname: "/library", search: {} },
    }),
  ).toBe(true);
});
