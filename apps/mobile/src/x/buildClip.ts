import type { FunctionArgs } from "convex/server";
import type { api } from "@mindspool/backend/api";
import type { ResolvedPost, ShareRef } from "./types";

export type ClipArgs = FunctionArgs<typeof api.items.create>;

export type ClipResult = { args: ClipArgs; linkOnly: boolean };

const TEXT_LIMIT = 100_000;
const TITLE_LIMIT = 300;

export class ClipTooLargeError extends Error {
  constructor() {
    super("This capture is too large to save");
    this.name = "ClipTooLargeError";
  }
}

/**
 * The `items.create` arguments for a shared X post. With a resolved post they
 * equal what the Firefox extension sends for the same post; without one (or
 * with a post that has neither text nor images) only the link is saved.
 */
export function buildClip(
  ref: ShareRef,
  post: ResolvedPost | null,
): ClipResult {
  const handle = post?.handle ?? ref.handle;
  const base = {
    originalInput: `https://x.com/${handle}/status/${ref.id}`,
    inputType: "url",
    captureSource: "mobile",
    captureKey: `x:${ref.id}`,
  } as const;

  if (!post) {
    return {
      args: { ...base, sourceMetadata: { siteName: "X" } },
      linkOnly: true,
    };
  }
  if (post.text.length > TEXT_LIMIT) throw new ClipTooLargeError();

  const sourceMetadata = {
    title: `${post.author} (@${post.handle})`.slice(0, TITLE_LIMIT),
    author: post.handle,
    siteName: "X",
  };
  if (!post.text && post.images.length === 0)
    return { args: { ...base, sourceMetadata }, linkOnly: true };

  return {
    args: {
      ...base,
      sourceMetadata,
      extractedText: post.text,
      imageAssets: post.images.map((url) => ({
        kind: "external",
        url,
        purpose: "image",
      })),
    },
    linkOnly: false,
  };
}
