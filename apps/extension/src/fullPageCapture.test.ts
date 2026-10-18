import { expect, it } from "vitest";
import {
  captureFullPage,
  planTiles,
  type FullPageCommand,
} from "./fullPageCapture";

it("plans real final offsets without duplicate bottom tiles and bounds output", () => {
  expect(planTiles(1000, 2100, 1305, 1)).toEqual([0, 795]);
  expect(planTiles(1000, 500, 700, 1)).toEqual([0]);
  expect(() => planTiles(2000, 20000, 700, 1)).toThrow("too_large");
  expect(() => planTiles(100, 32000, 500, 1)).toThrow("too_large");
  expect(() => planTiles(2000, 4000, 700, 2)).toThrow("too_large");
});
function setup(fail = false, growing = false) {
  let y = 0,
    restored = false,
    shots = 0,
    height = 2100;
  const page = {
    tabId: 1,
    windowId: 2,
    documentId: "doc",
    pageUrl: "https://example.com",
    title: "Fixture",
    width: 1000,
    height: 700,
    dpr: 1,
  };
  return {
    page,
    state: () => ({ restored, shots }),
    deps: {
      control: async (command: FullPageCommand) => {
        if (command.type === "restore") restored = true;
        if (command.type === "scroll") {
          y = Math.min(command.y ?? 0, height - 700);
          if (growing && y > 0) height += 700;
        }
        return {
          width: 1000,
          height,
          viewportHeight: 700,
          dpr: 1,
          y,
          documentId: "doc",
        };
      },
      screenshot: async () => {
        shots++;
        if (fail) throw new Error("page_changed");
        return "data:image/png;base64,tile";
      },
    },
  };
}
it("captures the complete finite extent and restores on success", async () => {
  const { page, deps, state } = setup();
  const result = await captureFullPage(page, "capture", deps);
  expect(result.tiles.map((tile) => tile.y)).toEqual([0, 700, 1400]);
  expect(result.cssHeight).toBe(2100);
  expect(state()).toEqual({ restored: true, shots: 3 });
});
it("restores on failure and refuses infinite extent growth", async () => {
  const failed = setup(true);
  await expect(
    captureFullPage(failed.page, "capture", failed.deps),
  ).rejects.toThrow("page_changed");
  expect(failed.state().restored).toBe(true);
  const growing = setup(false, true);
  await expect(
    captureFullPage(growing.page, "capture", growing.deps),
  ).rejects.toThrow();
  expect(growing.state()).toEqual({ restored: true, shots: 0 });
});
