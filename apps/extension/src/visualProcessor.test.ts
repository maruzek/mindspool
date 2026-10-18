import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProcessorRequest } from "./visualCapture";

const state = vi.hoisted(() => ({
  listener: undefined as ((...args: unknown[]) => unknown) | undefined,
}));
const runtime = vi.hoisted(() => ({
  id: "test-extension",
  getURL: (path: string) => `chrome-extension://test-extension${path}`,
  onMessage: {
    addListener: (listener: (...args: unknown[]) => unknown) => {
      state.listener = listener;
    },
  },
}));
vi.mock("wxt/browser", () => ({ browser: { runtime } }));
import "./visualProcessor";

function screenshot(width = 1000, height = 700) {
  const header = new Uint8Array(24);
  const view = new DataView(header.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return `data:image/png;base64,${btoa(String.fromCharCode(...header))}`;
}
const encode = vi.fn();
beforeEach(() => {
  encode.mockReset();
  encode.mockReturnValue(new Blob(["encoded pixels"], { type: "image/webp" }));
  vi.stubGlobal("fetch", async () => ({ blob: async () => new Blob() }));
  vi.stubGlobal("createImageBitmap", async () => ({
    width: 1000,
    height: 700,
    close() {},
  }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage() {},
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback,
    _type,
    quality,
  ) {
    callback(encode(this.width, this.height, quality));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function process(request: Partial<ProcessorRequest> = {}) {
  return state.listener!(
    {
      target: "visual-processor",
      captureKey: "test",
      dataUrl: screenshot(),
      cssWidth: 1000,
      cssHeight: 700,
      ...request,
    },
    { id: runtime.id, url: runtime.getURL("/processor.html") },
  );
}

it.each([
  ["80% zoom", 1250, 875],
  ["rounded CSS height", 1000, 701],
  ["125% zoom", 800, 560],
  ["200% zoom", 500, 350],
])(
  "encodes the available screenshot pixels at %s",
  async (_, cssWidth, cssHeight) => {
    expect(await process({ cssWidth, cssHeight })).toMatchObject({
      ok: true,
      visual: { width: 1000, height: 700, contentType: "image/webp" },
    });
  },
);

it("encodes a selected area at 80% without requiring upsampling", async () => {
  expect(
    await process({
      cssWidth: 1250,
      cssHeight: 875,
      crop: { left: 125, top: 125, width: 500, height: 250 },
    }),
  ).toMatchObject({ ok: true, visual: { width: 400, height: 200 } });
});

it("reduces a dense high-DPI screenshot to fit the upload cap", async () => {
  encode.mockImplementation(
    (width: number) =>
      new Blob([new Uint8Array(width > 850 ? 2_097_153 : 2_097_152)], {
        type: "image/webp",
      }),
  );
  expect(await process({ cssWidth: 500, cssHeight: 350 })).toMatchObject({
    ok: true,
    visual: { width: 850, height: 595, bytes: 2_097_152 },
  });
});

it("rejects output over the cap rather than downscaling below native CSS resolution", async () => {
  encode.mockReturnValue(
    new Blob([new Uint8Array(2_097_153)], { type: "image/webp" }),
  );
  expect(await process()).toEqual({ ok: false, reason: "too_large" });
});
