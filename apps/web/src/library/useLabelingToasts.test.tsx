import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLabelingToasts } from "./useLabelingToasts";
import type { PreviewItem } from "./types";

const toast = vi.fn();
vi.mock("@mindspool/ui/components/sonner", () => ({
  toast: (...args: unknown[]) => toast(...args),
}));
beforeEach(() => toast.mockReset());

const item = (extra: Record<string, unknown> = {}) =>
  ({
    _id: "i1",
    labels: [],
    labelCount: 0,
    ...extra,
  }) as unknown as PreviewItem;
const setup = (initial: PreviewItem[]) => {
  const open = vi.fn();
  const view = renderHook(({ items }) => useLabelingToasts(items, open), {
    initialProps: { items: initial },
  });
  return { open, ...view };
};

describe("useLabelingToasts", () => {
  it("toasts once when a pending run finishes with unsure labels, and opens the item", () => {
    const { open, rerender } = setup([item({ labeling: true })]);
    expect(toast).not.toHaveBeenCalled();
    rerender({ items: [item({ unsureCount: 2 })] });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0]![0]).toBe("2 labels need a look");
    toast.mock.calls[0]![1].action.onClick();
    expect(open).toHaveBeenCalledWith("i1");
    rerender({ items: [item({ unsureCount: 2 })] });
    expect(toast).toHaveBeenCalledTimes(1);
  });
  it("uses the singular for one label", () => {
    const { rerender } = setup([item({ labeling: true })]);
    rerender({ items: [item({ unsureCount: 1 })] });
    expect(toast.mock.calls[0]![0]).toBe("1 label needs a look");
  });
  it("does not toast for old runs on load or for a clean finish", () => {
    const { rerender } = setup([item({ unsureCount: 3 })]);
    expect(toast).not.toHaveBeenCalled();
    rerender({ items: [item({ labeling: true, unsureCount: 3 })] });
    rerender({ items: [item()] });
    expect(toast).not.toHaveBeenCalled();
  });
});
