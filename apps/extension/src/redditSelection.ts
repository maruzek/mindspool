import { normalizeRedditId, REDDIT_SELECTION_LIMIT } from "@mindspool/schema";
import type { RedditCommentInput, RedditPostInput } from "@mindspool/schema";
import { buildRedditClip } from "./redditClip";
import type { ClipRedditArgs } from "./redditClip";

export type FrozenRedditRequest = { generation: number; args: ClipRedditArgs };

/** Local snapshots only. Navigation and async completion share an explicit generation. */
export class RedditSelection {
  private currentPost: string | null = null;
  private navigationGeneration = 0;
  private comments = new Map<string, RedditCommentInput>();
  private pending: FrozenRedditRequest | undefined;
  private retry: ClipRedditArgs | undefined;

  get postId(): string | null {
    return this.currentPost;
  }
  get generation(): number {
    return this.navigationGeneration;
  }
  get count(): number {
    return this.comments.size;
  }
  get isBusy(): boolean {
    return this.pending !== undefined;
  }

  navigate(postId: string | null): void {
    const normalized =
      postId === null ? null : normalizeRedditId(postId, "post");
    if (normalized === this.currentPost) return;
    this.currentPost = normalized;
    this.navigationGeneration++;
    this.comments.clear();
    this.pending = undefined;
    this.retry = undefined;
  }

  selected(): RedditCommentInput[] {
    return [...this.comments.values()].map((comment) => ({ ...comment }));
  }
  has(id: string): boolean {
    return this.comments.has(id);
  }

  toggle(
    comment: RedditCommentInput,
    keep: boolean,
  ): "kept" | "removed" | "limit" | "busy" | "invalid" {
    if (this.isBusy) return "busy";
    const id = normalizeRedditId(comment.id, "comment");
    if (
      !this.currentPost ||
      !id ||
      normalizeRedditId(comment.postId, "post") !== this.currentPost ||
      !comment.text.trim()
    )
      return "invalid";
    if (!keep) {
      if (this.comments.delete(id)) this.retry = undefined;
      return "removed";
    }
    if (this.comments.has(id)) return "kept";
    if (this.count >= REDDIT_SELECTION_LIMIT) return "limit";
    this.comments.set(id, { ...comment, id, postId: this.currentPost! });
    this.retry = undefined;
    return "kept";
  }

  begin(post: RedditPostInput): FrozenRedditRequest | null {
    if (
      !this.currentPost ||
      this.isBusy ||
      normalizeRedditId(post.id, "post") !== this.currentPost
    )
      return null;
    const args = this.retry ?? buildRedditClip(post, this.selected());
    Object.freeze(args.post.images);
    Object.freeze(args.post);
    args.comments.forEach(Object.freeze);
    Object.freeze(args.comments);
    Object.freeze(args);
    this.pending = { generation: this.navigationGeneration, args };
    return this.pending;
  }

  /** Returns false for a request whose controls/selection no longer belong to this page. */
  finish(request: FrozenRedditRequest, succeeded: boolean): boolean {
    if (
      request.generation !== this.navigationGeneration ||
      this.pending !== request
    )
      return false;
    this.pending = undefined;
    if (succeeded) {
      this.comments.clear();
      this.retry = undefined;
    } else this.retry = request.args;
    return true;
  }
}
