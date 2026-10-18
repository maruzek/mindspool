import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { previewItem } from "./boardPreviews";

it("returns owned visual context and primary stored pixels without changing legacy projections", async () => {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const itemId = await alice.mutation(api.items.create, {
    originalInput: "https://example.com/#pricing",
    inputType: "url",
    captureKey: "legacy",
    captureSource: "extension",
  });
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["pixels"])),
  );
  const visualCapture = {
    captureKey: "visual:61363ee8-23cc-4cb6-b827-9c39c694af38",
    kind: "full-page" as const,
    pageUrl: "https://example.com/#pricing",
    capturedAt: 1000,
    width: 1000,
    height: 2100,
    contentType: "image/webp" as const,
  };
  expect(
    (await alice.query(api.items.detail, { id: itemId }))?.visualCapture,
  ).toBeUndefined();
  await t.run((ctx) =>
    ctx.db.patch(itemId, {
      visualCapture,
      imageAssets: [
        { kind: "stored", storageId, purpose: "screenshot" },
        {
          kind: "external",
          url: "https://example.com/generic.png",
          purpose: "thumbnail",
        },
      ],
    }),
  );
  const detail = await alice.query(api.items.detail, { id: itemId });
  expect(detail?.visualCapture).toEqual(visualCapture);
  expect(detail?.images).toHaveLength(1);
  expect(detail?.images?.[0]).not.toContain("generic");
  expect(
    await t
      .withIdentity({ subject: "bob" })
      .query(api.items.detail, { id: itemId }),
  ).toBeNull();
  const preview = await t.run(async (ctx) =>
    previewItem(ctx, (await ctx.db.get(itemId))!),
  );
  expect(preview.visualCapture).toEqual({
    kind: "full-page",
    width: 1000,
    height: 2100,
  });
  const list = await alice.query(api.items.list, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(list.page[0]?.visualCapture).toEqual(preview.visualCapture);
});
