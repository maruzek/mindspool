import { describe, expect, it, vi } from "vitest";
import { createVisualCapture, type CaptureDependencies } from "./visualCapture";

function setup(overrides: Partial<CaptureDependencies> = {}) {
  const saved: string[] = [];
  const dependencies: CaptureDependencies = {
    getToken: async () => "token",
    page: async () => ({
      tabId: 1,
      windowId: 2,
      documentId: "doc",
      pageUrl: "https://example.com/#pricing",
      width: 1000,
      height: 700,
      dpr: 1,
      title: "Pricing",
    }),
    screenshot: async () => "data:image/png;base64,pixels",
    process: async () => ({
      dataUrl: "data:image/webp;base64,encoded",
      width: 1000,
      height: 700,
      bytes: 100,
      contentType: "image/webp",
    }),
    begin: async () => ({ captureId: "capture", state: "pending" }),
    upload: async () => {},
    finalize: async () => {
      saved.push("item");
      return "item";
    },
    changed: async () => {},
    ...overrides,
  };
  return { controller: createVisualCapture(dependencies), saved, dependencies };
}
describe("background visual operation", () => {
  it("saves independently of the launcher, coalesces active starts, and makes a fresh intent after success", async () => {
    const { controller, saved } = setup();
    const first = controller.start("viewport");
    expect(controller.start("viewport")).toEqual(first);
    await vi.waitFor(() => expect(controller.status().state).toBe("saved"));
    expect(saved).toEqual(["item"]);
    expect(controller.status()).toMatchObject({
      captureKey: first.captureKey,
      itemId: "item",
    });
    expect(controller.start("viewport").captureKey).not.toBe(first.captureKey);
    await vi.waitFor(() => expect(controller.status().state).toBe("saved"));
  });
  it.each(["signed_out", "page_changed", "too_large"])(
    "does not save when capture fails with %s",
    async (reason) => {
      const { controller, saved } = setup(
        reason === "signed_out"
          ? { getToken: async () => null }
          : reason === "page_changed"
            ? {
                screenshot: async () => {
                  throw new Error(reason);
                },
              }
            : {
                process: async () => {
                  throw new Error(reason);
                },
              },
      );
      controller.start("viewport");
      await vi.waitFor(() =>
        expect(controller.status()).toMatchObject({
          state: "failed",
          error: reason,
        }),
      );
      expect(saved).toEqual([]);
    },
  );
  it("keeps the same capture key on a network failure and reports a typed error", async () => {
    const { controller } = setup({
      upload: async () => {
        throw new Error("network");
      },
    });
    const intent = controller.start("viewport");
    await vi.waitFor(() =>
      expect(controller.status()).toMatchObject({
        state: "failed",
        captureKey: intent.captureKey,
        error: "network",
      }),
    );
  });
});
