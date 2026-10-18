import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import type { GenericDatabaseWriter, SystemDataModel } from "convex/server";

const context = {
  captureKey: "visual:61363ee8-23cc-4cb6-b827-9c39c694af38",
  kind: "viewport" as const,
  pageUrl: "https://example.com/#pricing",
  capturedAt: 1000,
};
function setup() {
  const t = convexTest(schema, modules);
  return {
    t,
    alice: t.withIdentity({ subject: "alice" }),
    bob: t.withIdentity({ subject: "bob" }),
  };
}
describe("owned visual sessions", () => {
  it("finalizes only a verified owned file, replays once, and never places a board card", async () => {
    const { t, alice, bob } = setup();
    const { captureId } = await alice.mutation(api.visualCaptures.begin, {
      context,
    });
    await expect(
      alice.mutation(api.visualCaptures.finalize, { captureId }),
    ).rejects.toThrow("Image not verified");
    const attempt = await alice.mutation(
      internal.visualCaptureState.claimUpload,
      { captureId, digest: "a".repeat(64) },
    );
    const type = `image/png; mindspool-attempt=${attempt.nonce}`;
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["verified fixture"], { type })),
    );
    await t.run((ctx) =>
      (ctx.db as unknown as GenericDatabaseWriter<SystemDataModel>).patch(
        storageId,
        { contentType: type },
      ),
    );
    await alice.mutation(internal.visualCaptureState.registerStaged, {
      captureId,
      attemptId: attempt.attemptId,
      storageId,
    });
    await alice.mutation(internal.visualCaptureState.recordVerified, {
      captureId,
      attemptId: attempt.attemptId,
      digest: "a".repeat(64),
      width: 1200,
      height: 800,
      bytes: 16,
      contentType: "image/png",
    });
    await expect(
      bob.mutation(api.visualCaptures.finalize, { captureId }),
    ).rejects.toThrow("Not found");
    const saved = await alice.mutation(api.visualCaptures.finalize, {
      captureId,
    });
    expect(
      await alice.mutation(api.visualCaptures.finalize, { captureId }),
    ).toEqual(saved);
    const item = await t.run((ctx) => ctx.db.get(saved.itemId));
    expect(item).toMatchObject({
      originalUrl: context.pageUrl,
      visualCapture: { kind: "viewport", width: 1200, height: 800 },
      imageAssets: [{ kind: "stored", storageId, purpose: "screenshot" }],
    });
    expect(await t.run((ctx) => ctx.db.query("boardElements").take(1))).toEqual(
      [],
    );
    await alice.mutation(api.items.remove, { id: saved.itemId });
    expect(
      await alice.mutation(api.visualCaptures.finalize, { captureId }),
    ).toEqual(saved);
    expect(await t.run((ctx) => ctx.db.get(saved.itemId))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
  });
  it("replays an intent, rejects changed context, and separates owners", async () => {
    const { alice, bob } = setup();
    const first = await alice.mutation(api.visualCaptures.begin, { context });
    const retry = await alice.mutation(api.visualCaptures.begin, {
      context: { ...context },
    });
    expect(retry).toEqual(first);
    await expect(
      alice.mutation(api.visualCaptures.begin, {
        context: { ...context, pageUrl: "https://different.example/" },
      }),
    ).rejects.toThrow("Capture key already used");
    expect(
      (await bob.mutation(api.visualCaptures.begin, { context })).captureId,
    ).not.toEqual(first.captureId);
    await expect(
      bob.query(api.visualCaptures.status, { captureId: first.captureId }),
    ).rejects.toThrow("Not found");
  });
  it("requires auth and rejects unsafe metadata", async () => {
    const { t, alice } = setup();
    await expect(
      t.mutation(api.visualCaptures.begin, { context }),
    ).rejects.toThrow("Authentication required");
    await expect(
      alice.mutation(api.visualCaptures.begin, {
        context: { ...context, pageUrl: "javascript:alert(1)" },
      }),
    ).rejects.toThrow("Invalid capture");
    await expect(
      alice.mutation(api.visualCaptures.begin, {
        context: { ...context, sourceMetadata: { title: "a".repeat(301) } },
      }),
    ).rejects.toThrow("Invalid capture");
  });
  it("serializes upload leases and pins the payload digest across retries", async () => {
    const { t, alice } = setup();
    const { captureId } = await alice.mutation(api.visualCaptures.begin, {
      context,
    });
    const args = { captureId, digest: "a".repeat(64) };
    const lease = await alice.mutation(
      internal.visualCaptureState.claimUpload,
      args,
    );
    await expect(
      alice.mutation(internal.visualCaptureState.claimUpload, args),
    ).rejects.toThrow("Upload in progress");
    await t.run(async (ctx) => {
      await ctx.db.patch(lease.attemptId, { expiresAt: Date.now() - 1 });
    });
    const retry = await alice.mutation(
      internal.visualCaptureState.claimUpload,
      args,
    );
    expect(retry.attemptId).not.toEqual(lease.attemptId);
    expect((await t.run((ctx) => ctx.db.get(lease.attemptId)))?.state).toBe(
      "closed",
    );
    await expect(
      alice.mutation(internal.visualCaptureState.claimUpload, {
        ...args,
        digest: "b".repeat(64),
      }),
    ).rejects.toThrow("Capture payload changed");
  });
  it("cancel closes the attempt and prevents upload and foreign cancellation", async () => {
    const { t, alice, bob } = setup();
    const { captureId } = await alice.mutation(api.visualCaptures.begin, {
      context,
    });
    const lease = await alice.mutation(
      internal.visualCaptureState.claimUpload,
      { captureId, digest: "a".repeat(64) },
    );
    await expect(
      bob.mutation(api.visualCaptures.cancel, { captureId }),
    ).rejects.toThrow("Not found");
    expect(
      (await alice.mutation(api.visualCaptures.cancel, { captureId })).state,
    ).toBe("cancelled");
    expect((await t.run((ctx) => ctx.db.get(lease.attemptId)))?.state).toBe(
      "closed",
    );
    await expect(
      alice.mutation(internal.visualCaptureState.claimUpload, {
        captureId,
        digest: "a".repeat(64),
      }),
    ).rejects.toThrow("Capture is closed");
  });
  it("never reopens a completed receipt after the item was deleted", async () => {
    const { t, alice } = setup();
    const { captureId } = await alice.mutation(api.visualCaptures.begin, {
      context,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(captureId, { state: "complete" });
    });
    expect(
      (await alice.mutation(api.visualCaptures.cancel, { captureId })).state,
    ).toBe("complete");
    expect(
      (await alice.mutation(api.visualCaptures.begin, { context })).state,
    ).toBe("complete");
  });
  it("refuses expired sessions before maintenance runs", async () => {
    const { t, alice } = setup();
    const { captureId } = await alice.mutation(api.visualCaptures.begin, {
      context,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(captureId, { expiresAt: Date.now() - 1 });
    });
    await expect(
      alice.mutation(internal.visualCaptureState.claimUpload, {
        captureId,
        digest: "a".repeat(64),
      }),
    ).rejects.toThrow("Capture is closed");
  });
});
