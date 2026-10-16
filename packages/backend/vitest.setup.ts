import { beforeEach, vi } from "vitest";

// Saving a link schedules a page fetch; no test may reach the network.
beforeEach(() => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("Network disabled")));
});
