// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { readVisualBody, rasterContentType } from "./visualCaptureUpload";
import { decodeRaster } from "./visualImageDecode";
import { VISUAL_LIMITS } from "../../schema/src/visualCapture";

function streamed(bytes: number, claimedLength?: string) {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
  return new Request("https://example.com/upload", {
    method: "POST",
    body,
    ...(claimedLength ? { headers: { "Content-Length": claimedLength } } : {}),
    ...{ duplex: "half" },
  });
}
describe("bounded raster ingestion", () => {
  it("accepts exactly 2 MiB and refuses one extra byte regardless of Content-Length", async () => {
    expect(
      (await readVisualBody(streamed(VISUAL_LIMITS.bytes))).byteLength,
    ).toBe(VISUAL_LIMITS.bytes);
    await expect(
      readVisualBody(streamed(VISUAL_LIMITS.bytes + 1, "1")),
    ).rejects.toThrow("too_large");
    await expect(
      readVisualBody(streamed(VISUAL_LIMITS.bytes + 1)),
    ).rejects.toThrow("too_large");
  });
  it.each(["png", "jpeg", "webp"] as const)(
    "fully decodes %s and derives actual dimensions",
    async (format) => {
      const bytes = await sharp({
        create: { width: 31, height: 23, channels: 4, background: "red" },
      })
        .toFormat(format)
        .toBuffer();
      expect(rasterContentType(bytes)).toBe(`image/${format}`);
      expect(await decodeRaster(bytes)).toMatchObject({
        width: 31,
        height: 23,
        contentType: `image/${format}`,
        bytes: bytes.length,
      });
    },
  );
  it("rejects disguised SVG, truncated PNG, and decoded pixel bombs", async () => {
    await expect(
      decodeRaster(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
        ),
      ),
    ).rejects.toThrow();
    const png = await sharp({
      create: { width: 32, height: 24, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await expect(
      decodeRaster(png.subarray(0, png.length - 20)),
    ).rejects.toThrow();
    const huge = await sharp({
      create: { width: 4000, height: 6001, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await expect(decodeRaster(huge)).rejects.toThrow();
  });
});
