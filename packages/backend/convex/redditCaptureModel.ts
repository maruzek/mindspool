import { ConvexError, convexToJson, getDocumentSize } from "convex/values";
import type { Value } from "convex/values";
import {
  normalizeRedditId,
  redditCommentUrl,
  REDDIT_ITEM_BYTES_LIMIT,
  REDDIT_SELECTION_LIMIT,
  REDDIT_TEXT_LIMIT,
  renderRedditCapture,
} from "../../schema/src/reddit";
import type {
  RedditCapture,
  RedditCommentInput,
  RedditPostInput,
} from "../../schema/src/reddit";
import { buildSearchText } from "./itemState";
import { validateClipContent, validateUrl } from "./validators";

const invalid = () =>
  new ConvexError({ code: "INVALID_INPUT", message: "Invalid Reddit capture" });
const tooLarge = () =>
  new ConvexError({
    code: "INVALID_INPUT",
    hint: "content_too_large",
    message: "Selection too large",
  });

export function prepareRedditCapture(
  post: RedditPostInput,
  comments: RedditCommentInput[],
  now: number,
) {
  const postId = normalizeRedditId(post.id, "post");
  if (!postId || !post.title.trim() || comments.length > REDDIT_SELECTION_LIMIT)
    throw invalid();
  if (post.text.length > REDDIT_TEXT_LIMIT) throw tooLarge();
  if (post.outboundUrl !== undefined) validateUrl(post.outboundUrl);
  const sourceMetadata = {
    title: post.title.trim(),
    siteName: "Reddit",
    ...(post.author !== undefined ? { author: post.author } : {}),
    ...(post.subreddit !== undefined
      ? { description: `r/${post.subreddit}` }
      : {}),
  };
  const imageAssets = post.images.map((url) => ({
    kind: "external" as const,
    url,
    purpose: "image" as const,
  }));
  validateClipContent({ sourceMetadata, imageAssets });
  const seen = new Set<string>();
  const snapshots: RedditCapture["comments"] = [];
  for (const comment of comments) {
    const commentId = normalizeRedditId(comment.id, "comment");
    if (
      !commentId ||
      normalizeRedditId(comment.postId, "post") !== postId ||
      !comment.text.trim() ||
      (comment.author?.length ?? 0) > 300
    )
      throw invalid();
    if (comment.text.length > REDDIT_TEXT_LIMIT) throw tooLarge();
    if (seen.has(commentId)) continue;
    seen.add(commentId);
    snapshots.push({
      commentId,
      postId,
      permalink: redditCommentUrl(postId, commentId),
      ...(comment.author !== undefined ? { author: comment.author } : {}),
      text: comment.text,
      capturedAt: now,
    });
  }
  const capture: RedditCapture = {
    postId,
    postText: post.text,
    ...(post.outboundUrl !== undefined
      ? { outboundUrl: post.outboundUrl }
      : {}),
    comments: snapshots,
  };
  return {
    capture,
    sourceMetadata,
    imageAssets: imageAssets.filter(
      (image, index) => post.images.indexOf(image.url) === index,
    ),
  };
}

export function redditExtractedText(capture: RedditCapture) {
  const text = renderRedditCapture(capture);
  if (text.length > REDDIT_TEXT_LIMIT) throw tooLarge();
  return text;
}

/** Check both installed Convex document accounting and its serialized UTF-8 representation. */
export function validateRedditItemSize(
  item: Record<string, Value> & {
    originalInput: string;
    extractedText?: string;
  },
) {
  // These fields are written by refreshItemState after insertion/merge. Include
  // conservative flag values even when an older document has no flags yet.
  const next = {
    ...item,
    searchText: buildSearchText(item),
    sourceKind: "reddit",
    inbox: true,
    needsReview: true,
  };
  const serializedBytes = new TextEncoder().encode(
    JSON.stringify(convexToJson(next)),
  ).byteLength;
  if (
    Math.max(serializedBytes, getDocumentSize(next)) > REDDIT_ITEM_BYTES_LIMIT
  )
    throw tooLarge();
}
