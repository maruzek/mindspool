// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { readVisualBody, rasterContentType } from "./visualCaptureUpload";
import { decodeRaster } from "./visualImageDecode";
import { VISUAL_LIMITS } from "../../schema/src/visualCapture";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { modules } from "./test.setup";
import type { GenericDatabaseWriter, SystemDataModel } from "convex/server";

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
  it("rejects APNG animation control even when the native loader exposes only its PNG fallback", async () => {
    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    const chunk = Buffer.alloc(20);
    chunk.writeUInt32BE(8);
    chunk.write("acTL", 4);
    chunk.writeUInt32BE(2, 8);
    let crc = 0xffffffff;
    for (const byte of chunk.subarray(4, 16)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 16);
    await expect(
      decodeRaster(
        Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]),
      ),
    ).rejects.toThrow("invalid_image");
  });
  it("authenticates the HTTP boundary and bounds bytes before decode", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    const { captureId } = await alice.mutation(api.visualCaptures.begin, {
      context: {
        captureKey: "visual:61363ee8-23cc-4cb6-b827-9c39c694af38",
        kind: "viewport",
        pageUrl: "https://example.com",
        capturedAt: 1000,
      },
    });
    const path = `/visual-captures/upload?captureId=${captureId}`;
    expect((await t.fetch(path, { method: "POST", body: "x" })).status).toBe(
      401,
    );
    expect(
      (
        await t
          .withIdentity({ subject: "bob" })
          .fetch(path, { method: "POST", body: "x" })
      ).status,
    ).toBe(404);
    expect(
      (
        await alice.fetch(path, {
          method: "POST",
          body: new Uint8Array(VISUAL_LIMITS.bytes + 1),
        })
      ).status,
    ).toBe(413);
    const png = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    expect(
      (
        await alice.fetch(path, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: new Uint8Array(png),
        })
      ).status,
    ).toBe(415);
  });
  it.each([
    ["png", "none"],
    ["jpeg", "none"],
    ["webp", "none"],
    ["webp", "nonce"],
    ["webp", "digest"],
  ] as const)(
    "verifies %s with Node-normalized MIME parameters, mismatch: %s",
    async (format, mismatch) => {
      const t = convexTest(schema, modules);
      const alice = t.withIdentity({ subject: "alice" });
      const { captureId } = await alice.mutation(api.visualCaptures.begin, {
        context: {
          captureKey: "visual:61363ee8-23cc-4cb6-b827-9c39c694af38",
          kind: "viewport",
          pageUrl: "https://example.com",
          capturedAt: 1000,
        },
      });
      const bytes = await sharp({
        create: { width: 31, height: 23, channels: 3, background: "red" },
      })
        .toFormat(format)
        .toBuffer();
      const decoded = await decodeRaster(bytes);
      const attempt = await alice.mutation(
        internal.visualCaptureState.claimUpload,
        {
          captureId,
          digest: mismatch === "digest" ? "a".repeat(64) : decoded.digest,
        },
      );
      const contentType = `image/${format}; mindspool-attempt=${attempt.nonce}`;
      // Node's fetch/Response.blob() removes optional MIME whitespace. Convex's
      // system metadata still retains the original header from storage.store().
      const header =
        mismatch === "nonce"
          ? contentType.replace(attempt.nonce, crypto.randomUUID())
          : contentType;
      const nodeBlob = await new Response(new Uint8Array(bytes), {
        headers: { "Content-Type": header },
      }).blob();
      expect(nodeBlob.type).toBe(header.replace("; ", ";"));
      const storageId = await t.run((ctx) => ctx.storage.store(nodeBlob));
      // convex-test 0.0.60 omits Blob.type in storeBlob's metadata. Match the real
      // platform behavior already proven by Task 0 without relaxing production checks.
      await t.run((ctx) =>
        (ctx.db as unknown as GenericDatabaseWriter<SystemDataModel>).patch(
          storageId,
          { contentType },
        ),
      );
      await expect(
        t
          .withIdentity({ subject: "bob" })
          .mutation(internal.visualCaptureState.registerStaged, {
            captureId,
            attemptId: attempt.attemptId,
            storageId,
          }),
      ).rejects.toThrow("Not found");
      await alice.mutation(internal.visualCaptureState.registerStaged, {
        captureId,
        attemptId: attempt.attemptId,
        storageId,
      });
      if (mismatch !== "none") {
        await expect(
          alice.action(internal.visualImageDecode.verify, {
            captureId,
            attemptId: attempt.attemptId,
          }),
        ).rejects.toThrow("Invalid image");
        expect(
          (await alice.query(api.visualCaptures.status, { captureId })).state,
        ).toBe("uploading");
        return;
      }
      await alice.action(internal.visualImageDecode.verify, {
        captureId,
        attemptId: attempt.attemptId,
      });
      expect(
        (await alice.query(api.visualCaptures.status, { captureId })).state,
      ).toBe("verified");
      await alice.mutation(api.visualCaptures.cancel, { captureId });
      await expect(
        alice.action(internal.visualImageDecode.verify, {
          captureId,
          attemptId: attempt.attemptId,
        }),
      ).rejects.toThrow("Capture is closed");
    },
  );
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
