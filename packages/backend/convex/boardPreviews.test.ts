import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
it("returns bounded first-media previews only for current placements", async () => {
  const a = convexTest(schema, modules).withIdentity({ subject: "alice" });
  const labelId = await a.mutation(api.labels.create, { name: "Images" });
  const board = await a.mutation(api.boards.open, { labelId });
  const itemId = await a.mutation(api.items.create, {
    inputType: "text",
    originalInput: "Long ".repeat(10000),
    captureKey: "media",
    captureSource: "web",
    imageAssets: [
      {
        kind: "external",
        url: "https://example.com/one.png",
        purpose: "image",
      },
      {
        kind: "external",
        url: "https://example.com/two.png",
        purpose: "image",
      },
    ],
  });
  await a.mutation(api.boardOperations.apply, {
    boardId: board._id,
    expectedRevision: 0,
    session: "one",
    sequence: 1,
    operations: [{ type: "place", key: "image", itemId, x: 0, y: 0 }],
  });
  const previews = await a.query(api.boardPreviews.placed, {
    boardId: board._id,
    keys: ["image"],
  });
  expect(previews[0]).toMatchObject({
    itemId,
    imageUrl: "https://example.com/one.png",
    originalUrl: null,
    hasText: true,
  });
  expect(previews[0]!.body.length).toBeLessThanOrEqual(1000);
  await a.mutation(api.itemLabels.remove, { itemId, labelId });
  expect(
    await a.query(api.boardPreviews.placed, {
      boardId: board._id,
      keys: ["image"],
    }),
  ).toEqual([]);
  await expect(
    a.query(api.boardPreviews.placed, {
      boardId: board._id,
      keys: Array.from({ length: 21 }, (_, i) => `${i}`),
    }),
  ).rejects.toThrow("batch");
});

it("exposes original links and distinguishes image-only items from URL fallback text", async () => {
  const a = convexTest(schema, modules).withIdentity({ subject: "alice" });
  const labelId = await a.mutation(api.labels.create, { name: "Images" });
  const board = await a.mutation(api.boards.open, { labelId });
  const itemId = await a.mutation(api.items.create, {
    inputType: "url",
    originalInput: "https://example.com/image",
    captureKey: "image-only",
    captureSource: "web",
    imageAssets: [
      {
        kind: "external",
        url: "https://example.com/image.png",
        purpose: "image",
      },
    ],
  });
  await a.mutation(api.boardOperations.apply, {
    boardId: board._id,
    expectedRevision: 0,
    session: "one",
    sequence: 1,
    operations: [{ type: "place", key: "image", itemId, x: 0, y: 0 }],
  });
  const [preview] = await a.query(api.boardPreviews.placed, {
    boardId: board._id,
    keys: ["image"],
  });
  expect(preview).toMatchObject({
    originalUrl: "https://example.com/image",
    hasText: false,
  });
});
