import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backend, resetBackend } from "../test-utils/mocks";
import { ClassifyControl } from "./ClassifyControl";
import type { ProcessingRun } from "./types";

vi.mock(
  "convex/react",
  async () => (await import("../test-utils/mocks")).convexMock,
);

beforeEach(resetBackend);
afterEach(cleanup);
const itemId = "item1" as never;
const run = (extra: Record<string, unknown> = {}) =>
  ({
    _id: "r1",
    kind: "decision",
    status: "succeeded",
    ...extra,
  }) as unknown as ProcessingRun;
const classifyButton = () => screen.getByRole("button", { name: /Classify/ });

describe("ClassifyControl", () => {
  it("defaults to Clef-flash and sends the chosen model", async () => {
    backend.classify.mockResolvedValue("run1");
    render(<ClassifyControl itemId={itemId} run={undefined} />);
    const flash = screen.getByRole("button", { name: "Clef-flash" });
    expect(flash.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(classifyButton());
    await waitFor(() =>
      expect(backend.classify).toHaveBeenCalledWith({
        itemId,
        model: "clef-flash",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Clef$/ }));
    fireEvent.click(classifyButton());
    await waitFor(() =>
      expect(backend.classify).toHaveBeenLastCalledWith({
        itemId,
        model: "clef",
      }),
    );
  });

  it("is disabled and says so while a decision run is pending", () => {
    render(
      <ClassifyControl itemId={itemId} run={run({ status: "pending" })} />,
    );
    const button = screen.getByRole("button", { name: "Classifying…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("stays enabled for a pending enrichment run and after success or failure", () => {
    for (const r of [
      run({ kind: "enrichment", status: "pending" }),
      run({ status: "failed" }),
      run(),
    ]) {
      const { unmount } = render(<ClassifyControl itemId={itemId} run={r} />);
      expect((classifyButton() as HTMLButtonElement).disabled).toBe(false);
      unmount();
    }
  });

  it("shows the server's message for CONFLICT", async () => {
    backend.classify.mockRejectedValue(
      new ConvexError({
        code: "CONFLICT",
        message: "Labeling is already running for this item",
      }),
    );
    render(<ClassifyControl itemId={itemId} run={undefined} />);
    fireEvent.click(classifyButton());
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Labeling is already running for this item",
    );
  });

  it("falls back to a readable message for other failures", async () => {
    backend.classify.mockRejectedValue(new Error("offline"));
    render(<ClassifyControl itemId={itemId} run={undefined} />);
    fireEvent.click(classifyButton());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not start labeling",
    );
  });

  it("notes the 64-label limit only above 64 labels", () => {
    const { rerender } = render(
      <ClassifyControl
        itemId={itemId}
        run={run({ labelsAsked: 64, labelsTotal: 70 })}
      />,
    );
    expect(
      screen.getByText("Asked about 64 of 70 labels (most recent)"),
    ).toBeTruthy();
    rerender(
      <ClassifyControl
        itemId={itemId}
        run={run({ labelsAsked: 64, labelsTotal: 64 })}
      />,
    );
    expect(screen.queryByText(/most recent/)).toBeNull();
  });
});
