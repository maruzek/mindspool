import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useBoardLayout } from "./useBoardLayout";
const state = vi.hoisted(() => ({
  board: { _id: "board", revision: 0 },
  client: { query: vi.fn() },
}));
vi.mock("convex/react", () => ({
  useQuery: () => state.board,
  useConvex: () => state.client,
}));
afterEach(() => {
  cleanup();
  state.client.query.mockReset();
  state.board.revision = 0;
});
const page = (revision: number, done = true) => ({
  page: [],
  revision,
  isDone: done,
  continueCursor: done ? "done" : "next",
});
it("publishes only after every element and connection page has the same revision", async () => {
  let finish!: (value: ReturnType<typeof page>) => void;
  state.client.query
    .mockResolvedValueOnce(page(0, false))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(page(0));
  const { result } = renderHook(() => useBoardLayout("board" as never));
  await waitFor(() => expect(state.client.query).toHaveBeenCalledTimes(2));
  expect(result.current.layout).toBeUndefined();
  finish(page(0));
  await waitFor(() => expect(result.current.layout?.revision).toBe(0));
  expect(state.client.query).toHaveBeenCalledTimes(3);
});
it("rejects torn reads and keeps the complete prior snapshot for retry", async () => {
  state.client.query.mockResolvedValue(page(0));
  const { result, rerender } = renderHook(() =>
    useBoardLayout("board" as never),
  );
  await waitFor(() => expect(result.current.layout?.revision).toBe(0));
  const prior = result.current.layout;
  state.board.revision = 1;
  state.client.query.mockResolvedValue(page(2));
  rerender();
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.layout).toBe(prior);
  state.client.query.mockResolvedValue(page(1));
  result.current.retry();
  await waitFor(() => expect(result.current.layout?.revision).toBe(1));
  expect(result.current.error).toBe(false);
});
