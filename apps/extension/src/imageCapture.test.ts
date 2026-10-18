import { expect, it, vi } from "vitest";
import {
  downloadImage,
  rasterDimensions,
  selectedImageContext,
} from "./imageCapture";

function png(width = 100, height = 80) {
  const bytes = new Uint8Array(32);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
it("bounds source dimensions before browser decoding", () => {
  expect(rasterDimensions(png())).toMatchObject({
    width: 100,
    height: 80,
    contentType: "image/png",
  });
  expect(() => rasterDimensions(png(6000, 6000))).toThrow("too_large");
  expect(() =>
    rasterDimensions(new TextEncoder().encode('<svg width="999999"/>')),
  ).toThrow("image_unavailable");
});
it("fetches without credentials and refuses ungranted redirect origins", async () => {
  const requested: string[] = [];
  await expect(
    downloadImage(
      "https://images.example/image.png",
      async (origin) => origin === "https://images.example",
      async (url, options) => {
        requested.push(String(url));
        expect(options?.credentials).toBe("omit");
        expect(options?.redirect).toBe("manual");
        return new Response(null, {
          status: 302,
          headers: { Location: "https://other.example/image.png" },
        });
      },
    ),
  ).rejects.toThrow("image_unavailable");
  expect(requested).toEqual(["https://images.example/image.png"]);
});
it("refuses oversized streamed sources even when the header lies", async () => {
  await expect(
    downloadImage(
      "https://images.example/image.png",
      async () => true,
      async () =>
        new Response(new Uint8Array(16 * 1024 * 1024 + 1), {
          headers: { "Content-Length": "1" },
        }),
    ),
  ).rejects.toThrow("too_large");
});
it("omits ambiguous local provenance for repeated image URLs", () => {
  document.body.innerHTML =
    '<article><a href="https://design.example"><img src="https://images.example/p.png"></a></article><article><a href="https://other.example"><img src="https://images.example/p.png"></a></article>';
  expect(selectedImageContext("https://images.example/p.png")).toEqual({});
});
it("preserves an unambiguous X post despite profile and attachment links", () => {
  vi.stubGlobal("location", new URL("https://x.com/home"));
  try {
    document.body.innerHTML =
      '<article><a href="https://x.com/designer">Designer</a><a href="https://x.com/designer/status/123">Post</a><a href="https://x.com/designer/status/123/photo/1"><img src="https://images.example/p.png"></a></article>';
    expect(selectedImageContext("https://images.example/p.png").entryUrl).toBe(
      "https://x.com/designer/status/123",
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
