import type { FunctionArgs } from "convex/server";
import type { api } from "@mindspool/backend/api";
import type { Tweet } from "./tweet";

export type ClipArgs = FunctionArgs<typeof api.items.create>;

export function buildClip(tweet: Tweet): ClipArgs {
  return {
    originalInput: tweet.url,
    inputType: "url",
    captureSource: "extension",
    captureKey: `x:${tweet.id}`,
    sourceMetadata: {
      title: `${tweet.author} (@${tweet.handle})`,
      author: tweet.handle,
      siteName: "X",
    },
    extractedText: tweet.text,
    imageAssets: tweet.images.map((url) => ({
      kind: "external",
      url,
      purpose: "image",
    })),
  };
}
