import { describe, expect, it } from "vitest";
import { buildClip, ClipTooLargeError } from "./buildClip";
import type { ResolvedPost } from "./types";

const ref = { id: "20", handle: "jack" };
const post: ResolvedPost = {
  id: "20",
  handle: "jack",
  author: "jack",
  text: "just setting up my twttr",
  images: ["https://pbs.twimg.com/media/a.jpg?name=large"],
};

describe("buildClip", () => {
  it("equals the extension payload for the same post (apart from the source)", () => {
    // apps/extension/src/clip.ts buildClip for { url, id, author, handle, text, images }.
    const extension = {
      originalInput: "https://x.com/jack/status/20",
      inputType: "url",
      captureSource: "extension",
      captureKey: "x:20",
      sourceMetadata: { title: "jack (@jack)", author: "jack", siteName: "X" },
      extractedText: "just setting up my twttr",
      imageAssets: [
        {
          kind: "external",
          url: "https://pbs.twimg.com/media/a.jpg?name=large",
          purpose: "image",
        },
      ],
    };
    expect(buildClip(ref, post)).toEqual({
      args: { ...extension, captureSource: "mobile" },
      linkOnly: false,
    });
  });

  it("builds the URL from the post's handle, not the link's", () => {
    const { args } = buildClip(
      { id: "20", handle: "JACK" },
      { ...post, handle: "jack" },
    );
    expect(args.originalInput).toBe("https://x.com/jack/status/20");
    const viaI = buildClip({ id: "20", handle: "i" }, post);
    expect(viaI.args.originalInput).toBe("https://x.com/jack/status/20");
  });

  it("saves only the link when nothing resolved", () => {
    expect(buildClip(ref, null)).toEqual({
      args: {
        originalInput: "https://x.com/jack/status/20",
        inputType: "url",
        captureSource: "mobile",
        captureKey: "x:20",
        sourceMetadata: { siteName: "X" },
      },
      linkOnly: true,
    });
  });

  it("saves only the link for a post without text or images", () => {
    const result = buildClip(ref, { ...post, text: "", images: [] });
    expect(result.linkOnly).toBe(true);
    expect(result.args.extractedText).toBeUndefined();
    expect(result.args.imageAssets).toBeUndefined();
    expect(result.args.sourceMetadata?.title).toBe("jack (@jack)");
  });

  it("keeps text-only and image-only posts", () => {
    expect(buildClip(ref, { ...post, images: [] }).args.imageAssets).toEqual(
      [],
    );
    expect(buildClip(ref, { ...post, text: "" }).linkOnly).toBe(false);
  });

  it("keeps a long post whole", () => {
    const text = "a".repeat(100_000);
    expect(buildClip(ref, { ...post, text }).args.extractedText).toBe(text);
  });

  it("rejects text over the limit", () => {
    expect(() =>
      buildClip(ref, { ...post, text: "a".repeat(100_001) }),
    ).toThrow(ClipTooLargeError);
  });
});
