import {
  normalizeRedditId,
  redditIdentityFromUrl,
  REDDIT_TEXT_LIMIT,
} from "@mindspool/schema";
import type { RedditCommentInput } from "@mindspool/schema";
import { isReadable, readPlainText, redditAuthor } from "./reddit";

/** One loaded comment's own snapshot; ancestors and replies are independent. */
export function parseRedditComment(
  comment: Element,
  currentPostId: string,
): RedditCommentInput | null {
  if (comment.tagName !== "SHREDDIT-COMMENT" || !isReadable(comment))
    return null;
  const postId = normalizeRedditId(currentPostId, "post");
  const id = normalizeRedditId(
    comment.getAttribute("thingid") ?? "",
    "comment",
  );
  const declaredPost = normalizeRedditId(
    comment.getAttribute("postid") ?? "",
    "post",
  );
  const permalink = comment.getAttribute("permalink");
  const identity = permalink && redditIdentityFromUrl(permalink);
  if (
    !postId ||
    !id ||
    declaredPost !== postId ||
    !identity ||
    identity.postId !== postId ||
    identity.commentId !== id
  )
    return null;
  const body = [...comment.querySelectorAll('[slot="comment"]')].find(
    (node) => node.closest("shreddit-comment") === comment && isReadable(node),
  );
  const text = body && readPlainText(body);
  const author = redditAuthor(comment.getAttribute("author"));
  if (
    !text ||
    ["[deleted]", "[removed]"].includes(text.trim()) ||
    text.length > REDDIT_TEXT_LIMIT ||
    (author?.length ?? 0) > 300
  )
    return null;
  return { id, postId, text, ...(author ? { author } : {}) };
}
