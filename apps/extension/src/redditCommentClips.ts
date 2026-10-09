import { normalizeRedditId } from "@mindspool/schema";
import type { RedditCommentInput, RedditPostInput } from "@mindspool/schema";
import { buildRedditClip } from "./redditClip";
import type { ClipRedditArgs } from "./redditClip";

export type CommentClipRequest = {
  generation: number;
  commentId: string;
  args: ClipRedditArgs;
};
type CommentState = {
  text: string;
  pending?: CommentClipRequest;
  retry?: ClipRedditArgs;
  succeeded: boolean;
};

/** Visit-scoped snapshots outlive DOM controls, but never a navigation generation. */
export class RedditCommentClips {
  private currentPost: string | null = null;
  private navigationGeneration = 0;
  private comments = new Map<string, CommentState>();

  get postId() {
    return this.currentPost;
  }
  get generation() {
    return this.navigationGeneration;
  }

  navigate(postId: string | null): void {
    const next = postId === null ? null : normalizeRedditId(postId, "post");
    if (next === this.currentPost) return;
    this.currentPost = next;
    this.navigationGeneration++;
    this.comments.clear();
  }

  status(id: string): { text: string; disabled: boolean } {
    const state = this.comments.get(id);
    return {
      text: state?.text ?? "Clip",
      disabled: Boolean(state?.pending || state?.succeeded),
    };
  }

  begin(
    post: RedditPostInput | null,
    comment: RedditCommentInput,
  ): CommentClipRequest | null {
    const id = normalizeRedditId(comment.id, "comment");
    if (
      !this.currentPost ||
      !id ||
      normalizeRedditId(comment.postId, "post") !== this.currentPost ||
      !comment.text.trim()
    )
      return null;
    const state = this.comments.get(id);
    if (state?.pending || state?.succeeded) return null;
    if (
      !state?.retry &&
      (!post || normalizeRedditId(post.id, "post") !== this.currentPost)
    )
      return null;
    const args = state?.retry ?? buildRedditClip(post!, [comment]);
    Object.freeze(args.post.images);
    Object.freeze(args.post);
    args.comments.forEach(Object.freeze);
    Object.freeze(args.comments);
    Object.freeze(args);
    const request = { generation: this.generation, commentId: id, args };
    this.comments.set(id, {
      text: "Clipping…",
      pending: request,
      succeeded: false,
    });
    return request;
  }

  finish(
    request: CommentClipRequest,
    succeeded: boolean,
    feedback = "Something went wrong",
  ): boolean {
    const state = this.comments.get(request.commentId);
    if (request.generation !== this.generation || state?.pending !== request)
      return false;
    this.comments.set(request.commentId, {
      succeeded,
      text: succeeded ? "Clipped" : feedback,
      retry: succeeded ? undefined : request.args,
    });
    return true;
  }

  resetFeedback(id: string, generation: number): void {
    const state = this.comments.get(id);
    if (
      generation === this.generation &&
      state &&
      !state.pending &&
      !state.succeeded
    )
      state.text = "Clip";
  }
}
