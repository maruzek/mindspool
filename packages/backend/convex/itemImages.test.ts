import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const opts = { numItems: 20, cursor: null };
const image = (url: string) => ({
  kind: "external" as const,
  url,
  purpose: "image" as const,
});
const thumb = (url: string) => ({
  kind: "external" as const,
  url,
  purpose: "thumbnail" as const,
});

async function setup(imageAssets: Doc<"items">["imageAssets"]) {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const id = await alice.mutation(api.items.create, {
    originalInput: "a note",
    inputType: "text",
    captureSource: "web",
    captureKey: "k",
    imageAssets,
  });
  const preview = async () =>
    (await alice.query(api.items.list, { paginationOpts: opts })).page.find(
      (i) => i._id === id,
    );
  const detail = () => alice.query(api.items.detail, { id });
  return { t, alice, id, preview, detail };
}

describe("item images", () => {
  it("shows the first clip image and the gallery size", async () => {
    const { preview, detail } = await setup([
      image("https://a.test/1.jpg"),
      image("https://a.test/2.jpg"),
    ]);
    expect(await preview()).toMatchObject({
      thumbnailUrl: "https://a.test/1.jpg",
      imageCount: 2,
    });
    expect((await detail())?.images).toEqual([
      "https://a.test/1.jpg",
      "https://a.test/2.jpg",
    ]);
  });

  it("falls back to the page thumbnail only when the clip has no images", async () => {
    const only = await setup([thumb("https://a.test/og.png")]);
    expect(await only.preview()).toMatchObject({
      thumbnailUrl: "https://a.test/og.png",
      imageCount: 1,
    });
    const both = await setup([
      thumb("https://a.test/og.png"),
      image("https://a.test/clip.jpg"),
    ]);
    expect(await both.preview()).toMatchObject({
      thumbnailUrl: "https://a.test/clip.jpg",
      imageCount: 1,
    });
    expect((await both.detail())?.images).toEqual(["https://a.test/clip.jpg"]);
  });

  it("sets no image fields for items without images", async () => {
    const { preview, detail } = await setup([]);
    const row = await preview();
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("thumbnailUrl");
    expect(row).not.toHaveProperty("imageCount");
    expect(await detail()).not.toHaveProperty("images");
  });

  it("resolves stored assets and never returns unsafe URLs", async () => {
    const { t, id, preview, detail } = await setup([]);
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["img"])),
    );
    await t.run((ctx) =>
      ctx.db.patch(id as Id<"items">, {
        imageAssets: [
          image("javascript:alert(1)"),
          image("data:image/png;base64,AAAA"),
          { kind: "stored", storageId, purpose: "image" },
        ],
      }),
    );
    const urls = (await detail())?.images ?? [];
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/^https?:\/\//);
    expect((await preview())?.imageCount).toBe(1);
  });

  it("caps the gallery at ten", async () => {
    const { t, id, detail, preview } = await setup([]);
    await t.run((ctx) =>
      ctx.db.patch(id as Id<"items">, {
        imageAssets: Array.from({ length: 14 }, (_, i) =>
          image(`https://a.test/${i}.jpg`),
        ),
      }),
    );
    expect((await detail())?.images).toHaveLength(10);
    expect((await preview())?.imageCount).toBe(10);
  });
});
