import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backend, resetBackend } from "../test-utils/mocks";
import { AiUsageMeter, untilReset } from "./AiUsageMeter";

vi.mock(
  "convex/react",
  async () => (await import("../test-utils/mocks")).convexMock,
);

beforeEach(() => {
  resetBackend();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T18:48:00Z")); // 5h 12m to reset
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const usage = (used: number, limit = 9000, runs = 41) => {
  backend.aiUsage = {
    used,
    limit,
    fraction: used / limit,
    resetsAt: Date.UTC(2026, 9, 8),
    tokens: 0,
    runs,
  };
};
const bar = () => screen.getByRole("progressbar");
const indicator = () =>
  document.querySelector("[data-slot=progress-indicator]") as HTMLElement;

describe("AiUsageMeter", () => {
  it("shows 0% in the success tone", () => {
    usage(0);
    render(<AiUsageMeter />);
    expect(screen.getByText("0%")).toBeTruthy();
    expect(bar().getAttribute("aria-valuenow")).toBe("0");
  });

  it("shows percent and a neuron tooltip", () => {
    usage(3420);
    render(<AiUsageMeter />);
    expect(screen.getByText("38%")).toBeTruthy();
    expect(document.querySelector("[title]")?.getAttribute("title")).toBe(
      "3,420 of 9,000 neurons · 41 runs · resets in 5h 12m",
    );
    expect(bar().getAttribute("aria-valuenow")).toBe("38");
  });

  it("warns from 80%", () => {
    usage(7650);
    render(<AiUsageMeter />);
    expect(screen.getByText("85%")).toBeTruthy();
    expect(bar().closest("[class*='bg-warning']")).toBeTruthy();
    expect(indicator()).toBeTruthy();
  });

  it("says the limit is reached at 100% and never shows more than 100", () => {
    usage(9500);
    render(<AiUsageMeter />);
    expect(screen.getByText("Limit reached · resets in 5h 12m")).toBeTruthy();
    expect(screen.queryByText(/105%/)).toBeNull();
    expect(bar().getAttribute("aria-valuenow")).toBe("100");
  });

  it("shows a skeleton while loading", () => {
    backend.aiUsage = undefined;
    render(<AiUsageMeter />);
    expect(screen.getByTestId("ai-usage-loading")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("says usage is unavailable when the query fails", () => {
    backend.aiUsageError = new Error("down");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AiUsageMeter />);
    expect(screen.getByText("AI usage unavailable")).toBeTruthy();
    spy.mockRestore();
  });
});

describe("untilReset", () => {
  it("formats hours and minutes", () => {
    const now = Date.UTC(2026, 9, 7, 18, 48);
    expect(untilReset(Date.UTC(2026, 9, 8), now)).toBe("5h 12m");
    expect(untilReset(Date.UTC(2026, 9, 8), Date.UTC(2026, 9, 7, 23, 30))).toBe(
      "30m",
    );
    expect(untilReset(Date.UTC(2026, 9, 8), Date.UTC(2026, 9, 8, 1))).toBe(
      "0m",
    );
  });
});
