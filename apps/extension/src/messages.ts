import type { ClipArgs } from "./clip";
import type { ClipRedditArgs } from "./redditClip";

export type ClipRequest = { type: "clip"; args: ClipArgs };
export type RedditClipRequest = { type: "clip-reddit"; args: ClipRedditArgs };
export type CaptureRequest = ClipRequest | RedditClipRequest;

export type ClipFailure = "signed_out" | "invalid" | "network" | "unknown";

export type ClipResponse =
  | { ok: true; itemId: string; addedCommentCount?: number }
  | { ok: false; reason: ClipFailure; hint?: "content_too_large" };

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const optionalText = (value: unknown) =>
  value === undefined || typeof value === "string";

export function isClipRequest(message: unknown): message is CaptureRequest {
  if (!record(message) || !record(message.args)) return false;
  const args = message.args;
  if (message.type === "clip-reddit") {
    const post = args.post;
    return (
      record(post) &&
      typeof post.id === "string" &&
      typeof post.title === "string" &&
      typeof post.text === "string" &&
      optionalText(post.author) &&
      optionalText(post.subreddit) &&
      optionalText(post.outboundUrl) &&
      Array.isArray(post.images) &&
      post.images.every((image) => typeof image === "string") &&
      Array.isArray(args.comments) &&
      args.comments.every(
        (comment) =>
          record(comment) &&
          typeof comment.id === "string" &&
          typeof comment.postId === "string" &&
          typeof comment.text === "string" &&
          optionalText(comment.author),
      )
    );
  }
  return (
    message.type === "clip" &&
    typeof args.originalInput === "string" &&
    typeof args.captureKey === "string" &&
    ["url", "text"].includes(args.inputType as string) &&
    ["web", "mobile", "extension"].includes(args.captureSource as string) &&
    optionalText(args.extractedText) &&
    (args.sourceMetadata === undefined ||
      (record(args.sourceMetadata) &&
        ["title", "author", "description", "siteName"].every((key) =>
          optionalText((args.sourceMetadata as Record<string, unknown>)[key]),
        ))) &&
    (args.imageAssets === undefined ||
      (Array.isArray(args.imageAssets) &&
        args.imageAssets.every(
          (image) =>
            record(image) &&
            image.kind === "external" &&
            typeof image.url === "string" &&
            ["image", "screenshot", "thumbnail"].includes(
              image.purpose as string,
            ),
        )))
  );
}
