import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import type { GenericDatabaseWriter, SystemDataModel } from "convex/server";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

it("wraps bounded storage scans, reclaims crash and late writes, and retains unrelated and completed files", async () => {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  async function capture() {
    const { captureId } = await alice.mutation(api.visualCaptures.begin, {
      context: {
        captureKey: `visual:${crypto.randomUUID()}`,
        kind: "viewport",
        pageUrl: "https://example.com",
        capturedAt: 1000,
      },
    });
    const attempt = await alice.mutation(
      internal.visualCaptureState.claimUpload,
      { captureId, digest: "a".repeat(64) },
    );
    return { captureId, ...attempt };
  }
  async function file(nonce?: string) {
    const type = nonce ? `image/png; mindspool-attempt=${nonce}` : "image/png";
    const id = await t.run((ctx) =>
      ctx.storage.store(new Blob(["fixture"], { type })),
    );
    await t.run((ctx) =>
      (ctx.db as unknown as GenericDatabaseWriter<SystemDataModel>).patch(id, {
        contentType: type,
      }),
    );
    return id;
  }
  const abandoned = await capture();
  const orphan = await file(abandoned.nonce); // crash before registration
  const completed = await capture();
  const attached = await file(completed.nonce);
  await t.run(async (ctx) => {
    await ctx.db.patch(abandoned.captureId, { expiresAt: Date.now() - 1 });
    await ctx.db.patch(completed.captureId, {
      state: "complete",
      storageId: attached,
    });
    await ctx.db.patch(completed.attemptId, {
      state: "attached",
      storageId: attached,
    });
  });
  const legacy = await file();
  const foreign = await file(crypto.randomUUID());
  for (let n = 0; n < 52; n++) await file();
  const first = await t.mutation(internal.visualCaptureMaintenance.run, {});
  expect(first.scanned).toBe(50);
  expect(
    (
      await alice.query(api.visualCaptures.status, {
        captureId: abandoned.captureId,
      })
    ).state,
  ).toBe("expired");
  const late = await file(abandoned.nonce); // write after expiry and cursor advancement
  for (let n = 0; n < 4; n++)
    await t.mutation(internal.visualCaptureMaintenance.run, {});
  for (const id of [orphan, late])
    expect(await t.run((ctx) => ctx.db.system.get(id))).toBeNull();
  for (const id of [attached, legacy, foreign])
    expect(await t.run((ctx) => ctx.db.system.get(id))).not.toBeNull();
});
