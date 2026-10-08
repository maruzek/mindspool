export const REDDIT_ID_MAX_LENGTH = 32;
export const REDDIT_SELECTION_LIMIT = 20;
export const REDDIT_TEXT_LIMIT = 100_000;
export const REDDIT_ITEM_BYTES_LIMIT = 900 * 1024;

export type RedditPostInput = {
  id: string;
  title: string;
  author?: string;
  subreddit?: string;
  text: string;
  outboundUrl?: string;
  images: string[];
};

export type RedditCommentInput = {
  id: string;
  postId: string;
  author?: string;
  text: string;
};

export type RedditCommentSnapshot = {
  commentId: string;
  postId: string;
  permalink: string;
  author?: string;
  text: string;
  capturedAt: number;
};

export type RedditCapture = {
  postId: string;
  postText: string;
  outboundUrl?: string;
  comments: RedditCommentSnapshot[];
};

export function normalizeRedditId(
  value: string,
  kind: "post" | "comment",
): string | null {
  const lower = value.toLowerCase();
  const prefix = kind === "post" ? "t3_" : "t1_";
  const id = lower.startsWith(prefix) ? lower.slice(3) : lower;
  return id.length <= REDDIT_ID_MAX_LENGTH && /^[a-z0-9]+$/.test(id)
    ? id
    : null;
}

export function redditIdentityFromUrl(
  input: string,
): { postId: string; commentId?: string } | null {
  let url: URL;
  try {
    url = new URL(input, "https://www.reddit.com");
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["reddit.com", "www.reddit.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    return null;
  const match =
    /^\/(?:r\/[a-z0-9_]+\/)?comments\/([a-z0-9]+)(?:\/([^/]+))?(?:\/([a-z0-9]+))?\/?$/i.exec(
      url.pathname,
    );
  const postId = match?.[1] && normalizeRedditId(match[1], "post");
  if (!postId) return null;
  if (match?.[3]) {
    const commentId = normalizeRedditId(match[3], "comment");
    return commentId ? { postId, commentId } : null;
  }
  return { postId };
}

function requireId(value: string, kind: "post" | "comment"): string {
  const id = normalizeRedditId(value, kind);
  if (!id) throw new Error("Invalid Reddit identity");
  return id;
}

export const redditCaptureKey = (id: string): string =>
  `reddit:${requireId(id, "post")}`;

export const redditPostUrl = (id: string): string =>
  `https://www.reddit.com/comments/${requireId(id, "post")}/`;

export const redditCommentUrl = (postId: string, commentId: string): string =>
  `${redditPostUrl(postId)}_/${requireId(commentId, "comment")}/`;

/** Plain-text projection shared by persistence and current search/AI consumers. */
export function renderRedditCapture(capture: RedditCapture): string {
  const post = [capture.postText, capture.outboundUrl]
    .filter(Boolean)
    .join("\n\n");
  const parts = post ? [`Post\n\n${post}`] : [];
  if (capture.comments.length) {
    parts.push(
      `Selected comments\n\n${capture.comments
        .map(
          (comment) =>
            `${comment.author || "Comment"}\n${comment.text}\n${comment.permalink}`,
        )
        .join("\n\n")}`,
    );
  }
  return parts.join("\n\n");
}
