import { describe, expect, it } from "vitest";
import { savedLine } from "./savedLine";

const NOW = new Date(2026, 9, 7, 12, 0, 0).getTime();
const at = (ms: number, captureSource: "web" | "mobile" | "extension") => ({
  _creationTime: NOW - ms,
  captureSource,
});

describe("savedLine", () => {
  it("reads relative times with the capture source", () => {
    expect(savedLine(at(4 * 60_000, "extension"), NOW)).toBe(
      "Saved 4m ago from browser extension",
    );
    expect(savedLine(at(2 * 3_600_000, "mobile"), NOW)).toBe(
      "Saved 2h ago from mobile app",
    );
    expect(savedLine(at(1000, "web"), NOW)).toBe("Saved just now from web");
  });
  it("switches to a short date after seven days", () => {
    expect(savedLine(at(10 * 86_400_000, "web"), NOW)).toBe(
      "Saved Sep 27 from web",
    );
  });
});
