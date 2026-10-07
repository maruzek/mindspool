import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAILY_NEURON_LIMIT,
  nextResetAt,
  parseDailyLimit,
  utcDay,
} from "./aiBudget";

describe("parseDailyLimit", () => {
  it("uses a positive number", () => {
    expect(parseDailyLimit("20")).toBe(20);
    expect(parseDailyLimit(" 500 ")).toBe(500);
  });
  it("falls back to the default for anything unusable", () => {
    for (const raw of [
      undefined,
      "",
      "  ",
      "abc",
      "0",
      "-5",
      "NaN",
      "Infinity",
    ])
      expect(parseDailyLimit(raw)).toBe(DEFAULT_DAILY_NEURON_LIMIT);
    expect(DEFAULT_DAILY_NEURON_LIMIT).toBe(9000);
  });
});

describe("utcDay", () => {
  it("rolls over exactly at 00:00 UTC", () => {
    expect(utcDay(Date.UTC(2026, 9, 7, 23, 59, 59, 999))).toBe("2026-10-07");
    expect(utcDay(Date.UTC(2026, 9, 8, 0, 0, 0, 0))).toBe("2026-10-08");
  });
});

describe("nextResetAt", () => {
  it("is the next midnight UTC, strictly after now", () => {
    expect(nextResetAt(Date.UTC(2026, 9, 7, 23, 59, 59, 999))).toBe(
      Date.UTC(2026, 9, 8),
    );
    expect(nextResetAt(Date.UTC(2026, 9, 8, 0, 0, 0, 0))).toBe(
      Date.UTC(2026, 9, 9),
    );
  });
  it("crosses month and year ends", () => {
    expect(nextResetAt(Date.UTC(2026, 0, 31, 12))).toBe(Date.UTC(2026, 1, 1));
    expect(nextResetAt(Date.UTC(2028, 1, 28, 12))).toBe(Date.UTC(2028, 1, 29));
    expect(nextResetAt(Date.UTC(2026, 11, 31, 23, 59, 59, 999))).toBe(
      Date.UTC(2027, 0, 1),
    );
  });
});
