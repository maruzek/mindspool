import type { FunctionArgs } from "convex/server";
import type { api } from "@mindspool/backend/api";
import type { RedditCommentInput, RedditPostInput } from "@mindspool/schema";

export type ClipRedditArgs = FunctionArgs<typeof api.items.clipReddit>;

export function buildRedditClip(
  post: RedditPostInput,
  comments: RedditCommentInput[] = [],
): ClipRedditArgs {
  return {
    post: { ...post, images: [...post.images] },
    comments: comments.map((comment) => ({ ...comment })),
  };
}
