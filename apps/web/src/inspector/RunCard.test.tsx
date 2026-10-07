import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backend, resetBackend } from "../test-utils/mocks";
import { RunCard } from "./RunCard";

vi.mock(
  "convex/react",
  async () => (await import("../test-utils/mocks")).convexMock,
);

beforeEach(resetBackend);
afterEach(cleanup);
const itemId = "item1" as never;
const run = (extra: Record<string, unknown> = {}) => ({
  _id: "r1",
  status: "succeeded",
  modality: "text_image",
  questionVersion: "labels-v1",
  suggestions: [],
  ...extra,
});

describe("RunCard", () => {
  it("shows every fact that is present", () => {
    backend.runs = [
      run({
        provider: "clef",
        model: "clef-1",
        latencyMs: 820,
        costUsd: 0.0012,
      }),
    ];
    render(<RunCard itemId={itemId} enrichmentStatus="succeeded" />);
    expect(screen.getByRole("heading", { name: "Processing" })).toBeTruthy();
    for (const text of [
      "clef",
      "clef-1",
      "Text and image",
      "labels-v1",
      "Succeeded",
      "820 ms",
      "$0.0012",
    ])
      expect(screen.getByText(text)).toBeTruthy();
    expect(backend.paginatedArgs["processingRuns:listForItem"]).toEqual({
      itemId,
    });
  });
  it("omits missing fields and invents none", () => {
    backend.runs = [run()];
    render(<RunCard itemId={itemId} enrichmentStatus="succeeded" />);
    for (const label of ["Provider", "Model", "Error", "Latency", "Cost"])
      expect(screen.queryByText(label)).toBeNull();
  });
  it("shows the error of a failed run", () => {
    backend.runs = [run({ status: "failed", error: "Model timed out" })];
    render(<RunCard itemId={itemId} enrichmentStatus="failed" />);
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("Model timed out")).toBeTruthy();
  });
  it("falls back to the status line without a run", () => {
    render(<RunCard itemId={itemId} enrichmentStatus="not_started" />);
    expect(screen.getByText("Saved — original stored")).toBeTruthy();
  });
  it("shows labels asked, with the total when some were left out", () => {
    backend.runs = [run({ labelsAsked: 64, labelsTotal: 70 })];
    const { unmount } = render(
      <RunCard itemId={itemId} enrichmentStatus="succeeded" />,
    );
    expect(screen.getByText("Labels asked")).toBeTruthy();
    expect(screen.getByText("64 of 70")).toBeTruthy();
    unmount();
    backend.runs = [run({ labelsAsked: 5, labelsTotal: 5 })];
    render(<RunCard itemId={itemId} enrichmentStatus="succeeded" />);
    expect(screen.getByText("5")).toBeTruthy();
  });
  it("renders the pending, failed and succeeded decision states with Classify", () => {
    backend.runs = [run({ kind: "decision", status: "pending" })];
    const { unmount } = render(
      <RunCard itemId={itemId} enrichmentStatus="succeeded" />,
    );
    expect(screen.getByText("Processing", { selector: "dd" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Classifying…" })).toBeTruthy();
    unmount();
    backend.runs = [
      run({
        kind: "decision",
        status: "failed",
        error: "Provider returned HTTP 500",
      }),
    ];
    render(<RunCard itemId={itemId} enrichmentStatus="succeeded" />);
    expect(screen.getByText("Provider returned HTTP 500")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Classify" })).toBeTruthy();
  });
});
