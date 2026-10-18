import { expect, it, vi } from "vitest";
import { createVisualCapture, type CaptureDependencies } from "./visualCapture";
import type { RetryCapture, CaptureRecovery } from "./captureRecovery";
import { tokenSubject, encodedBlob } from "./captureRecovery";
const token = (sub: string) =>
  `header.${btoa(JSON.stringify({ sub }))}.signature`;
function setup() {
  let record: RetryCapture | null = null,
    uploads = 0,
    screenshots = 0;
  let remote = "pending";
  const recovery: CaptureRecovery = {
    load: async () => record,
    save: async (value) => {
      record = value;
    },
    remove: async (key) => {
      if (record?.context.captureKey === key) record = null;
    },
  };
  const deps: CaptureDependencies = {
    recovery,
    getToken: async () => token("alice"),
    page: async () => ({
      tabId: 1,
      windowId: 2,
      documentId: "doc",
      pageUrl: "https://example.com",
      title: "Fixture",
      width: 1000,
      height: 700,
      dpr: 1,
    }),
    screenshot: async () => {
      screenshots++;
      return "raw";
    },
    process: async () => ({
      dataUrl: "data:image/png;base64,YWJj",
      width: 1000,
      height: 700,
      contentType: "image/png",
      bytes: 3,
    }),
    begin: async () => ({ captureId: "capture", state: remote }),
    upload: async () => {
      uploads++;
      remote = "verified";
      throw new Error("network");
    },
    finalize: async () => {
      remote = "complete";
      return "item";
    },
    cancelCapture: async () => ({
      state: remote === "complete" ? "complete" : "cancelled",
      ...(remote === "complete" ? { itemId: "item" } : {}),
    }),
    changed: async () => {},
  };
  return { deps, recovery, state: () => ({ record, uploads, screenshots }) };
}
it("reconciles a lost upload response and retries the identical encoded intent once", async () => {
  const { deps, state } = setup();
  const controller = createVisualCapture(deps);
  await controller.ready;
  const intent = controller.start("viewport");
  await vi.waitFor(() =>
    expect(controller.status()).toMatchObject({
      state: "failed",
      retryable: true,
    }),
  );
  controller.retry();
  await vi.waitFor(() =>
    expect(controller.status()).toMatchObject({
      state: "saved",
      itemId: "item",
      captureKey: intent.captureKey,
    }),
  );
  expect(state()).toMatchObject({ record: null, uploads: 1, screenshots: 1 });
});
it("recovers a verified upload after worker restart without capturing new pixels", async () => {
  const { deps, state } = setup();
  const first = createVisualCapture(deps);
  await first.ready;
  first.start("viewport");
  await vi.waitFor(() => expect(first.status().state).toBe("failed"));
  const restarted = createVisualCapture(deps);
  await restarted.ready;
  expect(restarted.status()).toMatchObject({ state: "saved", itemId: "item" });
  expect(state()).toMatchObject({ record: null, uploads: 1, screenshots: 1 });
});
it("does not replay a previous account's cached pixels after sign-in changes", async () => {
  const { deps, state } = setup();
  const first = createVisualCapture(deps);
  await first.ready;
  first.start("viewport");
  await vi.waitFor(() => expect(first.status().state).toBe("failed"));
  const restarted = createVisualCapture({
    ...deps,
    getToken: async () => token("bob"),
  });
  await restarted.ready;
  expect(restarted.status()).toMatchObject({
    state: "failed",
    error: "signed_out",
    retryable: false,
  });
  expect(state().record).toBeNull();
});
it("extracts only account identity and stores encoded bytes without JWTs", () => {
  expect(tokenSubject(token("alice"))).toBe("alice");
  expect(tokenSubject("invalid")).toBeUndefined();
  expect(
    encodedBlob({
      dataUrl: "data:image/png;base64,YWJj",
      width: 1,
      height: 1,
      contentType: "image/png",
      bytes: 3,
    }).size,
  ).toBe(3);
});
it("cancels a staged retry without finalizing or leaving cached bytes", async () => {
  const { deps, state } = setup();
  const controller = createVisualCapture(deps);
  await controller.ready;
  controller.start("viewport");
  await vi.waitFor(() => expect(controller.status().state).toBe("failed"));
  controller.cancel();
  await vi.waitFor(() => expect(controller.status().state).toBe("cancelled"));
  expect(state().record).toBeNull();
  expect(state().uploads).toBe(1);
});
it("reports saved when cancellation races a committed finalize whose response was lost", async () => {
  const { deps, state } = setup();
  let finalizing = false;
  let release!: () => void;
  deps.upload = async () => {};
  deps.finalize = async () => {
    finalizing = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    throw new Error("network");
  };
  deps.cancelCapture = async () => ({ state: "complete", itemId: "item" });
  const controller = createVisualCapture(deps);
  await controller.ready;
  controller.start("viewport");
  await vi.waitFor(() => expect(finalizing).toBe(true));
  controller.cancel();
  release();
  await vi.waitFor(() =>
    expect(controller.status()).toMatchObject({
      state: "saved",
      itemId: "item",
    }),
  );
  expect(state().record).toBeNull();
});
